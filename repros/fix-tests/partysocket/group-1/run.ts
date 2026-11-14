// The fix branches of partysocket, group-1.
import { fixTest } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

await fixTest(spec, [
  { id: "F0037", branch: "fix/partysocket-browser-event-clone" },
  { id: "F0038", branch: "fix/partysocket-close-invalid-code" },
  { id: "F0039", branch: "fix/partysocket-reconnect-ignores-predicate" },
  { id: "F0040", branch: "fix/partysocket-provider-rejects-nullish" },
]);
