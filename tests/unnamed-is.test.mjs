// "Is Latex the unnamed allergy?" Yes takes the note off the phone, never the
// record from what staff see.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arrangeAllergies, couldBe, fromAllergyRecords, keepAllergies, keepDrafts, removeMine, tied, unnamedForm, putBack, unnamedQuestion, unspecifiedSentence } from "../js/allergies.js";
import { allergyNotices, buildShareBundle, groupShareBundle } from "../js/share.js";
import { patientSummary } from "../js/ips.js";
import { loadPatientData, savePatientData } from "../js/vault.js";

const NOW = new Date("2026-11-24T12:00:00Z");
const blank = (id, o = {}) => ({ resourceType: "AllergyIntolerance", id, clinicalStatus: { coding: [{ code: "active" }] }, code: { text: "Allergic disposition (finding)", coding: [{ system: "http://snomed.info/sct", code: "609328004" }] }, ...o });
const ENV = blank("u1", { category: ["environment"], recordedDate: "1979-02-28" });
const read = (...r) => keepAllergies({ status: "loaded", ...fromAllergyRecords(r, "SMART sandbox") }, null, NOW);
const own = (name) => ({ id: "o-" + name, name, rxcui: null, reaction: "Hives", addedAt: "2026-11-24" });
const data = (o = {}) => ({ allergies: [], allergyReactions: {}, noKnownAllergies: null, unnamedAre: {}, ...o });
const keyOf = (a) => a.open[0].key;
const note = (a) => unspecifiedSentence(a.open.length, a.count, "Your records", "Ask your care team.", a.open.map((e) => e.details));

test("asked for the same kind, or one in the patient's words; not for another kind", () => {
  const a = arrangeAllergies(read(ENV), data());
  for (const name of ["Latex", "Bee stings", "Cats", "pollen"]) assert.equal(couldBe(name, a).length, 1, name);
  for (const name of ["Peanuts", "Penicillin"]) assert.equal(couldBe(name, a).length, 0, name);
  // The record doesn't say what kind.
  assert.equal(couldBe("Peanuts", arrangeAllergies(read(blank("u2")), data())).length, 1);
  assert.equal(couldBe("Latex", arrangeAllergies(read(), data())).length, 0);
});

test("the question says what the record says", () => {
  const a = arrangeAllergies(read(ENV), data());
  assert.deepEqual(unnamedQuestion("Latex", couldBe("Latex", a)), {
    title: "Is Latex the unnamed allergy?",
    lines: ["Your records have an unnamed allergy: environment, recorded Feb 28, 1979.", "If it is, its line comes off My medicines. Staff still see the record, with your answer."],
    yes: ["Yes, it's the same one"]
  });
  const two = arrangeAllergies(read(ENV, blank("u2")), data());
  assert.deepEqual(unnamedQuestion("Latex", couldBe("Latex", two)).yes, ["Yes, it's number 1", "Yes, it's number 2"]);
});

