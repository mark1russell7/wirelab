// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// RFC 8216bis (draft 22), section 4.4.2.3: a Variable Name is a string of the chars [a-z], [A-Z], [0-9], '-' and '_'.
// A duplicate name MUST fail to parse, and a reference to a name that no EXT-X-DEFINE gave MUST be a parsing error.
// variable-substitution.ts of hls.js keeps the variables in a plain object and tests a name with the operator in. A
// name such as constructor or toString is then found on Object.prototype: a single definition is a duplicate, and an
// undefined reference gives the text of a native function in place of a parsing error.
import { M3U8Parser, PlaylistLevelType } from "hls.js";

const base = "https://media.example/live/index.m3u8";
const parse = (playlist: string) => M3U8Parser.parseLevelPlaylist(playlist, base, 0, PlaylistLevelType.MAIN, 0, null);

function defineOne(name: string) {
  const details = parse(`#EXTM3U
#EXT-X-VERSION:8
#EXT-X-TARGETDURATION:6
#EXT-X-DEFINE:NAME="${name}",VALUE="cdn1"
#EXTINF:6.0,
https://{$${name}}.example/segment.ts
#EXT-X-ENDLIST
`);
  return { error: details.playlistParsingError?.message ?? null, uri: details.fragments[0]?.relurl };
}

function undefinedReference(name: string) {
  const details = parse(`#EXTM3U
#EXT-X-VERSION:8
#EXT-X-TARGETDURATION:6
#EXT-X-DEFINE:NAME="host",VALUE="cdn1.example"
#EXTINF:6.0,
https://{$host}/{$${name}}/segment.ts
#EXT-X-ENDLIST
`);
  return { error: details.playlistParsingError?.message ?? null, uri: details.fragments[0]?.relurl };
}

const defineHost = defineOne("host");
const defineConstructor = defineOne("constructor");
const referencePath = undefinedReference("path");
const referenceToString = undefinedReference("toString");
console.log("one EXT-X-DEFINE, NAME=host:        ", JSON.stringify(defineHost));
console.log("one EXT-X-DEFINE, NAME=constructor: ", JSON.stringify(defineConstructor));
console.log("undefined reference {$path}:        ", JSON.stringify(referencePath));
console.log("undefined reference {$toString}:    ", JSON.stringify(referenceToString));

if (defineConstructor.error !== null || defineConstructor.uri !== "https://cdn1.example/segment.ts" || referenceToString.error === null) {
  console.log("BUG PRESENT: a Variable Name that is also a name of Object.prototype gives a false duplicate error, and an undefined reference to it gives no parsing error.");
  process.exit(1);
}
console.log("OK: hls.js handles the Variable Names constructor and toString like other names.");
process.exit(0);
