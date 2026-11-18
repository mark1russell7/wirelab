// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// RFC 8216, section 4.3.2.4: the IV attribute is a hexadecimal-sequence that specifies a 128-bit unsigned integer.
// Section 4.2 gives a maximum length for a hexadecimal-sequence and no minimum, so IV=0x1 is the number 1: the 16
// octets 00...01. AttrList.hexadecimalInteger of hls.js makes one byte of each two hex digits and does not pad on the
// left, so the IV has 1 byte. AES-CBC needs an IV of 16 bytes, so WebCrypto rejects it and the segment does not decrypt.
import { M3U8Parser, PlaylistLevelType } from "hls.js";
import { webcrypto } from "node:crypto";

const hex = (bytes: Uint8Array | null | undefined) => (bytes ? Buffer.from(bytes).toString("hex") : String(bytes));

function ivOf(ivAttribute: string) {
  const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=${ivAttribute}
#EXTINF:6.0,
segment.ts
#EXT-X-ENDLIST
`;
  const details = M3U8Parser.parseLevelPlaylist(playlist, "https://media.example/vod/index.m3u8", 0, PlaylistLevelType.MAIN, 0, null);
  return details.fragments[0]?.decryptdata?.iv ?? null;
}

async function decryptWith(iv: Uint8Array<ArrayBuffer>) {
  const key = await webcrypto.subtle.importKey("raw", new Uint8Array(16).fill(7), "AES-CBC", false, ["encrypt", "decrypt"]);
  const rfcIv = new Uint8Array(16);
  rfcIv[15] = 1;
  const encrypted = await webcrypto.subtle.encrypt({ name: "AES-CBC", iv: rfcIv }, key, new Uint8Array(32).fill(0x47));
  try {
    const plain = new Uint8Array(await webcrypto.subtle.decrypt({ name: "AES-CBC", iv }, key, encrypted));
    return `decrypted, first byte 0x${plain[0]?.toString(16)}`;
  } catch (error) {
    return `WebCrypto threw ${(error as Error).name}: ${(error as Error).message}`;
  }
}

const full = ivOf("0x00000000000000000000000000000001");
const short = ivOf("0x1");
console.log(`IV=0x00000000000000000000000000000001: ${full?.length} bytes ${hex(full)}, ${full ? await decryptWith(full) : "no IV"}`);
console.log(`IV=0x1:                                ${short?.length} bytes ${hex(short)}, ${short ? await decryptWith(short) : "no IV"}`);

if (short?.length !== 16 || hex(short) !== hex(full)) {
  console.log("BUG PRESENT: hls.js does not pad a short IV to 16 bytes, so a segment with IV=0x1 does not decrypt.");
  process.exit(1);
}
console.log("OK: hls.js pads a short IV to the same 16 bytes.");
process.exit(0);