test("Yes takes off the note; the card says so; staff and the file still have it", () => {
  const latex = own("Latex");
  const d = data({ allergies: [latex] });
  d.unnamedAre[keyOf(arrangeAllergies(read(ENV), d))] = latex.id;
  const a = arrangeAllergies(read(ENV), d);
  assert.equal(note(a), null);
  assert.equal(a.cards[0].unnamedKeys.length, 1);
  assert.equal(a.unspecified, 1);
  const bundle = JSON.parse(JSON.stringify(buildShareBundle({ patient: { name: "A", birthDate: "1950-01-01" }, current: [], additions: [], stopped: [], allergies: a }, NOW, { claims: "loaded", allergies: { status: "loaded", savedAt: null, updatedAt: NOW.toISOString() } })));
  assert.deepEqual(allergyNotices(groupShareBundle(bundle).allergies), ["Records also have an unnamed allergy: environment, recorded Feb 28, 1979, patient says it's Latex. Ask the patient."]);
  assert.match(JSON.stringify(patientSummary(bundle, { now: NOW, uuid: () => "00000000-0000-4000-8000-000000000000" })), /patient says it's Latex/);
});

test("removing that allergy brings the note back, and Undo takes it off again", () => {
  const latex = own("Latex");
  const d = data({ allergies: [latex], unnamedAre: { "id:u1": latex.id } });
  const removed = removeMine(d, arrangeAllergies(read(ENV), d).cards[0]);
  assert.match(note(arrangeAllergies(read(ENV), d)), /unnamed allergy/);
  putBack(d, removed);
  assert.equal(note(arrangeAllergies(read(ENV), d)), null);
});

test("only the one they said goes", () => {
  const latex = own("Latex");
  const a = arrangeAllergies(read(ENV, blank("u2", { category: ["food"] })), data({ allergies: [latex], unnamedAre: { "id:u1": latex.id } }));
  assert.equal(note(a), "Your records also have an unnamed allergy: food. Ask your care team.");
});

test("a list saved before this shows the note and never asks", () => {
  const saved = { items: [], statements: [], unspecified: 1, unnamed: ["food"], unnamedFhir: [{ category: ["food"] }], savedAt: "2026-11-21T10:00:00Z" };
  const a = arrangeAllergies(keepAllergies({ status: "failed", items: [], statements: [] }, saved), data());
  assert.match(note(a), /unnamed allergy: food/);
  assert.equal(couldBe("Peanuts", a).length, 0);
  assert.equal(note(arrangeAllergies(keepAllergies({ status: "failed" }, { items: [], statements: [], unspecified: 1, savedAt: "2026-11-21T10:00:00Z" }), { allergies: [], allergyReactions: {} })), "Your records have an unnamed allergy. Ask your care team.");
});

test("a very long name can't fill the code", () => {
  const long = own("x".repeat(500));
  const a = arrangeAllergies(read(ENV), data({ allergies: [long], unnamedAre: { "id:u1": long.id } }));
  assert.ok(a.unnamed[0].length < 160);
});

test("kept on the phone", async () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), key: (i) => [...map.keys()][i], get length() { return map.size; } };
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]).catch(() => null);
  if (!key) return;
  try { await savePatientData(storage, key, "p", data({ unnamedAre: { "id:u1": "o" } })); } catch { return; }
  assert.deepEqual((await loadPatientData(storage, key, "p")).unnamedAre, { "id:u1": "o" });
});

test("the screen: Done twice, Edit folds the buttons, the popup starts on No", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const body = (name) => app.slice(app.indexOf("function " + name)).split("\n}\n")[0];
  assert.equal(body("drawMedicines").match(/medicinesDone\(/g).length, 2);
  assert.match(body("drawAllergyCard"), /aria-expanded/);
  assert.match(body("askUnnamed"), /keep\.focus\(\)/);
});

test("a half-typed answer is kept like any other, until its entry is gone", () => {
  const draft = { allergen: { choice: "Latex", other: "" }, reaction: { choice: "", other: "" } };
  const open = arrangeAllergies(read(ENV), data()).open;
  assert.deepEqual(keepDrafts({ [unnamedForm(open[0])]: draft }, [], open), { "unnamed:id:u1": draft });
  assert.deepEqual(keepDrafts({ "unnamed:id:u1": draft }, [], []), {});
});

test("answering from the row links it, with no second question", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const form = app.slice(app.indexOf("function drawAllergyForm")).split("\n}\n")[0];
  assert.match(form, /state\.data\.unnamedAre\[entry\.key\] = own\.id/);
  assert.match(form, /if \(!entry\) askUnnamed\(own\)/);
});

test("a dot or a date never starts a line on its own", () => {
  assert.equal(tied("Reaction not in your records · Source: SMART sandbox"), "Reaction not in your records\u00a0· Source: SMART sandbox");
  assert.equal(tied("Environment, recorded Feb 28, 1979 (same day as Mold)"), "Environment, recorded Feb\u00a028,\u00a01979 (same day as Mold)");
});
