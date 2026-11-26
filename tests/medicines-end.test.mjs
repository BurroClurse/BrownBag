// From the developer's video: "Removed Latex." sat below the last Done button, like text
// left over, and "Added by me" was a tab with nothing under it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const body = (name) => app.slice(app.indexOf("function " + name + "(")).split("\n}\n")[0];

test("what just happened is said above the last Done, not below it", () => {
  assert.match(body("render"), /medicines-done-end[\s\S]*insertBefore\(live, /);
});

test("Added by me shows only with something in it", () => {
  const added = body("drawAdditions");
  const gate = added.indexOf("return;");
  assert.ok(gate > 0 && gate < added.indexOf("helpHeading("));
  // A failed load or an Undo still shows: unknown is never none.
  assert.match(added.slice(0, gate), /state\.dataFailed/);
  assert.match(added.slice(0, gate), /state\.lastRemoved/);
  // Undo lands on the medicine itself, which may be under As needed.
  assert.match(added, /state\.focusId = "added-" \+ removed\.id/);
});
