/** Each cause target of the rig. The probe of C003 gets this list, and it starts the two inputs of each target. */
import { bsonCutInt64Target } from "./bson.ts";
import { graphqlRequestBigIntTarget } from "./graphql-over-http.ts";
import { mqttCauseTargets } from "./mqtt.ts";
import { rxjsWebSocketCodecTarget } from "./rxjs.ts";
import type { CauseTarget } from "./target.ts";

/** Each cause target of the rig: one for each known instance of C003 outside `@connectrpc/connect-web`. */
export const causeTargets: readonly CauseTarget[] = [rxjsWebSocketCodecTarget, ...mqttCauseTargets, bsonCutInt64Target, graphqlRequestBigIntTarget];
