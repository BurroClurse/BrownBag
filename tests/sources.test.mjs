import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOURCES, TRADEMARKS, leavingText, needsFreshPage, notConnected, signInLink, startFor } from "../js/sources.js";

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
  assert.equal(app.match(/signInLink\(\)/g).length, 2);
  assert.equal(app.match(/href = "\.\/launch\.html"/g).length, 2);
});

test("the trademark lines are said, in the list and in the README", () => {
  assert.equal(TRADEMARKS, "Epic is a trademark of Epic Systems Corporation. Oracle is a registered trademark of Oracle and/or its affiliates. Other names may be trademarks of their respective owners. Brown Bag isn't affiliated with or endorsed by any of them, or by any government agency.");
  assert.ok(read("README.md").replace(/\s+/g, " ").includes(TRADEMARKS));
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
