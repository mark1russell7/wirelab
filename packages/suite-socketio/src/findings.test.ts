// The checks that show known faults of socket.io-client 4.8.4. Each test is `it.fails` with a comment `// client bug:`
// and the identifier of the finding in the catalog. The test passes while the fault stays. When a release of the client
// removes the fault, the test fails. Then change it to `it`, and move the check to `protocol.test.ts`.
import { defaultHandshake, openPacket, pause, payload, until } from "@wirelab/suite-engineio";
import { afterEach, describe, expect, it } from "vitest";
import { placeholder } from "./codec.ts";
import {
  answerMs,
  connectMain,
  connectReply,
  framesOf,
  handshakes,
  sioReply,
  startSioSession,
  suiteEnabled,
  transports,
  type PollingTransport,
  type SioFrame,
  type SioSession,
} from "./harness.ts";

const sessions: SioSession[] = [];

async function session(...parts: Parameters<typeof startSioSession>): Promise<SioSession> {
  const started = await startSioSession(...parts);
  sessions.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((item) => item.end()));
});

/** This function writes a line of evidence to the log. The record of a CI job keeps it. */
function evidence(text: string): void {
  console.info(`client bug evidence: ${text}`);
}

/** The private session ID of the recovery of the connection state. */
const recoveryPid = "pid-1";

/** The offset of the last event of the server that has an offset. */
const recoveryOffset = "offset-1";

/**
 * This function starts a session with the recovery of the connection state. The server sends an event with an offset,
 * then the event `last` with no offset, and then it closes. The client reconnects. The function gives the payload of the
 * second `CONNECT` packet of the client. When the session does not get to that packet, it writes a line `harness fault`
 * and gives `undefined`.
 */
