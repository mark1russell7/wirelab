// F0141: @aws-sdk/client-s3 3.1171.0 with @smithy/core 3.41.0. HeaderMarshaller.parse() reads each header value with
// new Uint8Array(headers.buffer, ...), and it does not compare the value length with the end of the header section. Thus a
// header value that runs past the header section takes bytes of the payload, and decode() gives no error. The message
// has a correct total length, a correct header length and correct CRC32 checksums.
import { Crc32 } from "@smithy/core/checksum";
import { EventStreamCodec } from "@smithy/core/event-streams";

const crc32 = (bytes: Uint8Array): number => {
  const checksum = new Crc32();
  checksum.update(bytes);
  return checksum.digestSync();
};
// This function makes a message from raw header bytes and a payload, with correct lengths and checksums.
function message(headerBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  const total = 12 + headerBytes.length + payload.length + 4;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, total);
  view.setUint32(4, headerBytes.length);
  view.setUint32(8, crc32(out.subarray(0, 8)));
  out.set(headerBytes, 12);
  out.set(payload, 12 + headerBytes.length);
  view.setUint32(total - 4, crc32(out.subarray(0, total - 4)));
  return out;
}
// A string header (type 7) named "x" with a 2-byte value length and the value bytes.
const stringHeader = (declaredLength: number, valueBytes: string): Uint8Array =>
  new Uint8Array(Buffer.concat([Buffer.from([1]), Buffer.from("x"), Buffer.from([7, declaredLength >> 8, declaredLength & 0xff]), Buffer.from(valueBytes)]));

const codec = new EventStreamCodec(
  (bytes) => Buffer.from(bytes).toString("utf8"),
  (text) => new Uint8Array(Buffer.from(text, "utf8")),
);
const payload = new Uint8Array(Buffer.from("PAYLOAD-12"));
const decode = (headerBytes: Uint8Array): string => {
  try {
    const decoded = codec.decode(message(headerBytes, payload));
    return `header x = ${JSON.stringify(decoded.headers.x?.value)}, payload = ${JSON.stringify(Buffer.from(decoded.body).toString())}`;
  } catch (error) {
    return `throws ${(error as Error).name}: ${(error as Error).message}`;
  }
};

console.log(`control, the value length 3 with 3 value bytes: ${decode(stringHeader(3, "abc"))}`);
const result = decode(stringHeader(10, "abc"));
console.log(`the value length 10 with 3 value bytes in the header section: ${result}`);
if (result.startsWith("header x")) {
  console.log("BUG PRESENT: decode() accepts a header value that runs past the header section, and the header value takes 7 bytes of the payload.");
  process.exit(1);
}
console.log("OK: decode() refuses a header value that runs past the header section.");
