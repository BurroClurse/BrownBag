// How real sources write allergies (docs/superpowers/research/2026-11-25-
// messy-data-findings.md, "Fixtures to build" 33-39), with Tyler's answers:
// every way of saying "no known allergies" is a statement, and a place held
// for an allergen that isn't named is the unnamed-allergy row, never an
// allergy called "NoInformation" or "Unknown". A statement never hides a real
// allergy: words that name something stay an allergy row.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromAllergyRecords, arrangeAllergies, statementOf, noneCode, UNNAMED } from "../js/allergies.js";
import { buildShareBundle, groupShareBundle, allergyNotices } from "../js/share.js";

const fixture = (name) => JSON.parse(readFileSync(new URL("./fixtures/messy/allergies/" + name + ".json", import.meta.url), "utf8"));
const NONE = fixture("none");
const PENICILLIN = fixture("penicillin");
const NOW = new Date("2026-11-25T12:00:00Z");
const PATIENT = { name: "Pat Example", birthDate: "1960-01-01" };

const read = (...records) => fromAllergyRecords(records, "Clinic");
const typed = (text, id = "t") => ({ resourceType: "AllergyIntolerance", id, code: { text } });
const names = (out) => out.items.map((item) => item.name);

// Through the QR code and back, as staff see it.
function staffSee(out) {
  const arranged = arrangeAllergies(Object.assign({ status: "loaded", savedAt: null }, out), { allergies: [], allergyReactions: {} });
  const bundle = buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [], allergies: arranged }, NOW, { allergies: { status: "loaded", savedAt: null, updatedAt: NOW.toISOString() } });
  return groupShareBundle(JSON.parse(JSON.stringify(bundle))).allergies;
}

test("case 33: IPS no-allergy-info is the unnamed-allergy row, never an allergy by that name", () => {
  for (const record of [NONE.ipsNoInfo, NONE.ipsNoInfoText]) {
    const out = read(record);
    assert.deepEqual(out.items, [], record.id);
    assert.deepEqual(out.statements, [], record.id);
    assert.equal(out.unspecified, 1, record.id);
  }
  // Beside a real allergy, both show, and staff see both.
  const beside = read(NONE.ipsNoInfo, NONE.penicillin);
  assert.deepEqual(names(beside), ["Penicillin G"]);
  assert.equal(beside.unspecified, 1);
  const staff = staffSee(beside);
  assert.deepEqual(staff.fromRecords.map((a) => a.name), ["Penicillin G"]);
  assert.equal(staff.unspecified, 1);
});

test("case 34: IPS no-known-allergies by its code alone is a statement", () => {
  const out = read(NONE.ipsNoneKnown);
  assert.deepEqual(out.items, []);
  assert.deepEqual(out.statements, ["No known allergy"]);
  assert.equal(out.unspecified, 0);
  assert.deepEqual(staffSee(out).statements, ["No known allergy"]);
  // A real allergy beside it still shows.
  const beside = read(NONE.ipsNoneKnown, NONE.penicillin);
  assert.deepEqual(names(beside), ["Penicillin G"]);
  assert.deepEqual(beside.statements, ["No known allergy"]);
});

test("case 35: NKA, NKDA, NKMA and sentences that say none are statements, any case, with a dot", () => {
  for (const [text, statement] of NONE.typed) {
    const out = read(typed(text));
    assert.deepEqual(out.items, [], text);
    assert.deepEqual(out.statements, [statement], text);
  }
  // SNOMED's own, with its abbreviation as text.
  assert.deepEqual(read(NONE.nka).statements, ["No known allergy"]);
  assert.deepEqual(read(NONE.nkda).statements, ["No known drug allergy"]);
});

test("case 35: a none phrase inside longer words is an allergy row, never hidden", () => {
  for (const text of NONE.notNone) {
    const out = read(typed(text));
    assert.deepEqual(names(out), [text], text);
    assert.deepEqual(out.statements, [], text);
    // Not even with a code that says none.
    const coded = read({ resourceType: "AllergyIntolerance", id: "c", code: { coding: [{ system: "http://snomed.info/sct", code: "716186003" }], text } });
    assert.deepEqual(names(coded), [text], "coded: " + text);
    assert.deepEqual(staffSee(coded).fromRecords.map((a) => a.name), [text], "staff: " + text);
  }
});

