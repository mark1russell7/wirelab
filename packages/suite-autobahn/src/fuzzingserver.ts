import { readFile } from "node:fs/promises";
import path from "node:path";
import Ws from "ws";

/**
 * The URL of the Autobahn fuzzing server. The suite operates only when the environment variable `AUTOBAHN_URL` has a
 * value.
 */
export const fuzzingServerUrl: string | undefined = process.env["AUTOBAHN_URL"] || undefined;

/**
 * The folder that holds the `clients` folder of the reports of the fuzzing server. The environment variable
 * `AUTOBAHN_REPORTS` gives it. Without it, the suite does not examine the close behavior of the cases.
 */
export const reportsFolder: string | undefined = process.env["AUTOBAHN_REPORTS"] || undefined;

/**
 * The results that the fuzzing server gives to a case that passes. `NON-STRICT` is a pass with a note. `UNIMPLEMENTED`
 * is an optional feature that the client does not offer, for example `permessage-deflate`.
 */
export const passingBehaviors: readonly string[] = ["OK", "NON-STRICT", "INFORMATIONAL", "UNIMPLEMENTED"];

/**
 * This function gives the time limit in seconds of the fuzzing server for the case `id`. It gives `undefined` when the
 * server has no limit for the case.
 *
 * Only the `permessage-deflate` cases `12.*` and `13.*` have a limit. The table `MSG_SIZES` in `case12_x_x.py` of the
 * server gives the limit from the last number of the identifier. The reports of the server tell the same limit in the
 * expectation of each case.
 */
export function serverTimeLimitSeconds(id: string): number | undefined {
  const match = /^1[23]\.\d+\.(\d+)$/.exec(id);
  if (match === null) return undefined;
  const last = Number(match[1]);
  if (last <= 2) return 60;
  if (last === 3) return 120;
  if (last === 4) return 240;
  return 480;
}

/**
 * The time limit of a case that has no limit of the server. The slowest of these cases wait 2 seconds for the client.
 */
export const defaultCaseTimeLimitMs = 20_000;

/** The time that the client waits after the limit of the server. At its limit, the server closes the connection. */
const serverLimitMarginMs = 10_000;

/**
 * This function gives the time limit in milliseconds of one echo session for the case `id`. A client stops a session
 * only after the server stops it. Thus the result of a slow case comes from the server.
 */
export function caseTimeLimitMs(id: string): number {
  const server = serverTimeLimitSeconds(id);
  return server === undefined ? defaultCaseTimeLimitMs : server * 1000 + serverLimitMarginMs;
}

/**
 * This function reads the time limit in seconds from the expectation of a case report, for example "Timeout case after
 * 480 secs.". It gives `undefined` when the expectation tells no limit.
 */
export function expectationTimeLimitSeconds(expectation: string): number | undefined {
  const match = /Timeout case after (\d+) secs/.exec(expectation);
  return match === null ? undefined : Number(match[1]);
}

/** One case of the fuzzing server. */
export interface FuzzingCase {
  /** The number of the case in the API of the server. The first case has the number 1. */
  readonly index: number;
  /** The identifier of the case in the reports, for example `6.4.1`. */
  readonly id: string;
  /** The description of the case from the server. */
  readonly description: string;
}

/** The result of one case for one agent in the file `clients/index.json` of the reports. */
export interface CaseReport {
  /** The result of the frames and messages of the case. */
  readonly behavior: string;
  /** The result of the closing handshake of the case. */
  readonly behaviorClose: string;
  /** The close code that the client sent, or `null` when it sent none. */
  readonly remoteCloseCode: number | null;
  /** The name of the report file of the case. */
  readonly reportfile: string;
}

function text(data: Ws.RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  return Buffer.from(data).toString("utf8");
}

/**
 * This function opens a control connection to `url` and resolves with the last text message when the server closes it.
 * The server sends one text message or none. The function rejects when the server does not close in `timeoutMs`.
 */
async function control(url: string, timeoutMs = 10_000): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const socket = new Ws(url);
    let message: string | undefined;
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`The fuzzing server did not close ${url} in ${timeoutMs} ms.`));
    }, timeoutMs);
    socket.on("message", (data, isBinary) => {
      if (!isBinary) message = text(data);
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

function agentQuery(agent: string): string {
  return `agent=${encodeURIComponent(agent)}`;
}

/** This function gives the URL of the connection that runs the case `index` for the client `agent`. */
export function caseUrl(base: string, index: number, agent: string): string {
  return `${base}/runCase?case=${index}&${agentQuery(agent)}`;
}

/** This function reads the number, the identifier and the description of each case of the server at `base`. */
export async function listCases(base: string): Promise<FuzzingCase[]> {
  const count = Number(await control(`${base}/getCaseCount`));
  if (!Number.isInteger(count) || count < 1) throw new Error(`The fuzzing server at ${base} gave no case count.`);
  const cases: FuzzingCase[] = [];
  for (let index = 1; index <= count; index += 1) {
    const info = JSON.parse((await control(`${base}/getCaseInfo?case=${index}`)) ?? "null") as {
      id?: unknown;
      description?: unknown;
    } | null;
    if (typeof info?.id !== "string") throw new Error(`The fuzzing server gave no identifier for the case ${index}.`);
    cases.push({ index, id: info.id, description: typeof info.description === "string" ? info.description : "" });
  }
  return cases;
}

/** This function reads the behavior that the server recorded for the case `index` and the client `agent`. */
export async function caseBehavior(base: string, index: number, agent: string): Promise<string> {
  const answer = await control(`${base}/getCaseStatus?case=${index}&${agentQuery(agent)}`);
  const status = JSON.parse(answer ?? "null") as {
    behavior?: unknown;
  } | null;
  if (typeof status?.behavior !== "string") throw new Error(`The fuzzing server gave no behavior for the case ${index}.`);
  return status.behavior;
}

/** This function tells the server to write the reports of the client `agent`. */
export async function updateReports(base: string, agent: string): Promise<void> {
  await control(`${base}/updateReports?${agentQuery(agent)}`, 60_000);
}

/** This function reads the results of the client `agent` from `clients/index.json` in the folder `folder`. */
export async function readCaseReports(folder: string, agent: string): Promise<Record<string, CaseReport>> {
  const index = JSON.parse(await readFile(path.join(folder, "clients", "index.json"), "utf8")) as Record<
    string,
    Record<string, CaseReport>
  >;
  const reports = index[agent];
  if (reports === undefined) throw new Error(`The reports in ${folder} have no results of the agent ${agent}.`);
  return reports;
}

/** This function reads the expectation from the report file `reportfile` in the folder `folder`. */
export async function readCaseExpectation(folder: string, reportfile: string): Promise<string> {
  const file = path.join(folder, "clients", reportfile.replace(/\.html$/, ".json"));
  const report = JSON.parse(await readFile(file, "utf8")) as { expectation?: unknown };
  if (typeof report.expectation !== "string") throw new Error(`The report ${file} has no expectation.`);
  return report.expectation;
}
