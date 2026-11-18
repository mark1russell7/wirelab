// F0165: bson 7.3.4. With useBigInt64: true, a cut int64 value throws a RangeError from BigInt(NaN), not a
// BSONError. The document has size 11, type 0x12, the name "a", only 3 value bytes, and the terminator.
import { deserialize, BSONError } from 'bson';

const doc = Buffer.from('0b000000' + '12' + '6100' + '010203' + '00', 'hex');
const run = (opts: object): string => {
  try {
    return `no error: ${JSON.stringify(deserialize(doc, opts), (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v))}`;
  } catch (e) {
    return `${e instanceof BSONError ? 'BSONError' : 'NOT BSONError'} ${(e as Error).name}: ${(e as Error).message}`;
  }
};
const a = run({ useBigInt64: true });
const b = run({});
console.log(`useBigInt64: true -> ${a}`);
console.log(`default           -> ${b}`);
const bug = !a.startsWith('BSONError');
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT');
process.exitCode = bug ? 1 : 0;
