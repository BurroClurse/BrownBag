import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SOURCES, TRADEMARKS, notConnected, signInLink, startFor } from "../js/sources.js";

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
  assert.match(read("launch.html"), /onerror="[^"]+" src="js\/launch\.js"|src="js\/launch\.js" onerror="[^"]+"/);
});
