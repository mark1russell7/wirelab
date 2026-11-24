// dns-packet 5.6.1. Each codec of the package returns the buffer from encode: dnsPacket.encode, answer.encode, name.encode
// and each record codec. question.encode returns its input question instead, so a caller that encodes one question
// without a buffer gets the question object back and not the bytes. The bytes go to a buffer that the caller never sees.
import dnsPacket from "dns-packet";

interface Codec {
  encode(value: unknown, buf?: Buffer, offset?: number): unknown;
}
const codecs = dnsPacket as unknown as { question: Codec; answer: Codec };

const fromAnswer = codecs.answer.encode({ type: "A", name: "example.com", data: "1.2.3.4" });
const fromQuestion = codecs.question.encode({ type: "A", name: "example.com" });
console.log(`answer.encode returns ${Buffer.isBuffer(fromAnswer) ? "a Buffer" : typeof fromAnswer}`);
console.log(`question.encode returns ${Buffer.isBuffer(fromQuestion) ? "a Buffer" : typeof fromQuestion}: ${JSON.stringify(fromQuestion)}`);

const bug = !Buffer.isBuffer(fromQuestion);
console.log("expected: question.encode returns the buffer with the encoded question, as the other codecs do");
console.log(bug ? "BUG PRESENT" : "BUG ABSENT");
process.exit(bug ? 1 : 0);
