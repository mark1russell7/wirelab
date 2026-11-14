// The type fixes of pusher-js. Each item type-checks the ledger repro against the declarations of the clone
// (make types), before and after the fix. The jasmine filter runs the existing specs of the changed code.
// F0080: channelAuthorization and userAuthentication require transport and endpoint, which have defaults.
// F0081: Channel.subscriptionCount has the type null.
import { fixTest } from "../../lib/fix-test.ts";
import { spec, types } from "../spec.ts";

await fixTest(spec, [
  { id: "F0080", branch: "fix/auth-options-defaults-types", filter: "Config auth", checks: [types] },
  { id: "F0081", branch: "fix/subscription-count-type", filter: "subscriptionCount", checks: [types] },
]);
