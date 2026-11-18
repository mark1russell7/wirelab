// F0146: apache-arrow 21.2.0. A stream with a RecordBatch whose dictionary was never sent reads with no error, and
// each value of the dictionary column becomes null. VectorLoader.readDictionary() does not check that a
// DictionaryBatch with the id of the field came before the RecordBatch.
import * as A from "apache-arrow";

const type = new A.Dictionary(new A.Utf8(), new A.Int32(), 0);
const stream = A.tableToIPC(new A.Table({ d: A.vectorFromArray(["a", "b", "a"], type) }), "stream");

// This function gives the start, the end and the header type of each message, from the prefix and the bodyLength.
function messages(bytes: Uint8Array): { start: number; end: number; header: A.MessageHeader }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = [];
  let position = 0;
  while (position + 8 <= bytes.length) {
    const metadataLength = view.getInt32(position + 4, true);
    if (metadataLength === 0) break;
    const message = A.Message.decode(bytes.subarray(position + 8, position + 8 + metadataLength));
    const end = position + 8 + metadataLength + message.bodyLength;
    found.push({ start: position, end, header: message.headerType });
    position = end;
  }
  return found;
}

const list = messages(stream);
console.log(`messages: ${list.map((m) => A.MessageHeader[m.header]).join(", ")}`);
const dictionary = list.find((m) => m.header === A.MessageHeader.DictionaryBatch);
if (!dictionary) throw new Error("the stream has no DictionaryBatch");

// The same stream with no DictionaryBatch message. The other bytes do not change.
const withoutDictionary = new Uint8Array([...stream.subarray(0, dictionary.start), ...stream.subarray(dictionary.end)]);

const read = (bytes: Uint8Array): string => {
  try {
    const table = A.tableFromIPC(bytes);
    return `${table.numRows} rows, d = ${JSON.stringify(Array.from(table.getChild("d") ?? []))}`;
  } catch (error) {
    return `throws: ${(error as Error).message}`;
  }
};

console.log(`full stream: ${read(stream)}`);
const result = read(withoutDictionary);
console.log(`stream with no DictionaryBatch: ${result}`);

if (!result.startsWith("throws")) {
  console.log("BUG PRESENT: a RecordBatch whose dictionary was never sent reads with no error.");
  process.exit(1);
}
console.log("OK: a RecordBatch whose dictionary was never sent gives an error.");
