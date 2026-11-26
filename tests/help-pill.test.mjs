// The "?" buttons are pills, white over teal, with the mark in the opposite color
// (the developer, 2026-11-24). The mark is see-through text over a two-color fill, so where
// colors are overridden it must get a plain color or the button would look blank.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const css = read("css/brownbag.css");
const rule = (name) => (css.split(name + " {")[1] || "").split("}")[0];

test("the pill and its mark change color at the same line", () => {
  assert.match(rule(".help-pill"), /linear-gradient\(#FFFFFF 50%, #164F5A 50%\)/);
  assert.match(rule(".help-pill > span"), /linear-gradient\(#164F5A 50%, #FFFFFF 50%\)/);
  assert.match(css, /@media \(forced-colors: active\) \{[^}]*help-pill/);
});

test("still 44 by 44 to tap, and still named for screen readers", () => {
  assert.match(rule("button.help-button"), /width: 44px;\s+height: 44px;/);
  const app = read("js/app.js");
  const body = app.slice(app.indexOf("function helpBubble")).split("\n}\n")[0];
  assert.match(body, /"help-pill"/);
  assert.match(body, /aria-label", label/);
});

test("the paper ball has the pills on it too", () => {
  assert.match(read("js/crumple.js"), /querySelectorAll\("\.help-pill"\)/);
});

// At 27px the developer found the mark hard to see.
test("the mark nearly fills the pill", () => {
  assert.match(rule(".help-pill > span"), /font-size: 38px/);
});
