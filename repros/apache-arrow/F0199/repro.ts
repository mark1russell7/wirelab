// apache-arrow 21.2.0. The reader does not compare the buffer regions and the field node lengths of a RecordBatch
// with its message body. VectorLoader.readData() returns bytes.subarray(offset, offset + length), and subarray()
// clamps a region that ends after the body. So a buffer that ends after the body gives rows that are undefined, and a
// length that is larger than the data gives a column shorter than numRows. There is no error.
import * as A from "apache-arrow";
import { Message } from "apache-arrow/fb/message";
import { RecordBatch } from "apache-arrow/fb/record-batch";
import * as flatbuffers from "flatbuffers";

const stream = A.tableToIPC(A.tableFromArrays({ x: Int32Array.of(10, 20, 30, 40) }), "stream");

// The RecordBatch message starts after the Schema message, which has no body.
const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
const batchStart = 8 + view.getInt32(4, true);
const metadataStart = batchStart + 8;
const metadataLength = view.getInt32(batchStart + 4, true);
const message = Message.getRootAsMessage(
  new flatbuffers.ByteBuffer(stream.slice(metadataStart, metadataStart + metadataLength)),
);
const batch = message.header(new RecordBatch()) as RecordBatch;

// Absolute byte positions of the int64 fields to change. Buffer is { offset, length } and FieldNode is
// { length, null_count }. RecordBatch field 0 (vtable offset 4) is length.
const dataBuffer = batch.buffers(1)!;
const dataOffsetPosition = metadataStart + dataBuffer.bb_pos;
const nodeLengthPosition = metadataStart + batch.nodes(0)!.bb_pos;
const batchLengthPosition = metadataStart + batch.bb_pos + batch.bb!.__offset(batch.bb_pos, 4);
console.log(
  `RecordBatch: bodyLength ${message.bodyLength()}, data buffer offset ${dataBuffer.offset()} length ${dataBuffer.length()}, ` +
    `length ${batch.length()}`,
);

const setInt64 = (bytes: Uint8Array, position: number, value: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigInt64(position, BigInt(value), true);

const read = (bytes: Uint8Array): string => {
  try {
    const table = A.tableFromIPC(bytes);
    const x = table.getChild("x")!;
    const rows = Array.from({ length: table.numRows }, (_, i) => String(x.get(i)));
    return `numRows ${table.numRows}, x.get(i) = [${rows.join(", ")}], x.toArray().length ${x.toArray().length}`;
  } catch (error) {
    return `throws: ${(error as Error).message}`;
  }
};

console.log(`valid stream: ${read(stream)}`);

// Case 1: the data buffer starts at offset 8, so it ends 8 bytes after the 16-byte body.
const outside = stream.slice();
setInt64(outside, dataOffsetPosition, 8);
const result1 = read(outside);
console.log(`data buffer at offset 8 (ends 8 bytes after the body): ${result1}`);

// Case 2: the RecordBatch and its field node say 6 rows, but the 16-byte data buffer holds 4 int32 values.
const tooLong = stream.slice();
setInt64(tooLong, batchLengthPosition, 6);
setInt64(tooLong, nodeLengthPosition, 6);
const result2 = read(tooLong);
console.log(`6 rows declared, data buffer of 4 values: ${result2}`);

const silent = [result1, result2].filter((result) => !result.startsWith("throws")).length;
if (silent > 0) {
  console.log(`BUG PRESENT: ${silent} of 2 batches with buffer regions outside the body read with no error.`);
  process.exit(1);
}
console.log("OK: each batch with a buffer region outside the body gives an error.");
