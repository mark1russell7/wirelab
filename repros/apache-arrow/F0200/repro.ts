// apache-arrow 21.2.0. The reader ignores Schema.endianness. decodeSchema() does not read the field, so a stream from
// a big-endian producer (Schema.endianness = Big, values in big-endian byte order) reads as little endian, with no
// error and no byte swap. The int32 values 1, 2 and 3 read as 16777216, 33554432 and 50331648.
import * as A from "apache-arrow";
import { Message } from "apache-arrow/fb/message";
import { Schema } from "apache-arrow/fb/schema";
import * as flatbuffers from "flatbuffers";

const values = Int32Array.of(1, 2, 3);
const stream = A.tableToIPC(A.tableFromArrays({ x: values }), "stream");

// The Schema message is first and has no body. The RecordBatch message follows, then the end-of-stream marker.
const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
const batchStart = 8 + view.getInt32(4, true);
const batchMetadataLength = view.getInt32(batchStart + 4, true);
const batchBodyStart = batchStart + 8 + batchMetadataLength;
const batchBodyLength = Number(A.Message.decode(stream.subarray(batchStart + 8, batchBodyStart)).bodyLength);
const batchEnd = batchBodyStart + batchBodyLength;

// A Schema message with the same fields and Schema.endianness = Big (1), as a big-endian producer writes it. The
// little-endian writer leaves out the field (Little is the default), so there is no byte to change.
const builder = new flatbuffers.Builder(256);
const schema = A.tableFromIPC(stream).schema;
const fields = Schema.createFieldsVector(builder, schema.fields.map((field) => (A.Field as any).encode(builder, field)));
Schema.startSchema(builder);
Schema.addFields(builder, fields);
Schema.addEndianness(builder, 1);
const schemaOffset = Schema.endSchema(builder);
Message.startMessage(builder);
Message.addVersion(builder, A.MetadataVersion.V5);
Message.addHeaderType(builder, A.MessageHeader.Schema);
Message.addHeader(builder, schemaOffset);
Message.addBodyLength(builder, 0n);
Message.finishMessageBuffer(builder, Message.endMessage(builder));
const flatbuffer = builder.asUint8Array();
const metadata = new Uint8Array(Math.ceil((flatbuffer.length + 8) / 8) * 8 - 8);
metadata.set(flatbuffer);
const bigEndianSchema = new Uint8Array(8 + metadata.length);
new DataView(bigEndianSchema.buffer).setInt32(0, -1, true);
new DataView(bigEndianSchema.buffer).setInt32(4, metadata.length, true);
bigEndianSchema.set(metadata, 8);

// The same RecordBatch message, with the 3 int32 values of its body in big-endian byte order. The metadata (the
// flatbuffer) stays little endian, as the format says.
const bigEndianBatch = stream.slice(batchStart, batchEnd);
const batchView = new DataView(bigEndianBatch.buffer);
for (let i = 0; i < values.length; i++) batchView.setInt32(batchBodyStart - batchStart + 4 * i, values[i]!, false);

const bigEndianStream = new Uint8Array([...bigEndianSchema, ...bigEndianBatch, ...stream.subarray(batchEnd)]);
const decoded = Message.getRootAsMessage(new flatbuffers.ByteBuffer(bigEndianStream.slice(8, 8 + metadata.length)));
console.log(`Schema.endianness of the changed stream: ${(decoded.header(new Schema()) as Schema).endianness()} (0 = Little, 1 = Big)`);

const read = (bytes: Uint8Array): string => {
  try {
    const table = A.tableFromIPC(bytes);
    return `${table.numRows} rows, x = ${JSON.stringify(Array.from(table.getChild("x") ?? []))}`;
  } catch (error) {
    return `throws: ${(error as Error).message}`;
  }
};

console.log(`little-endian stream: ${read(stream)}`);
const result = read(bigEndianStream);
console.log(`big-endian stream: ${result}`);

if (!result.startsWith("throws") && !result.includes("x = [1,2,3]")) {
  console.log("BUG PRESENT: a stream with Schema.endianness = Big reads as little endian, with no byte swap and no error.");
  process.exit(1);
}
console.log("OK: the reader byte-swaps the big-endian stream, or refuses it.");
