/**
 * The target of `apache-arrow`: `tableFromIPC` on an Arrow IPC stream. Each message of the stream is one frame with an
 * 8-byte prefix: the continuation marker `0xFFFFFFFF` and the length of the metadata.
 */
import { tableFromArrays, tableFromIPC, tableToIPC } from "apache-arrow";
import type { Frame, FramedStream } from "../cuts.ts";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { EnvelopeTarget } from "./target.ts";

/** The package and the version of the target. The version is the version that the workspace installs. */
export const APACHE_ARROW = { package: "apache-arrow", version: "21.2.0" } as const;

/** The time limit in ms of one read. */
const limitMs = 5_000;

/** The width of the prefix of a message: the continuation marker and the length of the metadata. */
const PREFIX = 8;

/** The length of the end-of-stream marker that `tableToIPC` writes after the last message. */
const EOS = 8;

/**
 * This function gives the frames of a stream of one schema and two record batches. The schema message has no body, so
 * its length is the prefix and the metadata. The length of a batch comes from a stream with one batch. So the target
 * needs no parser of the metadata.
 *
 * The stream has no end-of-stream marker. The Arrow stream format lets a stream end after a complete message. So the
 * place `after the end marker` is a cut inside a new message after the last complete message.
 */
function arrowStream(): FramedStream {
  const values = Int32Array.of(1, 2, 3);
  const oneTable = tableFromArrays({ x: values });
  const all = tableToIPC(oneTable.concat(tableFromArrays({ x: values })), "stream");
  const oneBatch = tableToIPC(oneTable, "stream");
  const schemaLength = PREFIX + new DataView(all.buffer, all.byteOffset, all.byteLength).getInt32(4, true);
  const batchLength = oneBatch.length - EOS - schemaLength;
  if (all.length - EOS !== schemaLength + 2 * batchLength) throw new Error("The Arrow stream of the rig has an unexpected length.");
  const frame = (start: number, length: number): Frame => ({ bytes: all.slice(start, start + length), prefix: PREFIX, fields: [4, 4] });
  return { frames: [frame(0, schemaLength), frame(schemaLength, batchLength), frame(schemaLength + batchLength, batchLength)] };
}

/** The target: the rows that `tableFromIPC` reads from the bytes, or its error. */
export const apacheArrowTarget: EnvelopeTarget = {
  id: "apache-arrow/table-from-ipc",
  ...APACHE_ARROW,
  stream: arrowStream,
  run(bytes: Uint8Array): Promise<Outcome> {
    return outcomeOf(
      async () => {
        const table = tableFromIPC(bytes);
        return Array.from(table.getChild("x") ?? [], (value) => String(value));
      },
      limitMs,
    );
  },
};
