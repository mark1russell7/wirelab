// F0145: apache-arrow 21.2.0. A stream that ends inside the 8-byte prefix of a message reads as a complete stream
// with no error. MessageReader.readMetadataLength() changes a partial prefix to the length 0, which is the end of the
// stream. A stream that ends inside the metadata or the body of a message throws an error.
import * as A from "apache-arrow";

const stream = A.tableToIPC(A.tableFromArrays({ x: Int32Array.of(1, 2, 3) }), "stream");

// The prefix of the first message is 0xFFFFFFFF and the length of its metadata. The Schema message ends after its
// metadata, because it has no body. The RecordBatch message starts there.
const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
const recordBatchStart = 8 + view.getInt32(4, true);

const read = (bytes: Uint8Array): string => {
  try {
    const table = A.tableFromIPC(bytes);
    return `${table.numRows} rows, x = ${JSON.stringify(Array.from(table.getChild("x") ?? []))}`;
  } catch (error) {
    return `throws: ${(error as Error).message}`;
  }
};

console.log(`full stream (${stream.length} bytes): ${read(stream)}`);
console.log(`cut inside the RecordBatch metadata: ${read(stream.subarray(0, recordBatchStart + 18))}`);

const cuts = [2, 4, 6, 8];
let silent = 0;
for (const cut of cuts) {
  const result = read(stream.subarray(0, recordBatchStart + cut));
  console.log(`cut after ${cut} of the 8 prefix bytes of the RecordBatch: ${result}`);
  if (!result.startsWith("throws")) silent++;
}

if (silent > 0) {
  console.log(`BUG PRESENT: ${silent} of ${cuts.length} streams cut inside a message prefix read as a complete stream with no error.`);
  process.exit(1);
}
console.log("OK: each stream cut inside a message prefix throws an error.");
