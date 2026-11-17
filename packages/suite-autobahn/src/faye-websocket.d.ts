// The package faye-websocket has no types, and DefinitelyTyped has none. This file declares the part of the client
// that the suite uses, from lib/faye/websocket/api.js of version 0.11.4.
declare module "faye-websocket" {
  namespace faye {
    /** A WebSocket client connection. Its events come from `EventTarget` and from `Stream`. */
    class Client {
      constructor(url: string, protocols?: readonly string[] | null, options?: Record<string, unknown>);
      on(event: "open", listener: () => void): this;
      on(event: "message", listener: (event: { readonly data: string | Buffer }) => void): this;
      on(event: "error", listener: (event: { readonly message: string }) => void): this;
      on(event: "close", listener: (event: { readonly code: number; readonly reason: string }) => void): this;
      /** This method sends a string as a text message, and a `Buffer` as a binary message. */
      send(data: string | Buffer): boolean;
      /** This method starts the closing handshake. A timer ends the connection when the server does not answer. */
      close(code?: number, reason?: string): void;
    }
  }
  export = faye;
}
