/**
 * The bug-class rig of wirelab. Each class of the catalog has a probe. A probe examines the matrix of its class on each
 * target of its formats, and an oracle judges each outcome. `docs/W26-RIG.md` has the design.
 */
export * from "./cuts.ts";
export * from "./matrix.ts";
export * from "./outcome.ts";
export * from "./targets/target.ts";
export { APACHE_ARROW, apacheArrowTarget } from "./targets/apache-arrow.ts";
export { AWS_SDK_S3, awsSdkS3Target } from "./targets/aws-sdk-s3.ts";
export { CONNECT_WEB, connectWebTargets, envelope } from "./targets/connect-web.ts";
export { CLASS_ID as C017, adapterProblems as c017AdapterProblems, runProbe as runC017, type ProbeResult } from "./probes/c017.ts";
