/** The key target of `msgpackr`: the name of an `Error` that `pack` and `unpack` of the option `moreTypes` carry. */
import { Packr, Unpackr } from "msgpackr";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { KeyTarget } from "./target.ts";

/** The package and the version of the target. The version is the version that the workspace installs. */
export const MSGPACKR = { package: "msgpackr", version: "2.1.4" } as const;

/** The key target of the names of errors: an `Error` with the name `key` and the message `boom`, packed and unpacked. */
export const msgpackrErrorNameTarget: KeyTarget = {
  id: "msgpackr/error-name",
  ...MSGPACKR,
  table: "error or code name",
  phase: "open",
  run: (key): Promise<Outcome> =>
    outcomeOf(() => {
      const error = new Error("boom");
      error.name = key;
      const back: unknown = new Unpackr({ moreTypes: true }).unpack(new Packr({ moreTypes: true }).pack(error));
      if (!(back instanceof Error)) return Promise.resolve([`not an Error: ${Object.prototype.toString.call(back)}`]);
      return Promise.resolve([`Error ${back.constructor.name}`, `name ${back.name}`, `message ${back.message}`]);
    }, 5_000),
};
