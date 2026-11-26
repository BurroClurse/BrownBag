// The Allergies box took most of the screen for three allergies (the developer, 2026-11-24).
// Closed, it must still name every allergy, warn of severe ones, and never say mild:
// a missed mark would make a dangerous allergy look ordinary.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REACTIONS, allergiesTitle, closedLine, isSevere, unnamedRow } from "../js/allergies.js";

const card = (o = {}) => ({ name: "Eggs", reactions: [], mine: null, highRisk: false, ...o });
const said = (reaction) => card({ mine: { reaction, reactions: [reaction] } });
const recorded = (text, severity = null) => card({ reactions: [{ text, severity }] });

test("the patient's choices: which are severe", () => {
  assert.deepEqual(REACTIONS.map((r) => r.label).filter((r) => isSevere(said(r))), ["Swelling of the face, lips or throat", "Trouble breathing", "Fainting", "Blistering or peeling skin", "Severe reaction (anaphylaxis)"]);
  assert.equal(isSevere(card()), false);
});

test("the records' words and marks", () => {
  assert.ok(isSevere(card({ highRisk: true })));
  assert.ok(isSevere(recorded("Hives", "severe")));
  assert.equal(isSevere(recorded("Hives", "moderate")), false);
  for (const text of ["Anaphylaxis", "Anaphylactic shock", "Difficulty breathing", "Shortness of breath", "Wheezing", "Angioedema", "Throat swelling", "Swelling of throat", "Syncope", "Stevens-Johnson syndrome"]) assert.ok(isSevere(recorded(text)), text);
  for (const text of ["Nausea", "Itchy skin", "Not severe rash", "Non-severe rash", "No anaphylaxis"]) assert.equal(isSevere(recorded(text)), false, text);
  // One of several is enough.
  assert.ok(isSevere(card({ reactions: [{ text: "Hives", severity: null }], mine: { reaction: "Hives · Trouble breathing", reactions: ["Hives", "Trouble breathing"] } })));
});

test("a no before one sign doesn't hide another", () => {
  assert.ok(isSevere(recorded("No hives, trouble breathing")));
  assert.ok(isSevere(recorded("Anaphylaxis, not rash")));
});

test("the title and the closed line", () => {
  assert.equal(allergiesTitle([]), "Allergies");
  assert.equal(allergiesTitle([card(), card()]), "Allergies (2)");
  assert.equal(allergiesTitle([card(), said("Fainting")]), "Allergies (2) · 1\u00a0severe");
  assert.equal(closedLine([card(), card({ name: "Mold" })], 1), "Eggs, Mold, 1 unnamed");
  assert.equal(closedLine([card()], 0), "Eggs");
  assert.equal(closedLine([], 2), "2 unnamed");
});

test("the unnamed row is one line, with the rest behind Review", () => {
  const row = unnamedRow({ key: "id:u1", canRemove: true, details: "environment, recorded Feb 28, 1979 (same day as Mold)" });
  assert.deepEqual([row.short, row.lines], ["Environment (same day as Mold)", ["Recorded Feb 28, 1979.", "Your records don't say what you're allergic to."]]);
  // Nothing to press, so nothing is folded.
  const plain = unnamedRow({ key: null, canRemove: false, details: "food" });
  assert.deepEqual([plain.short, plain.lines], ["Food", ["Your records don't say what you're allergic to. Ask your care team."]]);
});

test("closed each time My medicines opens; a failed load is never folded away", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const body = (name) => app.slice(app.indexOf("function " + name + "(")).split("\n}\n")[0];
  assert.match(body("leaveMedicines"), /state\.allergiesOpen = false/);
  assert.match(body("openAllergyForm"), /state\.allergiesOpen = true/);
  const draw = body("drawAllergies");
  assert.match(body("drawAllergyFold"), /aria-expanded/);
  assert.ok(draw.indexOf("state.dataFailed) add(section") < draw.indexOf("drawAllergyFold("));
  assert.ok(draw.indexOf("arranged.statements.forEach") < draw.indexOf("drawAllergyFold("));
});
