import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOURCES, TRADEMARKS, chosen, recordsStatus, leavingText, notConnected, signInLink, startFor } from "../js/sources.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("only the SMART sandbox is connected", () => {
  assert.deepEqual(SOURCES.filter((s) => s.connected).map((s) => s.name), ["SMART Health IT sandbox"]);
});

test("the others show in order, by kind, in their owners' spelling", () => {
  assert.deepEqual(notConnected(), [
    { kind: "Health systems", names: ["Epic®", "Oracle® Health", "MEDITECH"] },
    { kind: "Insurance", names: ["Medicare", "Medicaid"] },
    { kind: "Pharmacies", names: ["Pharmacy fills"] }
  ]);
});

const ONE = "e7de504a-311d-49be-b2bc-566a328bcc72";
test("Sign in opens the list; the sandbox opens its patients; a choice or a link's own server signs in", () => {
  for (const search of ["", "?", "?code=1", "?source=", "?source=epic", "?source=medicare", "?source=nope", "?source=__proto__", "?source=constructor", "?iss=", "?as=" + ONE, "?source=epic&as=" + ONE]) assert.equal(startFor(search), "list", search);
  for (const search of ["?source=smart-sandbox", "?source=smart-sandbox&as=", "?source=smart-sandbox&as=nope", "?source=smart-sandbox&as=__proto__"]) assert.equal(startFor(search), "patients", search);
  assert.equal(startFor("?source=smart-sandbox&as=" + ONE), "sign-in");
  assert.equal(startFor("?source=smart-sandbox&as=list"), "sign-in");
  assert.equal(startFor("?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Ffhir"), "sign-in");
  assert.equal(startFor("?launch=x&iss=https%3A%2F%2Fexample.test%2Ffhir"), "sign-in");
  assert.equal(chosen("?source=smart-sandbox&as=" + ONE), ONE);
  assert.equal(chosen("?source=smart-sandbox&as=nope"), null);
});

test("signing in again goes back to the same person when it can", () => {
  const search = (link) => new URL(link, "https://example.test/").search;
  assert.equal(startFor(search(signInLink())), "patients");
  assert.equal(chosen(search(signInLink(ONE))), ONE);
  for (const id of [null, undefined, "someone-else"]) assert.equal(startFor(search(signInLink(id))), "patients", String(id));
});

