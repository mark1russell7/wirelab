/**
 * The target of `@microsoft/signalr`: a HubConnection of the JSON hub protocol on a fake transport. The transport plays
 * the hub server, so the target needs no server and no network. A custom HttpClient answers the negotiate request.
 *
 * - An outbound case uploads a stream (a Subject argument). The end is the Completion of the server, or a local close
 *   (dispose() of a stream() call). HubProtocol.md tells the caller to stop its upload stream at either end.
 * - An inbound case reads a server stream. The end is the Completion of the server, or a local close (dispose()).
 */
import { HttpClient, HttpResponse, HubConnectionBuilder, LogLevel, Subject, type HttpRequest, type HubConnection, type ITransport } from "@microsoft/signalr";
import type { SessionCase, SessionRun, SessionTarget } from "./target.ts";

/** The package and the version of the target. The version is the version that the workspace installs. */
export const SIGNALR = { package: "@microsoft/signalr", version: "11.0.0" } as const;

/** The record separator of the JSON hub protocol. */
const RS = "\x1e";

/** The message types of the hub protocol that the target uses. */
const STREAM_ITEM = 2;
const COMPLETION = 3;
const STREAM_INVOCATION = 4;
const CANCEL_INVOCATION = 5;

/** One message of the hub protocol, with the fields that the target reads. */
interface HubMessage {
  readonly type?: number;
  readonly target?: string;
  readonly invocationId?: string | undefined;
  readonly streamIds?: readonly string[];
  readonly item?: unknown;
  readonly error?: string;
}

/** The script of the server: it gets each message of the client after the handshake. */
type ServerScript = (message: HubMessage, peer: ScriptedTransport) => void;

/** A HttpClient that answers the negotiate request with no transports, because the caller gives the transport. */
class NegotiateOnly extends HttpClient {
  override async send(request: HttpRequest): Promise<HttpResponse> {
    if (request.url?.includes("/negotiate") === true) {
      return new HttpResponse(200, "OK", JSON.stringify({ connectionId: "c1", connectionToken: "t1", negotiateVersion: 1, availableTransports: [] }));
    }
    return new HttpResponse(200, "OK", "");
  }
}

/** The fake transport: it records each message of the client and gives each message to the script of the server. */
class ScriptedTransport implements ITransport {
  onreceive: ((data: string | ArrayBuffer) => void) | null = null;
  onclose: ((error?: Error) => void) | null = null;
  /** Each message of the client, with `late` true after the end of the case. */
  readonly sent: { readonly message: HubMessage; readonly late: boolean }[] = [];
  /** True after the end of the case. */
  ended = false;
  private handshake = false;
  private readonly server: ServerScript;
  constructor(server: ServerScript) {
    this.server = server;
  }
  async connect(): Promise<void> {}
  async send(data: unknown): Promise<void> {
    for (const text of String(data).split(RS).filter((one) => one !== "")) {
      if (!this.handshake) {
        // The first message is the handshake request. The answer is an empty handshake response.
        this.handshake = true;
        this.later(`{}${RS}`);
        continue;
      }
      const message = JSON.parse(text) as HubMessage;
      this.sent.push({ message, late: this.ended });
      this.server(message, this);
    }
  }
  /** This method gives the texts to the client as one receive, in a later task. */
  later(...texts: string[]): void {
    setTimeout(() => this.onreceive?.(texts.join("")), 0);
  }
  async stop(): Promise<void> {
    this.onclose?.();
  }
}

/** This function gives the text of one message of the hub protocol. */
const record = (message: HubMessage): string => `${JSON.stringify(message)}${RS}`;

/** This function waits for the tasks of the client. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

/** This function starts a HubConnection on a scripted transport. */
async function connect(server: ServerScript): Promise<{ hub: HubConnection; transport: ScriptedTransport }> {
  const transport = new ScriptedTransport(server);
  const hub = new HubConnectionBuilder()
    .withUrl("http://hub.invalid/hub", { httpClient: new NegotiateOnly(), transport })
    .configureLogging(LogLevel.None)
    .build();
  await hub.start();
  return { hub, transport };
}

/** This function gives the text of a message of an upload stream: the item, or the Completion. */
const uploadText = (message: HubMessage): string => (message.type === STREAM_ITEM ? `item ${String(message.item)}` : "completion");

/**
 * An outbound case. The client sends the item `1` of the upload stream, and then the server or the caller ends the
 * call. After the end, the caller gives the item `late` (data) or completes the Subject (trailer).
 */
