// npm install, then: node repro.ts (Node.js 22.18 or later runs TypeScript directly)
//
// RFC 8216, section 5.2: an EXT-X-KEY tag with METHOD=AES-128 and no IV attribute means that the Media Sequence Number
// is the IV, as a big-endian number in 16 octets with zeros on the left. A Media Sequence Number is a decimal-integer
// from 0 to 2^64-1. createInitializationVector of hls.js shifts the number with the 32-bit operator >>, so for a
// number of 2^32 or more the IV holds only the low 32 bits. The first 16-byte block of each segment then decrypts wrong.
import { M3U8Parser, PlaylistLevelType } from "hls.js";
import { webcrypto } from "node:crypto";

const hex = (bytes: Uint8Array | null | undefined) => (bytes ? Buffer.from(bytes).toString("hex") : String(bytes));

// The IV of RFC 8216, section 5.2.
function rfcIv(sequenceNumber: bigint): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(16);
  let value = sequenceNumber;
  for (let i = 15; i >= 0; i--) {
    iv[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return iv;
}

async function aesCbc(encrypt: boolean, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  const usage = encrypt ? "encrypt" : "decrypt";
  const key = await webcrypto.subtle.importKey("raw", new Uint8Array(16).fill(7), "AES-CBC", false, [usage]);
  const algorithm = { name: "AES-CBC", iv };
  const out = encrypt ? await webcrypto.subtle.encrypt(algorithm, key, data) : await webcrypto.subtle.decrypt(algorithm, key, data);
  return new Uint8Array(out);
}

const sequenceNumber = 2n ** 32n + 1n;
const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:${sequenceNumber}
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:6.0,
segment.ts
#EXT-X-ENDLIST
`;
const details = M3U8Parser.parseLevelPlaylist(playlist, "https://media.example/live/index.m3u8", 0, PlaylistLevelType.MAIN, 0, null);
const fragment = details.fragments[0];
const hlsIv = fragment?.decryptdata?.iv ?? null;
const expected = rfcIv(sequenceNumber);
console.log(`Media Sequence Number of the segment: ${fragment?.sn}`);
console.log(`IV of hls.js:   ${hex(hlsIv)}`);
console.log(`IV of RFC 8216: ${hex(expected)}`);

// The server encrypts the segment with the IV of RFC 8216. The client decrypts it with the IV of hls.js.
const plain = new Uint8Array(32).fill(0x47);
const decrypted = hlsIv ? await aesCbc(false, hlsIv, await aesCbc(true, expected, plain)) : null;
console.log(`first block after decryption: ${hex(decrypted?.subarray(0, 16))}`);
console.log(`first block of the plaintext: ${hex(plain.subarray(0, 16))}`);

if (hex(hlsIv) !== hex(expected) || hex(decrypted) !== hex(plain)) {
  console.log("BUG PRESENT: for a Media Sequence Number of 2^32 or more, hls.js derives a wrong IV, and the first block of the segment decrypts wrong.");
  process.exit(1);
}
console.log("OK: hls.js derives the IV of RFC 8216 from a Media Sequence Number of 2^32 or more.");
process.exit(0);
