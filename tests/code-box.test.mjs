// The staff page's box for the patient's 6 digits. At 200 percent text on an
// iPhone the 6th digit was past the box's right edge (phone pass, 2026-11-25),
// so the digits and their spacing are sized from the box's width, never from
// fixed pixels or the text size alone.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../css/brownbag.css", import.meta.url), "utf8");
const rule = (name) => (css.split("\n" + name + " {")[1] || "").split("}")[0];
const value = (body, prop) => {
  const all = [...body.matchAll(new RegExp("(?:^|[;\\s])" + prop + ":\\s*([^;]+);", "g"))];
  return all.length ? all[all.length - 1][1].trim() : null;
};

test("the digits and their spacing have no fixed pixels", () => {
  const box = rule(".code-form .code-input");
  assert.ok(box.length > 50);
  for (const prop of ["font-size", "letter-spacing", "padding"]) {
    const v = value(box, prop);
    assert.ok(v, prop);
    assert.doesNotMatch(v, /\dpx/, prop + ": " + v);
  }
  assert.match(value(box, "letter-spacing"), /^[\d.]+em$/);
});

test("the digits are sized from the box's width, and no bigger than before", () => {
  assert.match(rule(".code-form"), /container-type: inline-size;/);
  const size = value(rule(".code-form .code-input"), "font-size");
  const found = /^min\(2rem, ([\d.]+)cqi\)$/.exec(size);
  assert.ok(found, size);
  // Six digits, each with its spacing, plus the left padding that centres
  // them, fit in the box with room for its 2px borders even with digits 0.7em
  // wide (wider than any system font's). The narrowest box at 200 percent
  // text is 256px (320px screen, 32px each side).
  const box = rule(".code-form .code-input");
  const spacing = parseFloat(value(box, "letter-spacing"));
  const left = parseFloat(value(box, "padding").split(/\s+/)[3]);
  const ems = 6 * (0.7 + spacing) + left;
  const share = parseFloat(found[1]) / 100;
  assert.ok(share * ems * 256 + 4 <= 256, "needs " + (share * ems * 256 + 4).toFixed(1) + "px of 256");
});
