// F0070 (no retry after a handshake error). The ledger repro gives the state 20 s after a bad handshake.
import { fixTest } from "../../lib/fix-test.ts";
import { repro, spec } from "../spec.ts";

await fixTest(spec, [
  {
    id: "F0070",
    branch: "fix/handshake-error-retry",
    filter: "ConnectionManager on handshake with 'error' action",
    checks: [repro(/^after 20 s/)],
  },
]);
