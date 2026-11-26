/**
 * The targets of `@connectrpc/connect-web`: a Connect server stream, a gRPC-web server stream and a gRPC-web unary
 * call. The scripted server of `@mark1russell7/rigor-testkit` sends the bytes of a probe as the body of one HTTP
 * response. The target gives the outcome of the call.
 */
import { create, createFileRegistry, toBinary } from "@bufbuild/protobuf";
import { FileDescriptorProtoSchema, StringValueSchema, file_google_protobuf_wrappers } from "@bufbuild/protobuf/wkt";
import { Code, createClient } from "@connectrpc/connect";
import { createConnectTransport, createGrpcWebTransport } from "@connectrpc/connect-web";
import { startScriptedServer } from "@mark1russell7/rigor-testkit/http";
import { concatBytes, type Frame, type FramedStream } from "../cuts.ts";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { EnvelopeTarget } from "./target.ts";

/** The package and the version of the targets. The version is the version that the workspace installs. */
export const CONNECT_WEB = { package: "@connectrpc/connect-web", version: "2.3.0" } as const;

/** The time limit in ms of one call. */
const limitMs = 5_000;

/**
 * The service of the targets: `test.Svc` with `Unary(StringValue) returns (StringValue)` and
 * `Stream(StringValue) returns (stream StringValue)`. The descriptor is data, so the targets need no generated code.
 */
const registry = createFileRegistry(
  create(FileDescriptorProtoSchema, {
    name: "rig/test.proto",
    package: "test",
    syntax: "proto3",
    dependency: ["google/protobuf/wrappers.proto"],
    service: [
      {
        name: "Svc",
        method: [
          { name: "Unary", inputType: ".google.protobuf.StringValue", outputType: ".google.protobuf.StringValue" },
          { name: "Stream", inputType: ".google.protobuf.StringValue", outputType: ".google.protobuf.StringValue", serverStreaming: true },
        ],
      },
    ],
  }),
  (name) => (name === "google/protobuf/wrappers.proto" ? file_google_protobuf_wrappers : undefined),
);
const found = registry.getService("test.Svc");
if (found === undefined) throw new Error("The descriptor of the rig has no service test.Svc.");
const service = found;

/**
 * The methods of the client of `test.Svc`. The descriptor is data and not generated code, so the type of the client
 * comes from this interface.
 */
interface SvcClient {
  unary(request: { value: string }, options: { signal: AbortSignal }): Promise<{ value?: unknown }>;
  stream(request: { value: string }, options: { signal: AbortSignal }): AsyncIterable<{ value?: unknown }>;
}

/** This function gives the binary form of `StringValue { value }`. */
function stringValue(value: string): Uint8Array {
  return toBinary(StringValueSchema, create(StringValueSchema, { value }));
}

/** This function gives one envelope of Connect and gRPC-web: a flags byte, a 4-byte big-endian length, the payload. */
export function envelope(flags: number, payload: Uint8Array | string): Frame {
  const data = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const head = new Uint8Array(5);
  head[0] = flags;
  new DataView(head.buffer).setUint32(1, data.length, false);
  return { bytes: concatBytes([head, data]), prefix: 5 };
}

/** This function gives the name of a code of Connect, for example `invalid_argument` for 3. */
function codeName(code: unknown): string {
  return typeof code === "number" && Code[code] !== undefined ? Code[code] : String(code);
}

/** The kinds of call of a target. */
type CallKind = "stream" | "unary";

/** This function makes a target of one transport and one kind of call. */
function target(id: string, contentType: string, kind: CallKind, valid: FramedStream, transport: "connect" | "grpc-web"): EnvelopeTarget {
  return {
    id,
    ...CONNECT_WEB,
    stream: () => valid,
    async run(bytes: Uint8Array): Promise<Outcome> {
      const path = kind === "stream" ? "/test.Svc/Stream" : "/test.Svc/Unary";
      const server = await startScriptedServer({
        routes: [{ method: "POST", path, replies: [{ status: 200, fields: { "content-type": contentType }, body: bytes }] }],
      });
      try {
        const baseUrl = server.url;
        const made =
          transport === "connect" ? createConnectTransport({ baseUrl, useBinaryFormat: true }) : createGrpcWebTransport({ baseUrl });
        const client = createClient(service, made) as unknown as SvcClient;
        return await outcomeOf(
          async (signal) => {
            if (kind === "unary") {
              const reply = await client.unary({ value: "x" }, { signal });
              return [String(reply.value)];
            }
            const values: string[] = [];
            for await (const reply of client.stream({ value: "x" }, { signal })) {
              values.push(String(reply.value));
            }
            return values;
          },
          limitMs,
          codeName,
        );
      } finally {
        await server.close();
      }
    },
  };
}

/** The trailer frame of gRPC-web with the status 0. */
const grpcWebOk = envelope(0x80, "grpc-status: 0\r\n");

/** The targets of `@connectrpc/connect-web` for the format `length-prefixed-envelope`. */
export const connectWebTargets: readonly EnvelopeTarget[] = [
  target(
    "connect-web/connect-stream",
    "application/connect+proto",
    "stream",
    { frames: [envelope(0, stringValue("a")), envelope(0, stringValue("b")), envelope(2, "{}")] },
    "connect",
  ),
  target(
    "connect-web/grpc-web-stream",
    "application/grpc-web+proto",
    "stream",
    { frames: [envelope(0, stringValue("a")), envelope(0, stringValue("b")), grpcWebOk] },
    "grpc-web",
  ),
  target("connect-web/grpc-web-unary", "application/grpc-web+proto", "unary", { frames: [envelope(0, stringValue("a")), grpcWebOk] }, "grpc-web"),
];
