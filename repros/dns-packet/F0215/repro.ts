// dns-packet 5.6.1. The README documents streamDecode(buf, [offset]), but streamDecode has no offset parameter: it
// always reads the length prefix at byte 0 and decodes from byte 2. A caller with two TCP messages in one buffer that
// decodes the second one at its offset gets the first message again.
import dnsPacket from "dns-packet";

const first = dnsPacket.streamEncode({ type: "query", id: 1, questions: [{ type: "A", name: "first.example" }] });
const second = dnsPacket.streamEncode({ type: "query", id: 2, questions: [{ type: "A", name: "second.example" }] });
const both = Buffer.concat([first, second]);

const streamDecode = dnsPacket.streamDecode as unknown as (buf: Buffer, offset?: number) => ReturnType<typeof dnsPacket.decode>;
const atOffset = streamDecode(both, first.length);
console.log(`streamDecode(buf, ${first.length}): id ${atOffset.id}, question ${atOffset.questions?.[0]?.name}`);

const bug = atOffset.id !== 2;
console.log("expected: id 2, question second.example (the message at that offset)");
console.log(bug ? "BUG PRESENT" : "BUG ABSENT");
process.exit(bug ? 1 : 0);
