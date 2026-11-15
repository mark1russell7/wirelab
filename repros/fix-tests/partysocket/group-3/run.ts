// The fix branches of partysocket, group-3.
import { fixTest } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

await fixTest(spec, [
  { id: "F0045", branch: "fix/partysocket-close-before-socket-event" },
  { id: "F0046", branch: "fix/partysocket-throwing-handler" },
  { id: "F0047", branch: "fix/partysocket-random-default-delay" },
  { id: "F0049", branch: "fix/partysocket-close-clears-backoff" },
]);
