import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOURCES, TRADEMARKS, recordsStatus, leavingText, needsFreshPage, notConnected, signInLink, startFor } from "../js/sources.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("only the SMART sandbox is connected", () => {
  assert.deepEqual(SOURCES.filter((s) => s.connected).map((s) => s.name), ["SMART Health IT sandbox"]);
});

test("the others show in order, by kind, in their owners' spelling", () => {
  assert.deepEqual(notConnected(), [
    { kind: "Health systems", names: ["Epic®", "Oracle® Health", "MEDITECH"] },
    { kind: "Insurance", names: ["Medicare", "Medicaid"] }
  ]);
});

test("Sign in opens the list, and a named source or a link's own server goes straight in", () => {
  for (const search of ["", "?", "?code=1", "?source=", "?source=epic", "?source=medicare", "?source=nope", "?source=__proto__", "?source=constructor", "?iss="]) assert.equal(startFor(search), "list", search);
  assert.equal(startFor("?source=smart-sandbox"), "sign-in");
  assert.equal(startFor("?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Ffhir"), "sign-in");
  assert.equal(startFor("?launch=x&iss=https%3A%2F%2Fexample.test%2Ffhir"), "sign-in");
  assert.equal(startFor(new URL(signInLink(), "https://example.test/").search), "sign-in");
});

test("Sign in after the lock goes straight in; signed out, it opens the list", () => {
  const app = read("js/app.js");
  // The two notes, and Health records (the link, and Update
  // now with no pass).
  assert.equal(app.match(/signInLink\(\)/g).length, 4);
  assert.equal(app.match(/href = "\.\/launch\.html"/g).length, 2);
});

test("the trademark lines are said, in the list and in the README", () => {
  assert.equal(TRADEMARKS, "Epic is a trademark of Epic Systems Corporation. Oracle is a registered trademark of Oracle and/or its affiliates. Other names may be trademarks of their respective owners. Brown Bag isn't affiliated with or endorsed by any of them, or by any government agency.");
  assert.ok(read("README.md").replace(/\s+/g, " ").includes(TRADEMARKS));
});

// The screen under More options. A date never vouches for a part that didn't
// load, and it always says what would bring the list up to date.
const at = (iso) => "<" + iso + ">";
const DAY = "2026-11-23T10:00:00.000Z";
const OLD = "2026-11-20T10:00:00.000Z";
const status = (more) => recordsStatus(Object.assign({ split: {}, savedAt: null, updatedAt: DAY, allergies: { status: "loaded", savedAt: null, updatedAt: DAY } }, more), at);

test("Health records says when each part was last updated", () => {
  assert.deepEqual(status({}), { rows: [["Meds last updated", at(DAY)], ["Allergies last updated", at(DAY)]], note: null, signIn: false });
  assert.deepEqual(status({ savedAt: OLD, updatedAt: null, offline: true, allergies: { status: "failed", savedAt: OLD } }),
    { rows: [["Meds last updated", at(OLD)], ["Allergies last updated", at(OLD)]], note: "Couldn't update. This is the last list that loaded.", signIn: false });
});

test("no date for a part that didn't load", () => {
  for (const split of [{ failed: true }, { heldBack: true }]) assert.deepEqual(status({ split }).rows[0], ["Meds", "Some didn't load"]);
  assert.deepEqual(status({ allergies: { status: "failed", savedAt: null } }).rows[1], ["Allergies", "Not loaded"]);
  assert.deepEqual(status({ allergies: { status: "none", savedAt: null } }).rows[1], ["Allergies", "Not loaded"]);
});

test("it says when only signing in will update it", () => {
  assert.deepEqual([status({ savedAt: OLD, needsSignIn: true }).note, status({ savedAt: OLD, needsSignIn: true }).signIn], ["Sign in again to update your list.", true]);
  const refused = status({ allergies: { status: "refused", savedAt: null } });
  assert.deepEqual([refused.note, refused.signIn, refused.rows[1]], ["Sign in again to add your allergies.", true, ["Allergies", "Not loaded"]]);
});

test("while updating, it says only that", () => {
  assert.deepEqual([status({ updating: true, needsSignIn: true }).note, status({ updating: true, needsSignIn: true }).signIn], ["Updating your list…", false]);
});

// The lists before and after sign-in are one piece of code, so the names and
// the owners' lines can't differ.
test("both lists of sources are drawn the same way", () => {
  for (const file of ["js/launch.js", "js/app.js"]) assert.match(read(file), /drawNotConnected\(/);
  assert.ok(read("sw.js").includes('"./js/source-list.js"'));
});

// "This list is…" has no list to point at before one is open.
test("the sign-in screens don't show the note about the list", () => {
  const app = read("js/app.js");
  for (const name of ["savedListAsked", "drawSignedOut"]) {
    const body = app.slice(app.indexOf("function " + name)).split("\n}\n")[0];
    assert.ok(body.length > 100);
    assert.ok(!body.includes("DISCLAIMER"), name);
  }
});

test("the list works with no signal, and a file that doesn't arrive is said", () => {
  const worker = read("sw.js");
  for (const file of ["./launch.html", "./js/sources.js", "./js/launch.js"]) assert.ok(worker.includes('"' + file + '"'), file);
  // The same watcher as the app's own page: a missing file, or files that
  // don't fit together, is tried once more and then said.
  const watcher = (file) => /window\.addEventListener\("error"[\s\S]*?\}, true\);/.exec(read(file))[0];
  assert.equal(watcher("launch.html"), watcher("index.html"));
  assert.match(read("js/launch.js"), /window\.brownBagStarted = true/);
});

test("a choice on the list never carries another sign-in's address or failure", () => {
  assert.equal(needsFreshPage("", 0), false);
  assert.equal(needsFreshPage("?iss=https%3A%2F%2Fexample.test", 0), true);
  assert.equal(needsFreshPage("?launch=abc", 0), true);
  assert.equal(needsFreshPage("", 1), true);
});

test("sign-in has a time limit and never redirects on its own", () => {
  assert.match(read("launch.html"), /noRedirect: true/);
  assert.match(read("js/launch.js"), /SIGN_IN_WAIT_MS/);
});

test("a link to another server isn't called the sandbox", () => {
  assert.match(leavingText("?source=smart-sandbox"), /the SMART sandbox/);
  assert.match(leavingText(""), /the SMART sandbox/);
  assert.doesNotMatch(leavingText("?iss=https%3A%2F%2Fexample.test%2Ffhir"), /sandbox/);
  assert.match(leavingText("?iss=https%3A%2F%2Fexample.test%2Ffhir"), /your health system's sign-in page/);
});
