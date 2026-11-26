/** Each key target of the rig. The probe of C001 gets this list, and it puts each key of its cases into each target. */
import { s3EventTypeTarget, s3XmlEntityTarget } from "./aws-sdk-s3.ts";
import { bsonFieldsAsRawTarget } from "./bson.ts";
import { hlsKeyTargets } from "./hls-js.ts";
import { msgpackrErrorNameTarget } from "./msgpackr.ts";
import { pusherChannelTarget } from "./pusher-js.ts";
import { signalrMethodTarget } from "./signalr.ts";
import { stompKeyTargets } from "./stompjs.ts";
import type { KeyTarget } from "./target.ts";

/** Each key target of the rig: one for each known instance of C001 outside `@connectrpc/connect-web`. */
export const keyTargets: readonly KeyTarget[] = [
  pusherChannelTarget,
  signalrMethodTarget,
  ...hlsKeyTargets,
  s3EventTypeTarget,
  s3XmlEntityTarget,
  bsonFieldsAsRawTarget,
  msgpackrErrorNameTarget,
  ...stompKeyTargets,
];
