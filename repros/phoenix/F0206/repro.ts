// phoenix 1.8.17 (JavaScript client). Presence.syncState(state, newState) leaves `state` as it is and returns a new
// state. Presence.syncDiff(state, diff) changes the `state` that the caller gives: it removes the left metas from the
// presence objects of that state, and when the state has a null prototype (as each state that syncState and
// syncDiff return), it adds and deletes keys on that object and returns the same object. A caller that keeps the
// previous state (to compare it with the next one, or as immutable UI state) sees it change.
import { Presence } from "phoenix";

const before = Presence.syncState({}, {
  u1: { metas: [{ id: 1, phx_ref: "1" }, { id: 1, phx_ref: "2" }] },
  u2: { metas: [{ id: 2, phx_ref: "3" }] },
});
const beforeJson = JSON.stringify(before);
const after = Presence.syncDiff(before, {
  joins: { u3: { metas: [{ id: 3, phx_ref: "4" }] } },
  leaves: { u1: { metas: [{ id: 1, phx_ref: "1" }] }, u2: { metas: [{ id: 2, phx_ref: "3" }] } },
});
console.log(`previous state before syncDiff: ${beforeJson}`);
console.log(`previous state after syncDiff:  ${JSON.stringify(before)}`);
console.log(`syncDiff returned the same object: ${after === before}`);

// a plain object state: the top object is copied, but its presence objects are changed
const plain = { u1: { metas: [{ id: 1, phx_ref: "1" }, { id: 1, phx_ref: "2" }] } };
const plainJson = JSON.stringify(plain);
Presence.syncDiff(plain, { joins: {}, leaves: { u1: { metas: [{ id: 1, phx_ref: "1" }] } } });
console.log(`plain state before: ${plainJson}, after: ${JSON.stringify(plain)}`);

// syncState, for comparison
const s0 = Presence.syncState({}, { u1: { metas: [{ id: 1, phx_ref: "1" }] } });
const s0Json = JSON.stringify(s0);
const s1 = Presence.syncState(s0, { u2: { metas: [{ id: 2, phx_ref: "2" }] } });
const syncStateKeeps = s1 !== s0 && JSON.stringify(s0) === s0Json;
console.log(`syncState keeps its input state: ${syncStateKeeps}`);

const bug = after === before || JSON.stringify(before) !== beforeJson || JSON.stringify(plain) !== plainJson;
console.log("expected: syncDiff, as syncState, returns a new state and does not change the state that it is given");
console.log(bug ? "BUG PRESENT" : "BUG ABSENT");
process.exitCode = bug ? 1 : 0;
