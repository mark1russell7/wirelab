// F0161: bson 7.3.4. calculateObjectSize() does not agree with serialize() for typed arrays other than
// Uint8Array, for DataView and for ArrayBuffer. calculateObjectSize counts them as binary, and serialize writes
// them as documents. An ArrayBuffer comes back as {}.
import { serialize, deserialize, calculateObjectSize } from 'bson';

const values: [string, unknown][] = [
  ['Float64Array([1.5])', new Float64Array([1.5])],
  ['Int16Array(2)', new Int16Array(2)],
  ['ArrayBuffer(4) of 0x41', new Uint8Array([0x41, 0x41, 0x41, 0x41]).buffer],
  ['DataView(4)', new DataView(new ArrayBuffer(4))]
];
let bug = false;
for (const [name, v] of values) {
  try {
    const calc = calculateObjectSize({ a: v });
    const bytes = serialize({ a: v });
    console.log(`${name}: calculateObjectSize=${calc} serialize().length=${bytes.length} hex=${Buffer.from(bytes).toString('hex')} back=${JSON.stringify(deserialize(bytes))}`);
    if (calc !== bytes.length) bug = true;
  } catch (error) {
    // A version that refuses the value with an error has no mismatch.
    console.log(`${name}: throws ${(error as Error).name}: ${(error as Error).message}`);
  }
}
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT');
process.exitCode = bug ? 1 : 0;
