// F0062: the type of the value of socket.timeout(ms).emitWithAck(). The events are those of test/typed-events.test-d.ts.
// The check fails when the type is any. The hooks copy this file into packages/socket.io-client/test/.
import { io, Socket } from "../build/cjs/index.js";

interface ClientToServerEvents {
  ackFromClientSingleArg: (a: string, b: number, ack: (c: string) => void) => void;
}

type IsAny<T> = 0 extends 1 & T ? true : false;

export async function check() {
  const socket: Socket<{}, ClientToServerEvents> = io();

  const value = await socket.emitWithAck("ackFromClientSingleArg", "1", 2);
  const valueIsAny: IsAny<typeof value> = false;

  const valueWithTimeout = await socket.timeout(1000).emitWithAck("ackFromClientSingleArg", "3", 4);
  const valueWithTimeoutIsAny: IsAny<typeof valueWithTimeout> = false;
  const valueWithTimeoutIsString: string = valueWithTimeout;

  return [valueIsAny, valueWithTimeoutIsAny, valueWithTimeoutIsString];
}
