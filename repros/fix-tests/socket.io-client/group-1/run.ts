// The fix branches of socket.io-client 4.8.4 for F0055, F0056 and F0057.
import { fixTest } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

await fixTest(spec, [
  { id: "F0055", branch: "fix/sio-client-volatile-not-connected", file: "test/socket.ts", grep: "volatile packet when the namespace is not connected" },
  { id: "F0056", branch: "fix/sio-client-volatile-ack-leak", file: "test/socket.ts", grep: "discarded volatile packet|volatile packet is discarded" },
  { id: "F0057", branch: "fix/sio-client-connect-during-handshake", file: "test/connection.ts", grep: "second CONNECT packet" },
]);
