// apache-arrow 21.2.0. The stream reader drops a message of an unexpected header type (for example Tensor), but it
// does not skip the body of that message. RecordBatchStreamReaderImpl.next() handles only Schema, RecordBatch and
// DictionaryBatch. So the reader parses the body as the next messages. A reader that frames each message by its
// bodyLength sees different rows in the same bytes.
import * as A from "apache-arrow";
import { Message } from "apache-arrow/fb/message";
import * as flatbuffers from "flatbuffers";

// This function gives the bounds of each message of a stream, and the root table of its metadata.
function messages(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = [];
  let start = 0;
  while (start + 8 <= bytes.length) {
    const metadataLength = view.getInt32(start + 4, true);
    if (metadataLength === 0) {
      found.push({ start, metadataEnd: start + 8, end: start + 8, header: "EOS", bodyLength: 0, fb: null });
      break;
    }
    const metadataEnd = start + 8 + metadataLength;
    const fb = Message.getRootAsMessage(new flatbuffers.ByteBuffer(bytes.slice(start + 8, metadataEnd)));
    const bodyLength = Number(fb.bodyLength());
    found.push({ start, metadataEnd, end: metadataEnd + bodyLength, header: A.MessageHeader[fb.headerType()], bodyLength, fb });
    start = metadataEnd + bodyLength;
  }
  return found;
}

const visible = A.tableToIPC(A.tableFromArrays({ x: Int32Array.of(1, 2, 3) }), "stream");
const hidden = A.tableToIPC(A.tableFromArrays({ x: Int32Array.of(666, 777, 888) }), "stream");
const [schema, batch, end] = messages(visible);
const hiddenBatch = messages(hidden)[1]!;
const hiddenBytes = hidden.slice(hiddenBatch.start, hiddenBatch.end);

// A Tensor message: the prefix and metadata of the RecordBatch, with the header type 4 (Tensor) and a bodyLength
// that covers the complete RecordBatch message of the hidden stream. Message field 1 (vtable offset 6) is
// header_type and field 3 (vtable offset 10) is bodyLength.
const fb = batch!.fb!;
const tensor = visible.slice(batch!.start, batch!.metadataEnd);
const headerTypePosition = 8 + fb.bb_pos + fb.bb!.__offset(fb.bb_pos, 6);
const bodyLengthPosition = 8 + fb.bb_pos + fb.bb!.__offset(fb.bb_pos, 10);
tensor[headerTypePosition] = A.MessageHeader.Tensor;
new DataView(tensor.buffer).setBigInt64(bodyLengthPosition, BigInt(hiddenBytes.length), true);

const crafted = new Uint8Array([
  ...visible.subarray(schema!.start, schema!.end),
  ...tensor,
  ...hiddenBytes,
  ...visible.subarray(batch!.start, batch!.end),
  ...visible.subarray(end!.start, end!.end),
]);

console.log(`messages by bodyLength: ${messages(crafted).map((m) => `${m.header} (body ${m.bodyLength})`).join(", ")}`);
const rows = (bytes: Uint8Array): string => {
  try {
    const table = A.tableFromIPC(bytes);
    return `${table.numRows} rows, x = ${JSON.stringify(Array.from(table.getChild("x") ?? []))}`;
  } catch (error) {
    return `throws: ${(error as Error).message}`;
  }
};
console.log(`tableFromIPC(original stream): ${rows(visible)}`);
const result = rows(crafted);
console.log(`tableFromIPC(stream with the Tensor message): ${result}`);

if (result.includes("666")) {
  console.log("BUG PRESENT: the reader returns the rows 666, 777 and 888 from the body of the Tensor message.");
  process.exit(1);
}
console.log("OK: the reader skips the body of the Tensor message, or refuses the message.");
