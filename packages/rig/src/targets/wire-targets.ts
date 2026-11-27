/** The wire targets of the probe of C032: each client of the class outside `@connectrpc/connect-web`. */
import { mqttWireTargets } from "./mqtt.ts";
import { rxjsMultiplexSubMsgTarget } from "./rxjs.ts";
import { socketIoRetriesTarget } from "./socket-io.ts";
import type { WireTarget } from "./target.ts";

/** The wire targets, in the order of the report. */
export const wireTargets: readonly WireTarget[] = [...mqttWireTargets, rxjsMultiplexSubMsgTarget, socketIoRetriesTarget];
