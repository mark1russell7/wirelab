// The channel and event fixes of pusher-js. Each item runs the ledger repro with the clone, before and after the fix.
// F0073: channel names that are members of Object.prototype make subscribe() throw.
// F0075: pusher.bind() callbacks get no argument for falsy event data.
// F0076: a presence channel_data that is not valid JSON gives an unhandled rejection.
// F0077: a presence auth response with no channel_data gives a subscription_error with the error undefined.
import { fixTest } from "../../lib/fix-test.ts";
import { repro, spec } from "../spec.ts";

await fixTest(spec, [
  {
    id: "F0073",
    branch: "fix/channel-names-object-prototype",
    filter: "Object.prototype members",
    checks: [repro(/^events received for/)],
  },
  {
    id: "F0075",
    branch: "fix/emit-falsy-data",
    filter: "EventsDispatcher #emit should (pass falsy data|call listeners with no argument)",
    checks: [repro(/^pusher\.bind/)],
  },
  {
    id: "F0076",
    branch: "fix/presence-channel-data-parse",
    filter: "channel_data isn't valid JSON",
    checks: [repro(/^after 1 s/)],
  },
  {
    id: "F0077",
    branch: "fix/presence-auth-error-object",
    filter: "PresenceChannel (#authorize|#subscribe without channel_data)",
    checks: [repro(/^pusher:subscription_error/)],
  },
]);
