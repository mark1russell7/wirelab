/**
 * The targets of `@connectrpc/connect-web`: a Connect server stream, a gRPC-web server stream and a gRPC-web unary
 * call. The scripted server of `@mark1russell7/rigor-testkit` sends the bytes of a probe as the body of one HTTP
 * response. The target gives the outcome of the call.
 */
import { create, createFileRegistry, toBinary } from "@bufbuild/protobuf";
import { FileDescriptorProtoSchema, StringValueSchema, file_google_protobuf_wrappers } from "@bufbuild/protobuf/wkt";
import { Code, createClient } from "@connectrpc/connect";
import { createConnectTransport, createGrpcWebTransport } from "@connectrpc/connect-web";
import { startScriptedServer, type ScriptedReply } from "@mark1russell7/rigor-testkit/http";
import { concatBytes, type Frame, type FramedStream } from "../cuts.ts";
import { outcomeOf, type Outcome } from "../outcome.ts";
import type { CallKind, EnvelopeTarget, ReplyProtocol, ReplyTarget } from "./target.ts";

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

/** The options of a call of the client of `test.Svc`. `onTrailer` gets the trailers of the call. */
interface CallOptions {
  readonly signal: AbortSignal;
  readonly onTrailer: (trailers: Headers) => void;
}

/**
 * The methods of the client of `test.Svc`. The descriptor is data and not generated code, so the type of the client
 * comes from this interface.
 */
interface SvcClient {
  unary(request: { value: string }, options: CallOptions): Promise<{ value?: unknown }>;
  stream(request: { value: string }, options: CallOptions): AsyncIterable<{ value?: unknown }>;
}

/** This function gives the binary form of `StringValue { value }`. */
export function stringValue(value: string): Uint8Array {
  return toBinary(StringValueSchema, create(StringValueSchema, { value }));
}

/** This function gives one envelope of Connect and gRPC-web: a flags byte, a 4-byte big-endian length, the payload. */
export function envelope(flags: number, payload: Uint8Array | string): Frame {
  const data = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const head = new Uint8Array(5);
  head[0] = flags;
  new DataView(head.buffer).setUint32(1, data.length, false);
  return { bytes: concatBytes([head, data]), prefix: 5, fields: [1, 4] };
}

/** This function gives the `EndStreamResponse` envelope of a Connect stream, with the JSON `json`. */
export function connectEndStream(json: unknown): Uint8Array {
  return envelope(2, JSON.stringify(json)).bytes;
}

/** This function gives the trailer envelope of gRPC-web with the fields `fields`, one line for each field. */
export function grpcWebTrailer(fields: Readonly<Record<string, string>>): Uint8Array {
  return envelope(
    0x80,
    Object.entries(fields)
      .map(([name, value]) => `${name}: ${value}\r\n`)
      .join(""),
  ).bytes;
}

/**
 * This function gives the name of a code of Connect, for example `InvalidArgument` for 3. A value that is not a code
 * gives its type and the start of its text, so a report shows it.
 */
function codeName(code: unknown): string {
  if (typeof code === "number" && Code[code] !== undefined) return Code[code];
  return `not a code (${typeof code}): ${String(code).slice(0, 40)}`;
}

/** The reply protocols of `@connectrpc/connect-web`. */
type ConnectProtocol = Extract<ReplyProtocol, "connect" | "grpc-web">;

/** The content types of a binary response of each protocol and kind of call. */
const CONTENT_TYPES: Readonly<Record<ConnectProtocol, Readonly<Record<CallKind, string>>>> = {
  connect: { unary: "application/proto", stream: "application/connect+proto" },
  "grpc-web": { unary: "application/grpc-web+proto", stream: "application/grpc-web+proto" },
};

/**
 * This function makes one call of `kind` over `protocol` to a scripted server that answers with `reply`. It gives the
 * values and the trailers that the caller got, or the error of the call.
 */
async function callWith(protocol: ConnectProtocol, kind: CallKind, reply: ScriptedReply): Promise<Outcome> {
  const path = kind === "stream" ? "/test.Svc/Stream" : "/test.Svc/Unary";
  const server = await startScriptedServer({ routes: [{ method: "POST", path, replies: [reply] }] });
  try {
    const baseUrl = server.url;
    const made = protocol === "connect" ? createConnectTransport({ baseUrl, useBinaryFormat: true }) : createGrpcWebTransport({ baseUrl });
    const client = createClient(service, made) as unknown as SvcClient;
    return await outcomeOf(
      async (signal) => {
        let trailers: (readonly [string, string])[] = [];
        const onTrailer = (got: Headers): void => {
          trailers = [...got.entries()];
        };
        const values: string[] = [];
        if (kind === "unary") {
          values.push(String((await client.unary({ value: "x" }, { signal, onTrailer })).value));
        } else {
          for await (const one of client.stream({ value: "x" }, { signal, onTrailer })) values.push(String(one.value));
        }
        return { values, trailers };
      },
      limitMs,
      codeName,
    );
  } finally {
    await server.close();
  }
}

/** This function makes a target of one protocol and one kind of call. It is an envelope target and a reply target. */
function target(id: string, protocol: ConnectProtocol, kind: CallKind, valid: FramedStream): EnvelopeTarget & ReplyTarget {
  const contentType = CONTENT_TYPES[protocol][kind];
  return {
    id,
    ...CONNECT_WEB,
    protocol,
    call: kind,
    // The Connect and gRPC-web protocols end a response with the end marker. The universal transports of
    // `@connectrpc/connect` refuse a frame after it.
    afterEnd: "refuse",
    stream: () => valid,
    run: (bytes) => callWith(protocol, kind, { status: 200, fields: { "content-type": contentType }, body: bytes }),
    reply: (reply) => callWith(protocol, kind, reply),
  };
}

/** The trailer frame of gRPC-web with the status 0. */
const grpcWebOk = envelope(0x80, "grpc-status: 0\r\n");

/** The targets of `@connectrpc/connect-web` for the format `length-prefixed-envelope`. */
export const connectWebTargets: readonly (EnvelopeTarget & ReplyTarget)[] = [
  target("connect-web/connect-stream", "connect", "stream", {
    frames: [envelope(0, stringValue("a")), envelope(0, stringValue("b")), envelope(2, "{}")],
  }),
  target("connect-web/grpc-web-stream", "grpc-web", "stream", {
    frames: [envelope(0, stringValue("a")), envelope(0, stringValue("b")), grpcWebOk],
  }),
  target("connect-web/grpc-web-unary", "grpc-web", "unary", { frames: [envelope(0, stringValue("a")), grpcWebOk] }),
];

/**
 * The Connect unary call of `@connectrpc/connect-web`. Its body is one message with no envelope, so it is only a reply
 * target.
 */
export const connectWebUnaryTarget: ReplyTarget = {
  id: "connect-web/connect-unary",
  ...CONNECT_WEB,
  protocol: "connect",
  call: "unary",
  reply: (reply) => callWith("connect", "unary", reply),
};

/** Each reply target of `@connectrpc/connect-web`. */
export const connectWebReplyTargets: readonly ReplyTarget[] = [connectWebUnaryTarget, ...connectWebTargets];
