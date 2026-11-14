// The fix branches of partysocket, group-4.
import { fixTest } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

await fixTest(spec, [
  { id: "F0050", branch: "fix/partysocket-encode-room-name" },
  { id: "F0051", branch: "fix/partysocket-no-global-crypto" },
  { id: "F0053", branch: "fix/partysocket-hook-handler-types" },
  { id: "F0054", branch: "fix/partysocket-fetch-basepath-type" },
]);