async function reconnectPayload(transport: PollingTransport, last: readonly unknown[]): Promise<unknown> {
  try {
    return await reconnect(transport, last);
  } catch (error) {
    console.info(`harness fault: F0066 ${transport.name}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** This function is the body of `reconnectPayload`. An error of the harness goes out of it as an exception. */
async function reconnect(transport: PollingTransport, last: readonly unknown[]): Promise<unknown> {
  const s = await session(
    transport,
    {
      polls: [
        sioReply([{ type: "CONNECT", nsp: "/", data: { sid: "sid-main", pid: recoveryPid } }], { delayMs: answerMs }),
        sioReply(
          [
            { type: "EVENT", nsp: "/", data: ["news", { n: 1 }, recoveryOffset] },
            { type: "EVENT", nsp: "/", data: last },
          ],
          { delayMs: answerMs },
        ),
        payload([{ type: "close", data: "" }], { delayMs: answerMs }),
        payload([openPacket(defaultHandshake)]),
      ],
    },
    { reconnection: true, reconnectionDelay: 50, reconnectionDelayMax: 50, randomizationFactor: 0 },
  );
  s.socket("/");
  await s.next("connect");
  const connects = (): readonly SioFrame[] => framesOf(s.posted(), "CONNECT");
  const received = await until(() => s.eventsOf("/").filter((event) => event.kind === "event").length >= 2, 3_000);
  const reconnected = await until(() => connects().length >= 2, 3_000);
  if (!received || !reconnected) {
    console.info(`harness fault: F0066 ${transport.name}: the client got the 2 events: ${String(received)}, and it sent a second CONNECT: ${String(reconnected)}`);
    return undefined;
  }
  return connects()[1]?.packet.data;
}

describe.runIf(suiteEnabled)("socket.io-client over HTTP long-polling", () => {
  describe.each(transports)("$name", (transport) => {
    // client bug: F0058. disconnect() before the CONNECT reply of a namespace sends no DISCONNECT packet. The client then
    // ignores the CONNECT reply, thus the server keeps a socket of the namespace that no client uses.
    it.fails("disconnect-during-connect: [SIO5-DC-1] after disconnect() during the handshake of /foo, the client sends 41/foo,", async () => {
      const s = await session(transport, { polls: [connectMain(), sioReply([connectReply("sid-foo", "/foo")], { delayMs: 300 })] });
      s.socket("/");
      await s.next("connect");
      const foo = s.socket("/foo");
      expect(await until(() => framesOf(s.posted(), "CONNECT", "/foo").length > 0, 2_000)).toBe(true);
      foo.disconnect();
      // The fourth GET request starts after the client reads the CONNECT reply of /foo in the third.
      expect(await until(() => s.gets().length >= 4, 2_000)).toBe(true);
      await pause(500);
      const sent = framesOf(s.posted(), "DISCONNECT", "/foo");
      evidence(`F0058 ${transport.name}: ${sent.length} DISCONNECT packets of /foo, 500 ms after the CONNECT reply of /foo`);
      expect(sent.length).toBeGreaterThan(0);
    });

    // client bug: F0064. With retries and no ackTimeout, the acknowledgement callback has no error argument. Thus the
    // client takes the first argument "ok" as an error, and it sends the event again.
    it.fails("retries-without-ack-timeout: [SIO5-AK-1] with retries 1, the ACK of the event gives the callback (null, ok), with one send", async () => {
      const s = await session(transport, {
        polls: [
          connectMain(),
          sioReply([{ type: "ACK", nsp: "/", id: 0, data: ["ok"] }], { delayMs: 300 }),
          sioReply([{ type: "ACK", nsp: "/", id: 1, data: ["ok"] }], { delayMs: 300 }),
        ],
      });
      const socket = s.socket("/", { retries: 1 });
      const replies: unknown[][] = [];
      socket.emit("e", (...args: unknown[]) => {
        replies.push(args);
      });
      await s.next("connect");
      await until(() => replies.length > 0, 2_000);
      await pause(300);
      const sent = framesOf(s.posted(), "EVENT");
      evidence(`F0064 ${transport.name}: ${sent.length} EVENT packets of the event e, and the callback got ${JSON.stringify(replies)}`);
      expect(sent).toHaveLength(1);
      expect(replies).toEqual([[null, "ok"]]);
    });

    // client bug: F0067. The Manager makes its decoder with the default limit of 10 attachments. The server has no
    // limit, thus an event with 11 buffers gives a parse error.
    it.fails("eleven-attachments: [SIO5-PE-3] a BINARY_EVENT packet with 11 attachments gives an event with 11 buffers", async () => {
      const bytes = Array.from({ length: 11 }, (_, index) => new Uint8Array([index]));
      const big: SioFrame = {
        packet: { type: "BINARY_EVENT", nsp: "/", attachments: 11, data: ["big", ...bytes.map((_, index) => placeholder(index))] },
        attachments: bytes,
      };
      const s = await session(transport, { polls: [connectMain(), sioReply([big], { delayMs: answerMs })] });
      s.socket("/");
      await s.next("connect");
      await until(() => s.eventsOf("/").some((event) => event.kind === "event" || event.kind === "disconnect"), 2_000);
      const event = s.eventsOf("/").find((item) => item.kind === "event");
      const lost = s.eventsOf("/").find((item) => item.kind === "disconnect");
      evidence(
        `F0067 ${transport.name}: ${event === undefined ? "no event" : `the event ${event.detail} with ${event.args.length} arguments`}, ${lost === undefined ? "no disconnect" : `a disconnect (${lost.detail})`}`,
      );
      expect(event?.args).toEqual(bytes);
    });

    // client bug: F0055. The client drops a volatile event only when the transport is not writable. During the handshake
    // of a namespace the transport is writable, thus the event goes to the buffer and out after the connection.
    it.fails("volatile-before-connect: a volatile event emitted before the connection of /delayed is dropped", async () => {
      const s = await session(transport, { polls: [connectMain(), sioReply([connectReply("sid-delayed", "/delayed")], { delayMs: 800 })] });
      s.socket("/");
      await s.next("connect");
      const delayed = s.socket("/delayed");
      expect(await until(() => framesOf(s.posted(), "CONNECT", "/delayed").length > 0 && s.manager.engine.transport.writable, 2_000)).toBe(true);
      delayed.volatile.emit("e");
      await s.next("connect", "/delayed");
      await pause(300);
      const sent = framesOf(s.posted(), "EVENT", "/delayed");
      evidence(`F0055 ${transport.name}: ${sent.length} EVENT packets of /delayed after its connection, for a volatile emit before it`);
      expect(sent).toEqual([]);
    });

    // client bug: F0057. connect() during the handshake of a namespace sends the CONNECT packet again, because the client
    // examines only the state of the Engine.IO connection.
    it.fails("second-connect: connect() during the handshake of the main namespace sends no second CONNECT packet", async () => {
      const s = await session(transport, { polls: [sioReply([connectReply("sid-main")], { delayMs: 500 })] });
      const socket = s.socket("/");
      expect(await until(() => framesOf(s.posted(), "CONNECT").length > 0, 2_000)).toBe(true);
      socket.connect();
      await s.next("connect");
      await pause(300);
      const connects = framesOf(s.posted(), "CONNECT");
      evidence(`F0057 ${transport.name}: ${connects.length} CONNECT packets of the main namespace`);
      expect(connects).toHaveLength(1);
    });

    // client bug: F0059. The constructor of the Manager uses || for reconnectionAttempts, thus 0 becomes Infinity.
    it.fails("reconnection-attempts-zero: with reconnectionAttempts 0, a close of the server gives no new handshake", async () => {
      const s = await session(
        transport,
        { polls: [connectMain(), payload([{ type: "close", data: "" }], { delayMs: answerMs })] },
        { reconnection: true, reconnectionAttempts: 0, reconnectionDelay: 50, reconnectionDelayMax: 50, randomizationFactor: 0 },
      );
      s.socket("/");
      await s.next("connect");
      await s.next("disconnect");
      await pause(1_000);
      const opens = handshakes(s.gets());
      evidence(`F0059 ${transport.name}: ${opens.length} handshake GET requests in 1000 ms after the close, with reconnectionAttempts 0`);
      expect(opens).toHaveLength(1);
    });

    // client bug: F0060. The client sets recovered to `pid && this._pid === pid`. With no pid, the value is undefined.
    it.fails("recovered-false: after a CONNECT packet with no pid, socket.recovered is false", async () => {
      const s = await session(transport, { polls: [connectMain()] });
      const socket = s.socket("/");
      await s.next("connect");
      evidence(`F0060 ${transport.name}: socket.recovered is ${String(socket.recovered)} after a CONNECT packet with no pid`);
      expect(socket.recovered).toBe(false);
    });

    // client bug: F0066. With a pid, the client takes the last argument of each event as the offset when it is a string.
    // An event with no offset, for example a volatile event, thus changes the offset of the next CONNECT packet. The commit
    // f97d51a of socketio/socket.io removes this case for an event with only its name. No release has that commit.
    it.fails("offset-event-name: after an event with only its name, the CONNECT of the reconnection has the last offset", async () => {
      const data = await reconnectPayload(transport, ["ping"]);
      if (data === undefined) return;
      evidence(`F0066 ${transport.name}: after the events ["news",{"n":1},"${recoveryOffset}"] and ["ping"], the CONNECT of the reconnection has ${JSON.stringify(data)}`);
      expect(data).toEqual({ pid: recoveryPid, offset: recoveryOffset });
    });

    // client bug: F0066. The same fault for an event with a string as its last argument. The main branch of
    // socketio/socket.io keeps this case, because the format of an offset depends on the adapter of the server.
    it.fails("offset-string-argument: after an event with a string as its last argument, the CONNECT of the reconnection has the last offset", async () => {
      const data = await reconnectPayload(transport, ["ticker", "hello"]);
      if (data === undefined) return;
      evidence(`F0066 ${transport.name}: after the events ["news",{"n":1},"${recoveryOffset}"] and ["ticker","hello"], the CONNECT of the reconnection has ${JSON.stringify(data)}`);
      expect(data).toEqual({ pid: recoveryPid, offset: recoveryOffset });
    });
  });
});
