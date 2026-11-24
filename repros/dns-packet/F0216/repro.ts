// dns-packet 5.6.1. streamEncode.bytes counts the 2-byte length prefix of a TCP message, but streamDecode.bytes is
// decode.bytes and does not count it. A reader of a TCP stream that removes streamDecode.bytes from its buffer after
// each message keeps the last 2 bytes of the message, and reads them as the length prefix of the next one.
import dnsPacket from "dns-packet";

const message = dnsPacket.streamEncode({ type: "query", id: 7, questions: [{ type: "A", name: "example.com" }] });
const encoded = dnsPacket.streamEncode.bytes;
dnsPacket.streamDecode(message);
const decoded = dnsPacket.streamDecode.bytes;
console.log(`stream message: ${message.length} bytes; streamEncode.bytes ${encoded}; streamDecode.bytes ${decoded}`);

const bug = decoded !== message.length;
console.log("expected: streamDecode.bytes is the bytes of the stream message that it read, as streamEncode.bytes is");
console.log(bug ? "BUG PRESENT" : "BUG ABSENT");
process.exit(bug ? 1 : 0);
