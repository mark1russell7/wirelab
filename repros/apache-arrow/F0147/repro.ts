// F0147: apache-arrow 21.2.0. RecordBatchWriter._writeDictionaries() compares only the first chunk of a dictionary with
// the dictionary of the previous batch. When the first chunk is the same object and the number of chunks is the same,
// it writes no DictionaryBatch, also when a later chunk changed. The reader then decodes the second batch with the
// dictionary of the first batch.
import * as A from "apache-arrow";

const type = new A.Dictionary(new A.Utf8(), new A.Int32(), 0);
const shared = A.vectorFromArray(["a", "b"], new A.Utf8());
const first = A.makeData({ type, length: 3, nullCount: 0, data: Int32Array.of(0, 1, 2), dictionary: shared.concat(A.vectorFromArray(["c"], new A.Utf8())) });
const second = A.makeData({ type, length: 2, nullCount: 0, data: Int32Array.of(0, 2), dictionary: shared.concat(A.vectorFromArray(["X"], new A.Utf8())) });
const table = new A.Table({ d: A.makeVector([first, second]) });

const batches = (t: A.Table): string => t.batches.map((batch) => JSON.stringify(Array.from(batch.getChild("d") ?? []))).join(" | ");
console.log(`written: ${batches(table)}`);

let faults = 0;
for (const format of ["stream", "file"] as const) {
  const read = A.tableFromIPC(A.tableToIPC(table, format));
  console.log(`read (${format}): ${batches(read)}`);
  if (batches(read) !== batches(table)) faults++;
}

if (faults > 0) {
  console.log(`BUG PRESENT: ${faults} of 2 formats read a different second batch than was written.`);
  process.exit(1);
}
console.log("OK: each format reads the batches that were written.");
