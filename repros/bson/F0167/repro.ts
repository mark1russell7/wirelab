// F0167: bson 7.3.4. EJSON.parse accepts out-of-range and non-numeric strings in the number wrappers, and
// changes the value with no error. Extended JSON spec: $numberInt is an int32 string, $numberLong an int64
// string, $numberDouble a decimal string or Infinity, -Infinity or NaN, and the t and i of $timestamp are uint32.
import { EJSON } from 'bson';

const cases: [string, string, object][] = [
  ['{"a":{"$numberInt":"2147483648"}}', 'canonical', { relaxed: false }],
  ['{"a":{"$numberInt":"2147483648"}}', 'relaxed', {}],
  ['{"a":{"$numberInt":"12abc"}}', 'canonical', { relaxed: false }],
  ['{"a":{"$numberDouble":"1.5abc"}}', 'canonical', { relaxed: false }],
  ['{"a":{"$numberLong":"9223372036854775808"}}', 'canonical', { relaxed: false }],
  ['{"a":{"$numberLong":"9223372036854775808"}}', 'useBigInt64', { relaxed: false, useBigInt64: true }],
  ['{"a":{"$timestamp":{"t":4294967296,"i":1}}}', 'canonical', { relaxed: false }],
  ['{"a":{"$timestamp":{"t":4294967296,"i":1}}}', 'relaxed', {}]
];
let accepted = 0;
for (const [text, mode, opts] of cases) {
  let r: string;
  try {
    const v: unknown = EJSON.parse(text, opts).a;
    r = `accepted -> ${EJSON.stringify({ a: v }, { relaxed: false })}`;
    accepted++;
  } catch (e) {
    r = `THREW ${(e as Error).name}: ${(e as Error).message}`;
  }
  console.log(`${text} [${mode}] ${r}`);
}
const bug = accepted > 0;
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT');
process.exitCode = bug ? 1 : 0;
