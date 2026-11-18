// F0160: bson 7.3.4. JS RegExp flags map to the wrong BSON regex options, and back.
// BSON spec 1.1: the regex options are stored in alphabetical order. 's' is dotAll, and 'g' does not exist.
// serialize() writes the JS flag g as 's' and drops the JS flag s. deserialize() reads 's' as the JS flag g.
import { serialize, deserialize, BSONRegExp } from 'bson';

// Read the options cstring from the bytes: size(4) type(1) "r\0" pattern\0 options\0
const rawOpts = (re: RegExp): string => {
  const b = Buffer.from(serialize({ r: re }));
  const p = b.indexOf(0, 7);
  return b.toString('latin1', p + 1, b.indexOf(0, p + 1));
};
const gim = rawOpts(/a/gim);
const g = rawOpts(/a.b/g);
const s = rawOpts(/a.b/s);
const back = deserialize(serialize({ r: new BSONRegExp('a.b', 's') }))['r'] as RegExp;
console.log(`/a/gim  -> BSON option bytes ${JSON.stringify(gim)} (spec: alphabetical; 'g' has no BSON meaning)`);
console.log(`/a.b/g  -> BSON option bytes ${JSON.stringify(g)} (a server reads 's' as dotAll)`);
console.log(`/a.b/s  -> BSON option bytes ${JSON.stringify(s)} (the JS dotAll flag is dropped)`);
console.log(`BSON 'a.b' options 's' -> JS ${back} flags=${JSON.stringify(back.flags)} dotAll=${back.dotAll} matches "a\\nb"=${back.test('a\nb')}`);
const sorted = gim === [...gim].sort().join('');
const bug = !sorted || g.includes('s') || !s.includes('s') || back.global || !back.dotAll;
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT');
process.exitCode = bug ? 1 : 0;
