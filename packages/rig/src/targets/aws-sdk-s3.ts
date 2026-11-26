/**
 * The target of `@aws-sdk/client-s3`: the event stream of `SelectObjectContentCommand`. A local request handler gives
 * the bytes. Each event message is one frame. Its prefix is the 4-byte total length, which `getChunkedStream` of
 * `@smithy/core` reads first.
 */
import { Readable } from "node:stream";
import { S3Client, SelectObjectContentCommand } from "@aws-sdk/client-s3";
import { EventStreamCodec } from "@smithy/core/event-streams";
import { HttpResponse } from "@smithy/core/transport";
import type { Frame, FramedStream } from "../cuts.ts";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { EnvelopeTarget } from "./target.ts";

/** The package and the version of the target. The version is the version that the workspace installs. */
export const AWS_SDK_S3 = { package: "@aws-sdk/client-s3", version: "3.1175.0" } as const;

/** The time limit in ms of one call. */
const limitMs = 5_000;

/** The width of the prefix of an event message: the total length. The prelude also has the header length and a CRC. */
const PREFIX = 4;

const utf8 = new TextEncoder();
const codec = new EventStreamCodec(
  (bytes) => new TextDecoder().decode(bytes),
  (text) => utf8.encode(text),
);

/** This function gives the bytes of one event message of the type `type`. */
function event(type: string, body: Uint8Array = new Uint8Array(0)): Uint8Array {
  return codec.encode({
    headers: {
      ":message-type": { type: "string", value: "event" },
      ":event-type": { type: "string", value: type },
      ":content-type": { type: "string", value: "application/octet-stream" },
    },
    body,
  });
}

/** This function gives a valid event stream: two Records events and the End event, which is the end marker. */
function selectStream(): FramedStream {
  const frame = (bytes: Uint8Array): Frame => ({ bytes, prefix: PREFIX });
  return { frames: [frame(event("Records", utf8.encode("a,b\n"))), frame(event("Records", utf8.encode("c,d\n"))), frame(event("End"))] };
}

/** A request handler that answers each request with `body` and status 200. */
class LocalHandler {
  readonly #body: Uint8Array;
  constructor(body: Uint8Array) {
    this.#body = body;
  }
  handle(): Promise<{ response: HttpResponse }> {
    return Promise.resolve({ response: new HttpResponse({ statusCode: 200, headers: {}, body: Readable.from([this.#body]) }) });
  }
  updateHttpClientConfig(): void {}
  httpHandlerConfigs(): Record<string, never> {
    return {};
  }
}

/** The target: the events that the caller reads from the stream, or its error. */
export const awsSdkS3Target: EnvelopeTarget = {
  id: "aws-sdk/s3-select-object-content",
  ...AWS_SDK_S3,
  // The End event is an event of the S3 API. The event stream format has no rule for an event after it, so the target
  // has no value of `afterEnd`.
  stream: selectStream,
  run(bytes: Uint8Array): Promise<Outcome> {
    return outcomeOf(async () => {
      const client = new S3Client({
        region: "us-east-1",
        credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "test-only" },
        requestHandler: new LocalHandler(bytes),
      });
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
      const seen: string[] = [];
      for await (const item of response.Payload ?? []) {
        seen.push(item.Records ? `Records ${new TextDecoder().decode(item.Records.Payload).trim()}` : Object.keys(item).join());
      }
      return seen;
    }, limitMs);
  },
};
