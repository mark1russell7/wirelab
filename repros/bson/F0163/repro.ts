// F0163: bson 7.3.4. A bigint outside the int64 range is written modulo 2^64, with no error, by serialize()
// and by EJSON.stringify(). The value that comes back is a different number.
import { serialize, deserialize, EJSON } from 'bson';

const show = (v: unknown): string => (typeof v === 'bigint' ? `${v}n` : String(v));
// Each case gives the value that comes back, or "throws" when the library refuses the value.
const attempt = (label: string, run: () => unknown, input: bigint): boolean => {
  try {
    const out = run();
    const changed = typeof out === 'string' ? !out.includes(input.toString()) : out !== input;
    console.log(`${label} -> ${show(out)}${changed ? ' (a different value, no error)' : ''}`);
    return changed;
  } catch (error) {
    console.log(`${label} -> throws ${(error as Error).name}: ${(error as Error).message}`);
    return false;
  }
};
const big = 2n ** 64n + 5n;
const top = 2n ** 63n;
const results = [
  attempt('serialize({a: 2n**64n+5n}), then deserialize', () => deserialize(serialize({ a: big }), { useBigInt64: true })['a'], big),
  attempt('serialize({a: 2n**63n}), then deserialize   ', () => deserialize(serialize({ a: top }), { useBigInt64: true })['a'], top),
  attempt('EJSON.stringify({a: 2n**64n+5n})              ', () => EJSON.stringify({ a: big }, { relaxed: false }), big)
];
const bug = results.some(Boolean);
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT');
process.exitCode = bug ? 1 : 0;
