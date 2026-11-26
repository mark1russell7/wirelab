/**
 * The key targets of `hls.js`: the names in a media playlist. The parser of the playlist operates in the process with
 * no player and no network, as `M3U8Parser.parseLevelPlaylist`.
 */
import { M3U8Parser, PlaylistLevelType } from "hls.js";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { KeyTarget } from "./target.ts";

/** The package and the version of the targets. The version is the version that the workspace installs. */
export const HLS_JS = { package: "hls.js", version: "1.7.4" } as const;

/** This function parses `playlist` as a media playlist and gives its details. */
const parse = (playlist: string): ReturnType<typeof M3U8Parser.parseLevelPlaylist> =>
  M3U8Parser.parseLevelPlaylist(playlist, "https://media.example/live/index.m3u8", 0, PlaylistLevelType.MAIN, 0, null);

/** This function gives the parsing error of `details`, or `none`. */
const parsingError = (details: ReturnType<typeof parse>): string => details.playlistParsingError?.message ?? "none";

/**
 * The key target of the variables of a playlist: the Variable Name of `EXT-X-DEFINE`. The first playlist defines the
 * name and uses it. The second playlist uses the name with no definition, which is a parsing error.
 */
export const hlsVariableTarget: KeyTarget = {
  id: "hls.js/variable",
  ...HLS_JS,
  table: "entity or variable name",
  phase: "open",
  run: (key): Promise<Outcome> =>
    outcomeOf(() => {
      const defined = parse(
        `#EXTM3U\n#EXT-X-VERSION:8\n#EXT-X-TARGETDURATION:6\n#EXT-X-DEFINE:NAME="${key}",VALUE="cdn1"\n#EXTINF:6.0,\nhttps://{$${key}}.example/segment.ts\n#EXT-X-ENDLIST\n`,
      );
      const missing = parse(`#EXTM3U\n#EXT-X-VERSION:8\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nhttps://cdn1.example/{$${key}}/segment.ts\n#EXT-X-ENDLIST\n`);
      return Promise.resolve([
        `defined error ${parsingError(defined)}`,
        `defined uri ${defined.fragments[0]?.relurl ?? "none"}`,
        `undefined error ${parsingError(missing)}`,
      ]);
    }, 5_000),
};

/** The key target of the Date Ranges of a playlist: the `ID` of `EXT-X-DATERANGE`. */
export const hlsDateRangeTarget: KeyTarget = {
  id: "hls.js/date-range",
  ...HLS_JS,
  table: "tag id",
  phase: "open",
  run: (key): Promise<Outcome> =>
    outcomeOf(() => {
      const details = parse(
        `#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:6\n#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00.000Z\n#EXT-X-DATERANGE:ID="${key}",START-DATE="2026-01-01T00:00:02.000Z",DURATION=4.0\n#EXTINF:6.0,\nsegment0.ts\n#EXTINF:6.0,\nsegment1.ts\n#EXT-X-ENDLIST\n`,
      );
      return Promise.resolve([`date ranges ${JSON.stringify(Object.keys(details.dateRanges))}`, `error ${parsingError(details)}`]);
    }, 5_000),
};

/** Each key target of `hls.js`. */
export const hlsKeyTargets: readonly KeyTarget[] = [hlsVariableTarget, hlsDateRangeTarget];
