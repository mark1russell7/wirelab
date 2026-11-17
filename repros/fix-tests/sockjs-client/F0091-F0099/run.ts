// The fix branches of sockjs-client for F0091 (#715), F0092 (#716), F0094 (#717), F0095 (#718), F0097 (#719), F0098 (#720) and F0099 (#721).
// Main fixed F0096, so it has no fix branch. F0093 (#645) has its own folder, F0093.
import { fixTest } from "../../lib/fix-test.ts";
import { spec } from "../spec.ts";

await fixTest(spec, [
  { id: "F0091", branch: "fix/listener-exception", grep: "A listener that throws" },
  { id: "F0092", branch: "fix/close-code-present", grep: "InvalidAccessError for the code 0" },
  { id: "F0094", branch: "fix/close-while-connecting", grep: "close while CONNECTING" },
  { id: "F0095", branch: "fix/close-stops-page-load-wait", grep: "waits for the page load" },
  { id: "F0097", branch: "fix/node-xhr-response-drop", grep: "The XHR driver of Node.js" },
  { id: "F0098", branch: "fix/close-clears-transport-timer", grep: "The transport timer" },
  { id: "F0099", branch: "fix/query-second-question-mark", grep: "addPath keeps each part of the query" },
]);
