import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// My medicines (Tyler, 2026-11-25): no "My medicines" over "Medicines (7)",
// and two matching section headers, Allergies in red and Medicines in teal.
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const app = read("js/app.js");
const css = read("css/brownbag.css");
const body = (name) => app.slice(app.indexOf("function " + name + "(")).split("\n}\n")[0];

test("the page title is for screen readers only", () => {
  assert.match(body("drawMedicines"), /add\(root, "h1", "My medicines", "visually-hidden"\)/);
});

test("Allergies is a section header above its box, not inside it", () => {
  const draw = body("drawAllergies");
  assert.ok(draw.includes("parent.insertBefore(box.heading, box.section)"));
  assert.ok(draw.includes('box.heading.className = "section-heading allergies-section"'));
  // The fold opens from the summary line inside the box now.
  assert.ok(!body("drawAllergyFold").includes("box.heading"));
});

test("Medicines gets the same header, in teal", () => {
  assert.ok(body("drawMedicines").includes('className = "section-heading medicines-section"'));
});

test("the two headers are bigger, each in its own color", () => {
  const rule = (sel) => new RegExp(sel.replace(/[.]/g, "\\.") + " \\{([^}]*)\\}").exec(css)?.[1] || "";
  assert.match(rule(".screen-medicines .section-heading"), /font-size: min\(1\.9rem, 11vw\)/);
  assert.match(rule(".screen-medicines .allergies-section"), /color: var\(--error-ink\)/);
  assert.match(rule(".screen-medicines .allergies-section"), /border-bottom-color: var\(--error-ink\)/);
  assert.match(rule(".screen-medicines .medicines-section"), /color: var\(--teal\)/);
  assert.match(rule(".screen-medicines .medicines-section"), /border-bottom-color: var\(--teal\)/);
});
