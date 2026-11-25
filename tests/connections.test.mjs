import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RETURN_KEY, keepReturn, takeReturn, wantsConnections, connectionsView } from "../js/connections.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

test("a sign-in comes back where it was started, once", () => {
  const s = fakeStorage();
  keepReturn(s, "home");
  assert.equal(s.getItem(RETURN_KEY), "home");
  assert.equal(takeReturn(s), "home");
  assert.equal(takeReturn(s), "setup");
  keepReturn(s, "more");
  assert.equal(takeReturn(s), "more");
});

test("anything else, or storage that won't answer, comes back to setting up", () => {
  const s = fakeStorage();
  keepReturn(s, "nope");
  assert.equal(s.map.size, 0);
  assert.equal(takeReturn(s), "setup");
  s.setItem(RETURN_KEY, "elsewhere");
  assert.equal(takeReturn(s), "setup");
  const broken = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() { throw new Error("no"); } };
  assert.doesNotThrow(() => keepReturn(broken, "home"));
  assert.equal(takeReturn(broken), "setup");
});

test("only ?open=connections asks for the connections screen", () => {
  assert.equal(wantsConnections("?open=connections"), true);
  for (const search of ["", "?open=saved", "?code=1", "?open=connection"]) assert.equal(wantsConnections(search), false, search);
});

const INTRO = "Connect each place that has your medicines. You can add more later under More options.";
test("setting up, Done waits for a connection", () => {
  assert.deepEqual(connectionsView({ from: "setup", connected: false, online: true }), { heading: "Connect your health records", intro: INTRO, done: null, offline: null });
  assert.deepEqual(connectionsView({ from: "setup", connected: true, online: true }), { heading: "Connect your health records", intro: INTRO, done: "home", offline: null });
});

test("from More options it's Health records, and Done goes back", () => {
  assert.deepEqual(connectionsView({ from: "more", connected: true, online: true }), { heading: "Health records", intro: null, done: "back", offline: null });
});

test("with no signal it says so", () => {
  assert.equal(connectionsView({ from: "setup", connected: false, online: false }).offline, "No connection. Connect once you have signal.");
  assert.equal(connectionsView({ from: "more", connected: true, online: false }).offline, "No connection. Connect once you have signal.");
});

test("the connections code works with no signal", () => {
  assert.ok(read("sw.js").includes('"./js/connections.js"'));
});
