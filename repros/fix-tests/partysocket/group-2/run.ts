// The fix branches of partysocket, group-2.
import { fixTest } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

await fixTest(spec, [
  { id: "F0041", branch: "fix/partysocket-update-properties-path" },
  { id: "F0042", branch: "fix/partysocket-update-properties-merge" },
  { id: "F0043", branch: "fix/partysocket-react-enable-then-change" },
  { id: "F0044", branch: "fix/partysocket-node-close-event-fields" },
]);
