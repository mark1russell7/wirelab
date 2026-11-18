// F0166: bson 7.3.4. EJSON.parse accepts a $binary subType that is out of range or not hex (it becomes 0) and,
// on Node.js, base64 that is not valid (it becomes empty data), with no error.
// Extended JSON spec: subType is a hex string of one or two characters, and base64 is RFC 4648.
import { EJSON, Binary } from 'bson';

const run = (subType: string, base64: string): string => {
  try {
    const b = EJSON.parse(JSON.stringify({ b: { $binary: { base64, subType } } }), { relaxed: false })['b'] as Binary;
    return `accepted: sub_type=${b.sub_type} length=${b.length()}`;
  } catch (e) {
    return `THREW ${(e as Error).name}: ${(e as Error).message}`;
  }
};
const r1 = run('100', 'AQI=');
const r2 = run('zz', 'AQI=');
const r3 = run('00', '!!!!');
console.log(`subType "100", base64 "AQI=" -> ${r1}`);
console.log(`subType "zz",  base64 "AQI=" -> ${r2}`);
console.log(`subType "00",  base64 "!!!!" -> ${r3}`);
const bug = [r1, r2, r3].some((r) => r.startsWith('accepted'));
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT');
process.exitCode = bug ? 1 : 0;
