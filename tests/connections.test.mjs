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

const body = (file, name) => {
  const text = read(file);
  const at = text.indexOf("function " + name + "(");
  return at === -1 ? "" : text.slice(at).split("\n}\n")[0];
};

test("Health records is the connections screen", () => {
  const app = read("js/app.js");
  assert.ok(!app.includes("function drawRecordsFrom("));
  const screen = body("js/app.js", "drawConnections");
  assert.ok(screen.length > 100);
  // Each sign-in from here comes back here.
  assert.ok(screen.includes("signInButton("));
  assert.ok(body("js/app.js", "signInButton").includes("keepReturn(sessionStorage, state.recordsFrom)"));
  // Back from a sign-in there's no step to go back to: Done goes home.
  assert.ok(screen.includes("connectionsDone"));
  assert.ok(body("js/app.js", "connectionsDone").includes('history.state.bb === "records"'));
  assert.ok(!screen.includes("DISCLAIMER"));
});

test("home's Sign in note comes back home", () => {
  assert.ok(body("js/app.js", "drawNotices").includes('keepReturn(sessionStorage, "home")'));
});

test("the lock comes first, and sign-ins land where they started", () => {
  const start = body("js/app.js", "start");
  assert.ok(start.length > 100);
  assert.ok(!start.includes("drawSignedOut("));
  assert.ok(!start.includes("hasSavedList("));
  assert.ok(start.includes("wantsConnections(location.search)"));
  assert.ok(read("js/app.js").includes("takeReturn(sessionStorage)"));
  for (const gone of ["drawSignedOut", "drawRestoreFromSignIn", "drawNoConnection"]) assert.ok(!read("js/app.js").includes("function " + gone + "("), gone);
  assert.ok(!read("js/lock-screen.js").includes("export function restoreBackupText"));
});

test("signed out, Sign in goes to the connections screen", () => {
  const app = read("js/app.js");
  assert.ok(!app.includes('href = "./launch.html"'));
  assert.ok(body("js/app.js", "savedListAsked").includes('"./?open=connections"'));
});

test("every sign-in link says where to come back to", () => {
  const app = read("js/app.js");
  const links = app.match(/signInLink\(/g).length;
  // Each link is one of: signInButton (Health records), or a keepReturn just before it.
  const lines = app.split("\n");
  lines.forEach((line, i) => {
    if (!line.includes("signInLink(") || line.includes("import ")) return;
    const near = lines.slice(i - 2, i + 3).join("\n");
    assert.ok(near.includes("keepReturn(") || line.includes("signInButton("), line.trim());
  });
  assert.ok(links >= 5);
});

// Review fixes, 2026-11-25.
test("a sign-in that didn't finish isn't replayed by a reload or the auto-lock", () => {
  // fhirclient leaves ?error= or a spent ?code= in the address when it throws.
  assert.ok(body("js/app.js", "signInUnavailable").includes('if (cameBackFromAuth) history.replaceState(null, "", "./");'));
});

test("Done with no list loaded stays on the connections screen", () => {
  const done = body("js/app.js", "connectionsDone");
  assert.ok(done.indexOf("!state.patient") !== -1);
  assert.ok(done.indexOf("!state.patient") < done.indexOf("history.back()"));
});

test("Sign-in didn't finish goes once an update works or a new sign-in starts", () => {
  assert.ok(body("js/app.js", "finishUpdate").includes("state.signInFailed = false"));
  assert.ok(body("js/app.js", "signInButton").includes("state.signInFailed = false"));
});
