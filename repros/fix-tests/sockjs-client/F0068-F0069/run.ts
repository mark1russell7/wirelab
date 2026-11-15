// The fix branches of sockjs-client for F0068 (#711) and F0069 (#712).
import { fixTest } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

await fixTest(spec, [
  { id: "F0068", branch: "fix/info-receiver-close-timer", grep: "should not start the info request" },
  { id: "F0069", branch: "fix/no-message-after-close", grep: "should not dispatch the rest of a frame" },
]);
