// The fix branch of sockjs-client for F0093 (#645): localhost and *.localhost pass the check of an insecure URL.
// The maintainer asked for a contribution on #645, so F0093 has a fix branch now.
import { fixTest } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

await fixTest(spec, [{ id: "F0093", branch: "fix/localhost-secure-context", grep: "for localhost and" }]);
