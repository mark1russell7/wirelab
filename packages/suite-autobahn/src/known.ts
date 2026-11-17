/** The known failures of one client: the identifier of each case and the finding that tells its fault. */
export interface KnownFailures {
  /** The cases with a failed behavior, for example `{ "6.4.1": "F0123" }`. */
  readonly behavior: Readonly<Record<string, string>>;
  /** The cases with a failed close behavior. */
  readonly close: Readonly<Record<string, string>>;
}

/**
 * The known failures of each client, by the name of the client. A known failure is a test that fails, so a fix of the
 * client stops the test. Then the case leaves this list.
 */
export const knownFailures: Readonly<Record<string, KnownFailures>> = {
  ws: { behavior: {}, close: {} },
  websocket: { behavior: {}, close: {} },
  "faye-websocket": { behavior: {}, close: {} },
  node: { behavior: {}, close: {} },
};
