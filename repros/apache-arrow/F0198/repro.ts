// apache-arrow 21.2.0. In an IPC file, a RecordBatch block of the footer that points at a DictionaryBatch message
// makes RecordBatchFileReader loop with no end. The reader loads the dictionary, but it does not advance
// _recordBatchIndex. So it reads the same block again and again. The file has 610 bytes.
import { Worker } from "node:worker_threads";
import * as A from "apache-arrow";
import { Footer } from "apache-arrow/fb/footer";
import * as flatbuffers from "flatbuffers";

const type = new A.Dictionary(new A.Utf8(), new A.Int32(), 0);
const file = A.tableToIPC(new A.Table({ d: A.vectorFromArray(["a", "b", "a"], type) }), "file");

// The footer is before its 4-byte length and the magic "ARROW1". Each Block struct starts with offset (int64).
const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
const footerLength = view.getInt32(file.length - 10, true);
const footerStart = file.length - 10 - footerLength;
const footer = Footer.getRootAsFooter(new flatbuffers.ByteBuffer(file.slice(footerStart, footerStart + footerLength)));
const dictionaryBlock = footer.dictionaries(0)!;
const batchBlock = footer.recordBatches(0)!;

// The same file, with the offset of the RecordBatch block set to the offset of the DictionaryBatch block.
const crafted = file.slice();
new DataView(crafted.buffer).setBigInt64(footerStart + batchBlock.bb_pos, dictionaryBlock.offset(), true);
console.log(`file of ${crafted.length} bytes: the RecordBatch block points at offset ${dictionaryBlock.offset()}, the DictionaryBatch.`);

// Each read runs in a worker with a time limit of 5 seconds.
const read = (bytes: Uint8Array): Promise<string> =>
  new Promise((resolve) => {
    const code = `
      const { workerData, parentPort } = require("node:worker_threads");
      import(workerData.url).then(({ tableFromIPC }) => {
        try { parentPort.postMessage("returned " + tableFromIPC(workerData.bytes).numRows + " rows"); }
        catch (error) { parentPort.postMessage("throws: " + error.message); }
      });`;
    const worker = new Worker(code, { eval: true, workerData: { url: import.meta.resolve("apache-arrow"), bytes } });
    const timer = setTimeout(() => {
      void worker.terminate();
      resolve("no result after 5000 ms");
    }, 5000);
    worker.on("message", (message: string) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(message);
    });
  });

console.log(`tableFromIPC(original file): ${await read(file)}`);
const result = await read(crafted);
console.log(`tableFromIPC(changed file): ${result}`);

if (result.startsWith("no result")) {
  console.log("BUG PRESENT: tableFromIPC does not return and does not throw for the changed file.");
  process.exit(1);
}
console.log("OK: tableFromIPC returns or throws for the changed file.");
