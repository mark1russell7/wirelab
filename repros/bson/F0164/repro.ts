// F0164: bson 7.3.4. serialize() writes an Invalid Date as the datetime 0 (1970-01-01), with no error.
// A valid BSON datetime outside the range of a JS Date (2^62 ms) is read as an Invalid Date, so a round trip
// writes it back as 0. (The Extended JSON form of an Invalid Date is the open PR js-bson#942, not this repro.)
import { serialize, deserialize } from 'bson';

let bug = false;
const attempt = (label: string, run: () => string): string => {
  try {
    return run();
  } catch (error) {
    return `throws ${(error as Error).name}: ${(error as Error).message}`;
  }
};

const invalid = attempt('invalid', () => Buffer.from(serialize({ d: new Date(NaN) })).toString('hex'));
// The datetime value is the 8 bytes after the type 09 and the name "d\0".
const written = invalid.startsWith('throws') ? invalid : `${invalid} (datetime bytes ${invalid.slice(14, 30)})`;
console.log(`serialize({d: new Date(NaN)}) -> ${written}`);
if (invalid.slice(14, 30) === '0000000000000000') bug = true;

// The datetime 0x4000000000000000 ms (2^62) is a valid int64, outside the range of a JS Date.
const far = Buffer.from('10000000' + '09' + '6400' + '0000000000000040' + '00', 'hex');
const again = attempt('far', () => {
  const r = deserialize(far);
  return `${String(r['d'])}; serialize again -> ${Buffer.from(serialize(r)).toString('hex')}`;
});
console.log(`BSON datetime 2^62 ms (${far.toString('hex')}) -> ${again}`);
if (!again.startsWith('throws') && !again.endsWith(far.toString('hex'))) bug = true;
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT');
process.exitCode = bug ? 1 : 0;