test("case 36: SNOMED's No Known Latex Allergy is a statement, coded in the QR code", () => {
  const out = read(NONE.nkla);
  assert.deepEqual(out.items, []);
  assert.deepEqual(out.statements, ["No known latex allergy"]);
  assert.equal(noneCode("No known latex allergy"), "716184000");
  assert.deepEqual(staffSee(out).statements, ["No known latex allergy"]);
  assert.deepEqual(names(read(NONE.nkla, NONE.penicillin)), ["Penicillin G"]);
});

test("case 37: a nullFlavor or data-absent-reason allergen is the unnamed row, never NoInformation or Unknown", () => {
  for (const record of [NONE.nullFlavor, NONE.absentReason]) {
    const out = read(record);
    assert.deepEqual(out.items, [], record.id);
    assert.equal(out.unspecified, 1, record.id);
  }
  // With a reaction it's still an allergy, with no name, and its reaction.
  const hives = read(NONE.nullFlavorWithReaction);
  assert.deepEqual(names(hives), [UNNAMED]);
  assert.deepEqual(hives.items[0].reactions.map((r) => r.text), ["Hives"]);
  assert.deepEqual(hives.items[0].codes, []);
  const staff = staffSee(read(NONE.nullFlavor, NONE.absentReason, NONE.nullFlavorWithReaction, NONE.penicillin));
  assert.ok(!JSON.stringify(staff).includes("NoInformation"));
  assert.ok(!/"Unknown"/.test(JSON.stringify(staff)));
  assert.equal(staff.unspecified, 2);
  assert.deepEqual(staff.fromRecords.map((a) => a.name).sort(), ["Penicillin G", UNNAMED]);
  assert.ok(allergyNotices(staff).some((line) => /2 unnamed allergies/.test(line)));
});

test("case 38: a flattened C-CDA NKA, Allergy to substance, is the unnamed row, not an allergen", () => {
  const out = read(NONE.flattenedCcda);
  assert.deepEqual(out.items, []);
  assert.deepEqual(out.statements, []);
  assert.equal(out.unspecified, 1);
  assert.match(out.unnamed[0], /recorded Sep 14, 2026/);
});

test("case 39: one source's penicillin family stays five rows, and none joins sulfa", () => {
  const out = fromAllergyRecords(PENICILLIN.records, "Clinic");
  assert.deepEqual(names(out), ["PCN", "Penicillin", "penicillin - rash", "Penicillins", "Substance with penicillin structure", "Sulfa"]);
  assert.equal(new Set(out.items.map((item) => item.key)).size, 6);
  assert.deepEqual(out.statements, []);
  assert.equal(out.unspecified, 0);
  assert.equal(staffSee(out).fromRecords.length, 6);
});

test("statementOf reads the whole entry: a none code beside words that name something is an allergy", () => {
  const coded = (code, text) => ({ resourceType: "AllergyIntolerance", code: { coding: [{ system: "http://snomed.info/sct", code }], text } });
  assert.equal(statementOf(coded("716186003", "No known allergies on file"), "No known allergies on file"), "No known allergy");
  assert.equal(statementOf(coded("409137002", "Patient denies drug allergies"), "Patient denies drug allergies"), "No known drug allergy");
  assert.equal(statementOf(coded("716186003", "NKA to food, allergic to penicillin"), "NKA to food, allergic to penicillin"), null);
  // Words that only sound like none can still name an allergen.
  for (const text of ["Allergic to latex", "No drug allergies, latex allergy", "No known allergies to penicillin"]) {
    assert.deepEqual(names(read({ resourceType: "AllergyIntolerance", id: "x", code: { coding: [{ system: "http://snomed.info/sct", code: "716186003" }], text } })), [text], text);
  }
});
