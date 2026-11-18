// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// RFC 8216bis (draft 22), section 4.4.5.1: the ID attribute of EXT-X-DATERANGE is a quoted-string that identifies the
// Date Range. m3u8-parser.ts of hls.js looks for an earlier Date Range with level.dateRanges[ID], a plain object. For an
// ID such as toString, the lookup finds a function of Object.prototype and the DateRange constructor takes it as the
// earlier Date Range. Its start date is then undefined, and parseLevelPlaylist throws a TypeError.
import { M3U8Parser, PlaylistLevelType } from "hls.js";

function parseWithId(id: string) {
  const playlist = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00.000Z
#EXT-X-DATERANGE:ID="${id}",START-DATE="2026-01-01T00:00:02.000Z",DURATION=4.0
#EXTINF:6.0,
segment0.ts
#EXTINF:6.0,
segment1.ts
#EXT-X-ENDLIST
`;
  try {
    const details = M3U8Parser.parseLevelPlaylist(playlist, "https://media.example/vod/index.m3u8", 0, PlaylistLevelType.MAIN, 0, null);
    return `parsed, Date Ranges ${JSON.stringify(Object.keys(details.dateRanges))}, error ${details.playlistParsingError?.message ?? null}`;
  } catch (error) {
    return `threw ${(error as Error).name}: ${(error as Error).message}`;
  }
}

const results = ["ad-1", "toString", "constructor"].map((id) => [id, parseWithId(id)] as const);
for (const [id, result] of results) console.log(`ID="${id}": ${result}`);

if (results.some(([, result]) => result.startsWith("threw"))) {
  console.log("BUG PRESENT: an EXT-X-DATERANGE ID that is also a name of Object.prototype makes parseLevelPlaylist throw.");
  process.exit(1);
}
console.log("OK: hls.js parses a Date Range with any ID.");
process.exit(0);
