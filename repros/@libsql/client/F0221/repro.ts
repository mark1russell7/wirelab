// Repro: @libsql/hrana-client 0.10.0 (the Hrana client of @libsql/client) reads
// StepEndEntry.last_insert_rowid as uint64. The Hrana 3 spec and the libsql
// server encode it as sint64 (zigzag), as StmtResult.last_insert_rowid.
//
// A fake Hrana 3 server on WebSocket (subprotocol hrana3-protobuf) sends
// last_insert_rowid = 5 in both messages. Stream.run() reads StmtResult, and a
// batch with a cursor reads StepEndEntry.
import * as hrana from "@libsql/hrana-client";
import { WebSocketServer, type WebSocket } from "ws";

// --- a minimal protobuf reader and writer --------------------------------
type Field = { num: number; wire: number; value: bigint | Uint8Array };

function readFields(buf: Uint8Array): Field[] {
  const fields: Field[] = [];
  let pos = 0;
  const varint = (): bigint => {
    let value = 0n;
    for (let shift = 0n; ; shift += 7n) {
      const byte = buf[pos++]!;
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
    }
  };
  while (pos < buf.length) {
    const key = Number(varint());
    const num = key >> 3;
    const wire = key & 7;
    if (wire === 0) fields.push({ num, wire, value: varint() });
    else if (wire === 2) {
      const len = Number(varint());
      fields.push({ num, wire, value: buf.subarray(pos, pos + len) });
      pos += len;
    } else throw new Error(`wire type ${wire} not used here`);
  }
  return fields;
}

function varintBytes(value: bigint): number[] {
  const out: number[] = [];
  do {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value !== 0n) byte |= 0x80;
    out.push(byte);
  } while (value !== 0n);
  return out;
}
const vint = (num: number, value: bigint): number[] => [...varintBytes(BigInt(num << 3)), ...varintBytes(value)];
const msg = (num: number, body: number[] = []): number[] => [...varintBytes(BigInt((num << 3) | 2)), ...varintBytes(BigInt(body.length)), ...body];
const zigzag = (n: bigint): bigint => (n << 1n) ^ (n >> 63n);

// --- the fake server -------------------------------------------------------
const ROWID = 5n;

function respond(ws: WebSocket, requestId: bigint, response: number[]): void {
  ws.send(Uint8Array.from(msg(3, [...vint(1, requestId), ...response])));
}

const cursorSteps = new Map<bigint, number>();
const wss = new WebSocketServer({ port: 0, handleProtocols: (protocols) => (protocols.has("hrana3-protobuf") ? "hrana3-protobuf" : false) });
wss.on("connection", (ws) => {
  ws.on("message", (data: Buffer) => {
    const [top] = readFields(data);
    if (top!.num === 1) { ws.send(Uint8Array.from(msg(1))); return; } // hello -> hello_ok
    const fields = readFields(top!.value as Uint8Array);
    const requestId = fields.find((f) => f.num === 1)!.value as bigint;
    const request = fields.find((f) => f.num !== 1)!;
    const body = readFields(request.value as Uint8Array);
    switch (request.num) {
      case 4: // execute -> StmtResult { affected_row_count = 1, last_insert_rowid = sint64 }
        respond(ws, requestId, msg(4, msg(1, [...vint(3, 1n), ...vint(4, zigzag(ROWID))])));
        break;
      case 6: { // open_cursor: count the steps of the batch
        const cursorId = body.find((f) => f.num === 2)!.value as bigint;
        const batch = readFields(body.find((f) => f.num === 3)!.value as Uint8Array);
        cursorSteps.set(cursorId, batch.filter((f) => f.num === 1).length);
        respond(ws, requestId, msg(6));
        break;
      }
      case 8: { // fetch_cursor -> step_begin and step_end for each step, then done
        const cursorId = body.find((f) => f.num === 1)!.value as bigint;
        const entries: number[] = [];
        for (let step = 0; step < (cursorSteps.get(cursorId) ?? 0); step++) {
          entries.push(...msg(1, msg(1, vint(1, BigInt(step)))));
          entries.push(...msg(1, msg(2, [...vint(1, 1n), ...vint(2, zigzag(ROWID))])));
        }
        cursorSteps.delete(cursorId);
        respond(ws, requestId, msg(8, [...entries, ...vint(2, 1n)]));
        break;
      }
      default: // open_stream, close_stream, close_cursor, store_sql, close_sql, sequence: an empty response
        respond(ws, requestId, msg(request.num));
    }
  });
});
await new Promise((resolve) => wss.once("listening", resolve));
const { port } = wss.address() as { port: number };

// @libsql/client opens Hrana 2, which has no cursors. Hrana 3 is a public option of openWs.
const client = hrana.openWs(`ws://127.0.0.1:${port}`, undefined, 3);
await client.getVersion(); // waits for the handshake
const stream = client.openStream();
const viaExecute = (await stream.run("INSERT INTO t VALUES (1)")).lastInsertRowid;
const batch = stream.batch(true); // true: run the batch with a cursor
const step = batch.step().run("INSERT INTO t VALUES (1)");
await batch.execute();
const viaBatch = (await step)!;
client.close();
wss.close();

console.log(`the server sends last_insert_rowid = ${ROWID}`);
console.log(`Stream.run().lastInsertRowid:       ${viaExecute}`);
console.log(`a cursor batch step lastInsertRowid: ${viaBatch.lastInsertRowid}`);
console.log(viaBatch.lastInsertRowid === ROWID ? "BUG ABSENT" : "BUG PRESENT");
