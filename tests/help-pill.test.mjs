// The "?" buttons are pills, white over teal, with the mark in the opposite color
// (the developer, 2026-11-24). The mark is see-through text over a two-color fill, so where
// colors are overridden it must get a plain color or the button would look blank.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const css = read("css/brownbag.css");
const rule = (name) => (css.split(name + " {")[1] || "").split("}")[0];

test("the pill is white over teal, and keeps a plain color where colors are overridden", () => {
  assert.match(rule(".help-pill"), /linear-gradient\(#FFFFFF 50%, #164F5A 50%\)/);
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

// The developer, 2026-11-28: the hook of the "?" only in the top half, the
// dot only in the bottom half, each the other color, the hook a smooth curve
// at 80 percent, the dot matched to the line, and the dot just under the
// middle line (the closest gap).
test("the hook stays in the white top half and the dot in the teal bottom half", async () => {
  const { HELP_MARK, hookPoints } = await import("../js/help-mark.js");
  const half = HELP_MARK.height / 2;
  const reach = HELP_MARK.stroke / 2;
  for (const [x, y] of hookPoints()) {
    assert.ok(y - reach >= 0 && y + reach < half, "hook y " + y);
    assert.ok(x - reach >= 0 && x + reach <= HELP_MARK.width, "hook x " + x);
  }
  const { cx, cy, r } = HELP_MARK.dot;
  assert.ok(cy - r > half && cy + r <= HELP_MARK.height, "dot");
  assert.equal(cx, HELP_MARK.width / 2);
  // The dot is matched to the line: a little wider, never twice as wide.
  assert.ok(2 * r > HELP_MARK.stroke && 2 * r < 1.5 * HELP_MARK.stroke);
  // Closer than a dot centered in the teal half.
  assert.ok(cy < half + half / 2);
});

test("every pill draws the same mark, in the page and on the paper ball", () => {
  const app = read("js/app.js");
  const body = app.slice(app.indexOf("function helpBubble")).split("\n}\n")[0];
  assert.match(body, /helpMarkSvg\(\)/);
  assert.doesNotMatch(body, /"span", "\?"\)/);
  assert.match(read("js/crumple.js"), /HELP_MARK/);
  assert.ok(read("sw.js").includes('"./js/help-mark.js"'));
  assert.match(css, /@media \(forced-colors: active\) \{[^}]*help-mark/);
});
