import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARMS, armProblems } from "./arms.ts";
import { apacheArrowTarget } from "./targets/apache-arrow.ts";
import { awsSdkS3Target } from "./targets/aws-sdk-s3.ts";
import { causeTargets } from "./targets/cause-targets.ts";
import { connectWebTargets } from "./targets/connect-web.ts";
import { graphqlWsTargets } from "./targets/graphql-ws.ts";
import { keyTargets } from "./targets/key-targets.ts";
import { replyTargets } from "./targets/reply-targets.ts";
import { signalrTarget } from "./targets/signalr.ts";
import { sockjsClientTargets } from "./targets/sockjs-client.ts";
import { wireTargets } from "./targets/wire-targets.ts";

/** Each target of the rig, from each list of targets. An arm of each class can name a target of these lists. */
const ids = [
  ...connectWebTargets,
  apacheArrowTarget,
  awsSdkS3Target,
  ...replyTargets,
  ...sockjsClientTargets,
  signalrTarget,
  ...graphqlWsTargets,
  ...keyTargets,
  ...causeTargets,
  ...wireTargets,
].map((one) => one.id);

describe("the arms", () => {
  it("name only targets of the rig, with full commits", () => {
    const patchExists = (path: string): boolean => existsSync(fileURLToPath(new URL(`../${path}`, import.meta.url)));
    expect(armProblems(ARMS, ids, patchExists)).toEqual([]);
  });

  it("find each problem of a bad arm", () => {
    const good = ARMS[0];
    if (good === undefined) throw new Error("The rig has no arm.");
    const bad = { ...good, targets: ["none"], base: "abc", patch: "none.patch", copy: [] };
    expect(armProblems([good, good, bad], ["aws-sdk/s3-select-object-content"], (path) => path !== "none.patch")).toEqual([
      `${good.id}: the id is not unique.`,
      `${good.id}: the id is not unique.`,
      `${good.id}: the rig has no target "none".`,
      `${good.id}: the arm has a fix commit or a patch, and not the two.`,
      `${good.id}: each commit is a full SHA of 40 hex digits.`,
      `${good.id}: the patch "none.patch" does not exist.`,
      `${good.id}: the arm copies no folder.`,
    ]);
  });
});
