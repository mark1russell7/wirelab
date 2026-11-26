/**
 * The bug-class rig of wirelab. Each class of the catalog has a probe. A probe examines the matrix of its class on each
 * target of its formats, and an oracle judges each outcome. `docs/W26-RIG.md` has the design.
 */
export * from "./arms.ts";
export * from "./cuts.ts";
export * from "./matrix.ts";
export * from "./outcome.ts";
export * from "./targets/target.ts";
export { APACHE_ARROW, apacheArrowTarget } from "./targets/apache-arrow.ts";
export { AWS_SDK_S3, awsSdkS3Target, s3EventTypeTarget, s3XmlEntityTarget } from "./targets/aws-sdk-s3.ts";
export { BSON, bsonFieldsAsRawTarget } from "./targets/bson.ts";
export {
  CONNECT_WEB,
  connectEndStream,
  connectWebReplyTargets,
  connectWebTargets,
  connectWebUnaryTarget,
  envelope,
  grpcWebTrailer,
  stringValue,
} from "./targets/connect-web.ts";
export { GRAPHQL_ERRORS, graphqlQueryTargetIds, graphqlReplyTargets, graphqlRequestBatchTarget, outcomeOfSuite } from "./targets/graphql-over-http.ts";
export { GRAPHQL_WS, graphqlWsClientTarget, graphqlWsServerTarget, graphqlWsTargets } from "./targets/graphql-ws.ts";
export { postgrestHeadTarget, postgrestReplyTargets, postgrestSelectTarget } from "./targets/postgrest-js.ts";
export { HLS_JS, hlsDateRangeTarget, hlsKeyTargets, hlsVariableTarget } from "./targets/hls-js.ts";
export { keyTargets } from "./targets/key-targets.ts";
export { MSGPACKR, msgpackrErrorNameTarget } from "./targets/msgpackr.ts";
export { pusherChannelTarget, pusherHandshakeTarget, pusherReplyTargets } from "./targets/pusher-js.ts";
export { replyTargets } from "./targets/reply-targets.ts";
export { SIGNALR, signalrMethodTarget, signalrTarget } from "./targets/signalr.ts";
export { SOCKJS_CLIENT, sockjsClientTargets } from "./targets/sockjs-client.ts";
export { STOMPJS, stompKeyTargets, stompMessageTarget, stompReceiptTarget } from "./targets/stompjs.ts";
export { viemBaseTarget, viemFixedTarget, viemReplyTargets } from "./targets/viem.ts";
export {
  CLASS_ID as C016,
  adapterProblems as c016AdapterProblems,
  extraCases,
  notCrossedAfterEnd,
  runProbe as runC016,
  runSessionProbe as runC016Sessions,
  sessionCaseProblems,
  sessionKey,
  type ProbeResult as C016Result,
  type SessionResult as C016SessionResult,
} from "./probes/c016.ts";
export { CLASS_ID as C017, adapterProblems as c017AdapterProblems, runProbe as runC017, type ProbeResult } from "./probes/c017.ts";
