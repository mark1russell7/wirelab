// F0140: @aws-sdk/client-s3 3.1171.0 with @smithy/core 3.41.0. getChunkedStream() splits an event stream into messages.
// When the source ends, it throws "Truncated event message received." only if it has read the 4-byte total length of the
// next message. When the source ends after 1, 2 or 3 bytes of that length, the stream ends with no error. A local request
// handler gives the event stream: one Records event, then the first bytes of a second Records event.
import { S3Client, SelectObjectContentCommand } from "@aws-sdk/client-s3";
import { EventStreamCodec } from "@smithy/core/event-streams";
import { HttpResponse } from "@smithy/core/transport";
import { Readable } from "node:stream";

const codec = new EventStreamCodec(
  (bytes) => Buffer.from(bytes).toString("utf8"),
  (text) => new Uint8Array(Buffer.from(text, "utf8")),
);
const event = (type: string, body: Uint8Array = new Uint8Array(0)): Uint8Array =>
  codec.encode({
    headers: {
      ":message-type": { type: "string", value: "event" },
      ":event-type": { type: "string", value: type },
      ":content-type": { type: "string", value: "application/octet-stream" },
    },
    body,
  });

class LocalHandler {
  readonly chunks: Uint8Array[];
  constructor(chunks: Uint8Array[]) {
    this.chunks = chunks;
  }
  async handle(): Promise<{ response: HttpResponse }> {
    return { response: new HttpResponse({ statusCode: 200, headers: {}, body: Readable.from(this.chunks) }) };
  }
  updateHttpClientConfig(): void {}
  httpHandlerConfigs(): Record<string, never> {
    return {};
  }
}

async function select(chunks: Uint8Array[]): Promise<string> {
  const client = new S3Client({
    region: "us-east-1",
    credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "test-only" },
    requestHandler: new LocalHandler(chunks),
  });
  const seen: string[] = [];
  try {
    const response = await client.send(
      new SelectObjectContentCommand({
        Bucket: "bucket",
        Key: "key",
        Expression: "SELECT * FROM S3Object",
        ExpressionType: "SQL",
        InputSerialization: { CSV: {} },
        OutputSerialization: { CSV: {} },
      }),
    );
    for await (const item of response.Payload ?? []) {
      seen.push(item.Records ? `Records "${Buffer.from(item.Records.Payload ?? []).toString().trim()}"` : Object.keys(item).join());
    }
    return `ends with no error after events: ${seen.join(", ")}`;
  } catch (error) {
    return `throws ${(error as Error).name}: ${(error as Error).message.split("\n")[0]} (after events: ${seen.join(", ")})`;
  }
}

const first = event("Records", new Uint8Array(Buffer.from("a,b\n")));
const second = event("Records", new Uint8Array(Buffer.from("c,d\n")));
let faults = 0;
for (const cut of [1, 2, 3, 4, 5, 12]) {
  const result = await select([first, second.subarray(0, cut)]);
  const ok = result.startsWith("throws") && result.includes("Truncated event message received.");
  if (!ok) faults++;
  console.log(`${ok ? "ok   " : "FAULT"} the stream ends after ${cut} of the ${second.length} bytes of the second message: ${result}`);
}
if (faults > 0) {
  console.log(`BUG PRESENT: in ${faults} of 6 cuts, a truncated message ends the event stream with no error. A cut after the 4-byte total length gives "Truncated event message received.".`);
  process.exit(1);
}
console.log("OK: each truncated message gives an error.");
