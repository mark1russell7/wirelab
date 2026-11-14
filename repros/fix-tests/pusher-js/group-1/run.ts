// The connection fixes of pusher-js. Each item runs the ledger repro with the clone, before and after the fix.
// F0072: a pusher:error with no close action in the handshake leaves the client unavailable.
// F0078: disconnect() after a close with a backoff code does not stop the reconnect.
// F0079: connect() during the retry wait does not cancel the retry timer.
import { fixTest } from "../../lib/fix-test.ts";
import { repro, spec } from "../spec.ts";

await fixTest(spec, [
  {
    id: "F0072",
    branch: "fix/handshake-null-action",
    filter: "Handshake after a handshake with null action",
    checks: [repro(/^after 20 s/)],
  },
  {
    id: "F0078",
    branch: "fix/retry-timer-replace",
    filter: "backoff close",
    checks: [repro(/^after 3 s/)],
  },
  {
    id: "F0079",
    branch: "fix/connect-clears-retry-timer",
    filter: "should cancel the retry when connect",
    checks: [repro(/^after 3 s/)],
  },
]);