async function runOutbound(one: SessionCase): Promise<SessionRun> {
  let streamId: string | undefined;
  let invocationId: string | undefined;
  const { hub, transport } = await connect((message, peer) => {
    if (message.streamIds !== undefined) {
      streamId = message.streamIds[0];
      invocationId = message.invocationId;
    }
    // The server completes the invocation when it gets the first item of the upload.
    if (one.after === "completion of the peer" && message.type === STREAM_ITEM && message.invocationId === streamId && !peer.ended) {
      peer.ended = true;
      peer.later(record({ type: COMPLETION, invocationId, error: "upload rejected" }));
    }
  });
  try {
    const upload = new Subject<string>();
    if (one.after === "completion of the peer") {
      const call = hub.invoke("Upload", upload).catch(() => undefined);
      upload.next("1");
      await call;
    } else {
      const subscription = hub.stream("Upload", upload).subscribe({ next: () => undefined, error: () => undefined, complete: () => undefined });
      upload.next("1");
      await settle();
      transport.ended = true;
      subscription.dispose();
    }
    if (one.frame === "trailer") upload.complete();
    else upload.next("late");
    await settle();
    const ofStream = transport.sent.filter((item) => (item.message.type === STREAM_ITEM || item.message.type === COMPLETION) && item.message.invocationId === streamId);
    return {
      before: ofStream.filter((item) => !item.late).map((item) => uploadText(item.message)),
      after: ofStream.filter((item) => item.late).map((item) => uploadText(item.message)),
    };
  } finally {
    await hub.stop();
  }
}

/**
 * An inbound case. The server answers the StreamInvocation with the item `1`. Then the server or the caller ends the
 * stream, and the server sends an item `late` or a second Completion. The record has each event of the subscriber.
 */
async function runInbound(one: SessionCase): Promise<SessionRun> {
  const item = (invocationId: string | undefined, value: string): string => record({ type: STREAM_ITEM, invocationId, item: value });
  const done = (invocationId: string | undefined, error?: string): string => record({ type: COMPLETION, invocationId, ...(error === undefined ? {} : { error }) });
  const { hub } = await connect((message, peer) => {
    const id = message.invocationId;
    if (message.type === STREAM_INVOCATION) {
      if (one.after === "local close()") {
        peer.later(item(id, "1"));
        return;
      }
      const extra = one.frame === "trailer" ? done(id, "late") : item(id, "late");
      if (one.frame === "message batch") {
        peer.later(item(id, "1"), done(id), extra);
        return;
      }
      peer.later(item(id, "1"));
      peer.later(done(id));
      if (one.after === "second end-of-stream") peer.later(done(id));
      peer.later(extra);
    }
    // After the CancelInvocation of the caller, the server still sends an item.
    if (message.type === CANCEL_INVOCATION) peer.later(item(id, "late"));
  });
  try {
    const events: { readonly text: string; readonly late: boolean }[] = [];
    let ended = false;
    const subscription = hub.stream<string>("Items").subscribe({
      next: (value) => {
        events.push({ text: `next ${value}`, late: ended });
        if (value === "1" && one.after === "local close()") {
          ended = true;
          subscription.dispose();
        }
      },
      error: (error: unknown) => {
        events.push({ text: `error ${error instanceof Error ? error.message : String(error)}`, late: ended });
        ended = true;
      },
      complete: () => {
        events.push({ text: "complete", late: ended });
        ended = true;
      },
    });
    await settle();
    return { before: events.filter((event) => !event.late).map((event) => event.text), after: events.filter((event) => event.late).map((event) => event.text) };
  } finally {
    await hub.stop();
  }
}

/** The cases of the target. The variant names the call of the caller. */
const cases: readonly SessionCase[] = [
  { after: "completion of the peer", frame: "data", direction: "outbound", variant: "invoke with an upload" },
  { after: "completion of the peer", frame: "trailer", direction: "outbound", variant: "invoke with an upload" },
  { after: "local close()", frame: "data", direction: "outbound", variant: "stream with an upload, dispose()" },
  { after: "local close()", frame: "trailer", direction: "outbound", variant: "stream with an upload, dispose()" },
  { after: "completion of the peer", frame: "data", direction: "inbound", variant: "stream" },
  { after: "completion of the peer", frame: "trailer", direction: "inbound", variant: "stream" },
  { after: "completion of the peer", frame: "message batch", direction: "inbound", variant: "stream" },
  { after: "local close()", frame: "data", direction: "inbound", variant: "stream, dispose()" },
  { after: "second end-of-stream", frame: "data", direction: "inbound", variant: "stream" },
];

/** The target of `@microsoft/signalr`. */
export const signalrTarget: SessionTarget = {
  id: "signalr/hub-connection",
  ...SIGNALR,
  format: "json-ws",
  cases,
  run: (one) => (one.direction === "outbound" ? runOutbound(one) : runInbound(one)),
};
