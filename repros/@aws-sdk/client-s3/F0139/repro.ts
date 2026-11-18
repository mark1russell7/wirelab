// F0139: @aws-sdk/client-s3 3.1171.0 with @smithy/core 3.41.0. EventStreamSerde.deserializeEventStream() tests the
// event type with `unionMember in memberSchemas`, and memberSchemas is a plain object. Thus an event type that is the name
// of an Object.prototype member, for example toString, finds an inherited value, and the call of isStructSchema() on it
// throws a TypeError. The SDK skips each other unknown event type. A local request handler gives the event stream.
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
    return `events: ${seen.join(", ")}`;
  } catch (error) {
    return `throws ${(error as Error).name}: ${(error as Error).message.split("\n")[0]}`;
  }
}

const records = event("Records", new Uint8Array(Buffer.from("a,b\n")));
const end = event("End");
let faults = 0;
for (const type of ["FutureEvent", "toString", "constructor", "__proto__"]) {
  const result = await select([event(type), records, end]);
  const ok = result === 'events: Records "a,b", End';
  if (!ok) faults++;
  console.log(`${ok ? "ok   " : "FAULT"} unknown event type ${JSON.stringify(type)}, then Records and End: ${result}`);
}
if (faults > 0) {
  console.log(`BUG PRESENT: ${faults} of 4 unknown event types make send() reject, but the SDK skips the unknown event type "FutureEvent".`);
  process.exit(1);
}
console.log("OK: the SDK skips each unknown event type.");