test("Sign in after the lock goes straight in; signed out, it opens the connections screen", () => {
  const app = read("js/app.js");
  // The note on home, the allergies note, Health records' Sign in again, and
  // Update now with no pass.
  assert.equal(app.match(/signInLink\(state\.patientId\)/g).length, 4);
  assert.equal(app.match(/href = "\.\/launch\.html"/g), null);
  assert.equal(app.match(/href = "\.\/\?open=connections"/g).length, 1);
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
const status = (more) => recordsStatus(Object.assign({ split: { claims: "loaded" }, savedAt: null, updatedAt: DAY, allergies: { status: "loaded", savedAt: null, updatedAt: DAY } }, more), at);

test("Health records says when each part was last updated", () => {
  assert.deepEqual(status({}), { rows: [["Meds last updated", at(DAY)], ["Allergies last updated", at(DAY)], ["Insurance fills last updated", at(DAY)]], note: null, signIn: false });
  assert.deepEqual(status({ savedAt: OLD, updatedAt: null, offline: true, allergies: { status: "failed", savedAt: OLD } }),
    { rows: [["Meds last updated", at(OLD)], ["Allergies last updated", at(OLD)], ["Insurance fills last updated", at(OLD)]], note: "Couldn't update. This is the last list that loaded.", signIn: false });
});

test("no date for a part that didn't load", () => {
  for (const split of [{ failed: true }, { heldBack: true }]) assert.deepEqual(status({ split }).rows[0], ["Meds", "Some didn't load"]);
  assert.deepEqual(status({ allergies: { status: "failed", savedAt: null } }).rows[1], ["Allergies", "Not loaded"]);
  assert.deepEqual(status({ allergies: { status: "none", savedAt: null } }).rows[1], ["Allergies", "Not loaded"]);
});

test("insurance fills have a date only when they loaded", () => {
  const fills = (split, more) => status(Object.assign({ split }, more)).rows[2];
  assert.deepEqual(fills({ claims: "loaded" }), ["Insurance fills last updated", at(DAY)]);
  // Saved with the medicines, so it has their date.
  assert.deepEqual(fills({ claims: "loaded" }, { savedAt: OLD, updatedAt: DAY }), ["Insurance fills last updated", at(OLD)]);
  assert.deepEqual(fills({ claims: "none" }), ["Insurance fills", "None found, " + at(DAY)]);
  assert.deepEqual(fills({ claims: "refused" }), ["Insurance fills", "Sign in again to add them"]);
  // Old saved lists (null), and fills with no medicines to go on.
  for (const split of [{ claims: "failed" }, { claims: null }, {}, { claims: "loaded", failed: true }, { claims: "none", failed: true }]) {
    assert.deepEqual(fills(split), ["Insurance fills", "Not loaded"]);
  }
  for (const claims of ["loaded", "none"]) assert.deepEqual(fills({ claims }, { updatedAt: null }), ["Insurance fills", "Not loaded"]);
});

test("it says when only signing in will update it", () => {
  assert.deepEqual([status({ savedAt: OLD, needsSignIn: true }).note, status({ savedAt: OLD, needsSignIn: true }).signIn], ["Sign in again to update your list.", true]);
  const refused = status({ allergies: { status: "refused", savedAt: null } });
  assert.deepEqual([refused.note, refused.signIn, refused.rows[1]], ["Sign in again to add your allergies.", true, ["Allergies", "Not loaded"]]);
});

test("while updating, it says only that", () => {
  assert.deepEqual([status({ updating: true, needsSignIn: true }).note, status({ updating: true, needsSignIn: true }).signIn], ["Checking your health records…", false]);
});

// The lists before and after sign-in are one piece of code, so the names and
// the owners' lines can't differ.
test("one list of sources, on the connections screen", () => {
  assert.match(read("js/app.js"), /drawNotConnected\(/);
  assert.doesNotMatch(read("js/launch.js"), /drawNotConnected/);
  // A plain launch.html, and every Back there, go to the connections screen.
  assert.match(read("js/launch.js"), /location\.replace\("\.\/\?open=connections"\)/);
  assert.doesNotMatch(read("js/launch.js"), /href = "\.\/"/);
  assert.ok(read("sw.js").includes('"./js/source-list.js"'));
});

// "This list is…" has no list to point at before one is open.
test("the sign-in screens don't show the note about the list", () => {
  const app = read("js/app.js");
  for (const name of ["savedListAsked", "drawConnections"]) {
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

// The sign-in library reads the address (a server left in it would win over the
// choice) and keeps an earlier try's answers, so a choice is a fresh page.
test("a choice on the list never carries another sign-in's address or failure", () => {
  const launch = read("js/launch.js");
  assert.match(read("js/app.js"), /signInButton\(card, "Connect", "primary", signInLink\(\)\)/);
  assert.match(launch, /location\.href = signInLink\(patient\.id\)/);
  assert.equal(launch.match(/signIn\(\)/g).length, 2);
  for (const name of ["iss", "launch", "patientId", "clientId", "fhirServiceUrl"]) assert.equal(new URL(signInLink(ONE), "https://example.test/").searchParams.get(name), null, name);
});

// "Choose a test patient" is in history once (Tyler, 2026-11-26), and Back
// from a sign-in that is starting or couldn't start is the list (Tyler, Task
// 10d). A choice is its own step after the list's; once the sandbox's address
// is known, it takes that step's place. So Back from the sandbox, or from
// "Couldn't start sign-in", is the list, and one more Back the connections
// screen.
test("Back from the sandbox comes to the list once, then the connections screen", () => {
  const launch = read("js/launch.js");
  const patients = launch.slice(launch.indexOf("function showPatients")).split("\n}\n")[0];
  assert.doesNotMatch(patients, /location\.replace\(signInLink/);
  assert.match(patients, /location\.href = signInLink\(patient\.id\)/);
  assert.match(patients, /location\.href = signInLink\(OWN_LIST\)/);
  const signIn = launch.slice(launch.indexOf("function signIn")).split("\n}\n")[0];
  assert.match(signIn, /if \(chosen\(location\.search\)\) \{\s*location\.replace\(url\);/);
  // A link that named its own server: Back from there is the connections
  // screen, as before.
  assert.match(signIn, /history\.replaceState\(null, "", "\.\/launch\.html"\);\s*location\.href = url;/);
  // The steps, as the pages make them.
  const steps = [];
  const open = (url) => steps.push(url);
  const replace = (url) => { steps[steps.length - 1] = url; };
  open("./?open=connections");
  open(signInLink());
  open(signInLink(ONE));
  replace("https://launch.smarthealthit.org/v/r4/sim/x/fhir/auth");
  assert.deepEqual(steps.slice(0, -1).reverse(), [signInLink(), "./?open=connections"]);
});

test("Back from a sign-in that is starting or couldn't start is the list", () => {
  const launch = read("js/launch.js");
  const failed = launch.slice(launch.indexOf("function showFailed")).split("\n}\n")[0];
  // Try again is the same patient: a fresh page at the same address.
  assert.match(failed, /if \(startFor\(location\.search\) === "sign-in"\) location\.reload\(\);/);
  // Nothing on the way to the failure takes the list's step.
  const signIn = launch.slice(launch.indexOf("function signIn")).split("\n}\n")[0];
  const beforeAnswer = signIn.slice(0, signIn.indexOf(".then("));
  assert.doesNotMatch(beforeAnswer, /replaceState|location\.replace/);
  assert.doesNotMatch(failed, /replaceState|pushState/);
  const steps = [];
  const open = (url) => steps.push(url);
  open("./?open=connections");
  open(signInLink());
  open(signInLink(ONE));
  // "Starting sign-in…", then "Couldn't start sign-in", then Try again, a reload.
  assert.deepEqual(steps.slice(0, -1).reverse(), [signInLink(), "./?open=connections"]);
  assert.equal(steps[steps.length - 1], signInLink(ONE));
});

test("sign-in has a time limit and never redirects on its own", () => {
  assert.match(read("launch.html"), /noRedirect: true/);
  assert.match(read("js/launch.js"), /SIGN_IN_WAIT_MS/);
});

test("a link to another server isn't called the sandbox", () => {
  assert.match(leavingText("?source=smart-sandbox"), /the SMART sandbox/);
  assert.match(leavingText(""), /the SMART sandbox/);
  assert.match(leavingText("?source=smart-sandbox&as=" + ONE), /Approve Brown Bag there/);
  assert.match(leavingText("?source=smart-sandbox&as=list"), /Sign in there as the patient/);
  assert.doesNotMatch(leavingText("?iss=https%3A%2F%2Fexample.test%2Ffhir"), /sandbox/);
  assert.match(leavingText("?iss=https%3A%2F%2Fexample.test%2Ffhir"), /your health system's sign-in page/);
});
