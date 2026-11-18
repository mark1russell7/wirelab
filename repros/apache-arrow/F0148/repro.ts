// F0148: apache-arrow 21.2.0. The file reader accepts two non-delta DictionaryBatches for one dictionary id. The format
// lets a file have only one non-delta DictionaryBatch for each id. RecordBatchFileReader replaces the dictionary
// with the second one, and the values of the column change with no error.
import * as A from "apache-arrow";
import { DictionaryBatch } from "apache-arrow/fb/dictionary-batch";
import { Message } from "apache-arrow/fb/message";
import * as flatbuffers from "flatbuffers";

// A dictionary of two chunks: the writer writes a non-delta DictionaryBatch ["a", "b"] and a delta ["c"].
const type = new A.Dictionary(new A.Utf8(), new A.Int32(), 0);
const dictionary = A.vectorFromArray(["a", "b"], new A.Utf8()).concat(A.vectorFromArray(["c"], new A.Utf8()));
const data = A.makeData({ type, length: 3, nullCount: 0, data: Int32Array.of(0, 1, 2), dictionary });
const file = A.tableToIPC(new A.Table({ d: A.makeVector(data) }), "file");

// The messages of a file start after the magic "ARROW1" and 2 bytes of padding, and stop at the footer.
const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
const footerStart = file.length - 10 - view.getInt32(file.length - 10, true);
const isDeltaPositions: number[] = [];
let position = 8;
while (position < footerStart) {
  const metadataLength = view.getInt32(position + 4, true);
  if (metadataLength === 0) break;
  const metadataStart = position + 8;
  const message = Message.getRootAsMessage(new flatbuffers.ByteBuffer(file.subarray(metadataStart, metadataStart + metadataLength)));
  const batch = message.header(new DictionaryBatch()) as DictionaryBatch | null;
  if (batch && message.headerType() === A.MessageHeader.DictionaryBatch && batch.isDelta()) {
    // Field 2 of the DictionaryBatch table (vtable offset 8) is isDelta.
    isDeltaPositions.push(metadataStart + batch.bb_pos + batch.bb!.__offset(batch.bb_pos, 8));
  }
  position = metadataStart + metadataLength + Number(message.bodyLength());
}
if (isDeltaPositions.length !== 1) throw new Error(`expected one delta DictionaryBatch, found ${isDeltaPositions.length}`);

// The same file, with isDelta false in the second DictionaryBatch. Each other byte stays the same.
const twoNonDelta = file.slice();
twoNonDelta[isDeltaPositions[0]!] = 0;

const read = (bytes: Uint8Array): string => {
  try {
    return `d = ${JSON.stringify(Array.from(A.tableFromIPC(bytes).getChild("d") ?? []))}`;
  } catch (error) {
    return `throws: ${(error as Error).message}`;
  }
};

console.log(`file with a non-delta and a delta DictionaryBatch: ${read(file)}`);
const result = read(twoNonDelta);
console.log(`file with two non-delta DictionaryBatches for id 0: ${result}`);

if (!result.startsWith("throws")) {
  console.log("BUG PRESENT: the file reader accepts a dictionary replacement, and the values of the column change.");
  process.exit(1);
}
console.log("OK: the file reader refuses a dictionary replacement.");
