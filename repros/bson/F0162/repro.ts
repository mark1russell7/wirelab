// F0162: bson 7.3.4. deserialize() looks up the option fieldsAsRaw through the prototype chain
// (parser/deserializer.ts 467: fieldsAsRaw[name]). So arrays named "constructor", "toString" and other
// members of Object.prototype come back as raw bytes, although fieldsAsRaw does not name them.
import { serialize, deserialize } from 'bson';

const bytes = serialize({ constructor: [{ x: 1 }], toString: [{ y: 2 }], plain: [{ z: 3 }] });
const r = deserialize(bytes, { fieldsAsRaw: { plain: false } });
// Read own properties only, so that the names of Object.prototype do not confuse the repro.
const first = (key: string): unknown => (Object.getOwnPropertyDescriptor(r, key)?.value as unknown[] | undefined)?.[0];
const desc = (v: unknown): string => (v instanceof Uint8Array ? `RAW bytes ${Buffer.from(v).toString('hex')}` : JSON.stringify(v));
console.log('fieldsAsRaw = { plain: false }');
console.log(`constructor[0] = ${desc(first('constructor'))}`);
console.log(`toString[0]    = ${desc(first('toString'))}`);
console.log(`plain[0]       = ${desc(first('plain'))}`);
const bug = first('constructor') instanceof Uint8Array || first('toString') instanceof Uint8Array;
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT');
process.exitCode = bug ? 1 : 0;
