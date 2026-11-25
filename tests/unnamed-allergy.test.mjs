// An allergy record that names no allergen: everything else it says, in one short
// note. If this broke, a clue to what it is would be lost, or a guess would read as
// what the record says.
import test from "node:test";
import assert from "node:assert/strict";
import { arrangeAllergies, fromAllergyRecords, keepAllergies, unnamedRow, unspecifiedSentence } from "../js/allergies.js";
import { allergyNotices, buildShareBundle, groupShareBundle } from "../js/share.js";
import { patientSummary } from "../js/ips.js";

const SNOMED = "http://snomed.info/sct";
const VERIFY = "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification";
const NOW = new Date("2026-11-24T12:00:00Z");
const rec = (text, o = {}) => ({ resourceType: "AllergyIntolerance", id: text, clinicalStatus: { coding: [{ code: "active" }] }, code: { text }, ...o });
const blank = (o = {}) => rec("Allergic disposition (finding)", { code: { text: "Allergic disposition (finding)", coding: [{ system: SNOMED, code: "609328004" }] }, ...o });
const WHEN = "1979-02-28T04:00:43+00:00";
const MOLD = rec("Mold (organism)", { recordedDate: WHEN });
const read = (...r) => keepAllergies({ status: "loaded", ...fromAllergyRecords(r, "SMART sandbox") }, null, NOW);
const unspecifiedText = (n, listed, said) => unspecifiedSentence(n, listed, "Your records", "Ask your care team.", said);
const phone = (...r) => { const a = arrangeAllergies(read(...r), { allergies: [], allergyReactions: {} }); return unspecifiedText(a.unspecified, a.count, a.unnamed); };
const bundle = (...r) => JSON.parse(JSON.stringify(buildShareBundle({ patient: { name: "A", birthDate: "1950-01-01" }, current: [], additions: [], stopped: [], allergies: arrangeAllergies(read(...r), { allergies: [], allergyReactions: {} }) }, NOW, { claims: "loaded", allergies: { status: "loaded", savedAt: null, updatedAt: NOW.toISOString() } })));
const staff = (...r) => allergyNotices(groupShareBundle(bundle(...r)).allergies);

test("the type, the date and what was recorded the same day", () => {
  const r = [MOLD, blank({ category: ["environment"], criticality: "low", type: "allergy", recordedDate: WHEN })];
  assert.equal(phone(...r), "Your records also have an unnamed allergy: environment, recorded Feb 28, 1979 (same day as Mold). Ask your care team.");
  assert.deepEqual(staff(...r), ["Records also have an unnamed allergy: environment, recorded Feb 28, 1979 (same day as Mold). Ask the patient."]);
});

test("everything a record could say is there; low risk isn't", () => {
  const text = phone(blank({
    category: ["food", "medication"], type: "intolerance", criticality: "high", verificationStatus: { coding: [{ system: VERIFY, code: "unconfirmed" }] },
    onsetString: "childhood", lastOccurrence: "2019-06", recordedDate: "2020", recorder: { display: "Dr. Patel" }, asserter: { display: "Avery's mother" },
    encounter: { display: "Checkup" }, note: [{ text: "Hives after  dinner.\n" }]
  }));
  assert.equal(text, "Your records have an unnamed allergy: food and medication, intolerance, marked high risk, not confirmed, began childhood, last reaction Jun 2019, recorded 2020, by Dr. Patel, reported by Avery's mother, at Checkup, note: Hives after dinner. Ask your care team.");
  assert.match(phone(blank({ onsetDateTime: "1990-05-01" })), /began May 1, 1990/);
  assert.match(phone(blank({ onsetAge: { value: 5, unit: "years" } })), /began at 5 years/);
  assert.match(phone(blank({ onsetPeriod: { start: "1990" } })), /began 1990/);
});

test("nothing else said: nothing made up", () => {
  assert.equal(phone(blank()), "Your records have an unnamed allergy. Ask your care team.");
  assert.equal(phone(blank({ criticality: "low", type: "allergy", category: ["odd"], recordedDate: "soon" })), "Your records have an unnamed allergy. Ask your care team.");
  assert.equal(unspecifiedText(1, 0), "Your records have an unnamed allergy. Ask your care team.");
  assert.equal(unspecifiedText(2, 1), "Your records also have 2 unnamed allergies. Ask your care team.");
});

test("same day means the whole day is known, and only named allergies that are current", () => {
  assert.doesNotMatch(phone(MOLD, blank({ recordedDate: "1979" })), /same day/);
  assert.doesNotMatch(phone(rec("Mold", { recordedDate: WHEN, clinicalStatus: { coding: [{ code: "resolved" }] } }), blank({ recordedDate: WHEN })), /same day/);
  assert.match(phone(MOLD, rec("Dust", { recordedDate: WHEN }), rec("Fish", { recordedDate: "2001-01-01" }), blank({ recordedDate: WHEN })), /same day as Mold and Dust\)/);
});

test("two of them are numbered", () => {
  assert.equal(phone(blank({ category: ["food"] }), blank()), "Your records have 2 unnamed allergies: (1) food; (2) no details. Ask your care team.");
  assert.equal(staff(blank({ category: ["food"] }), blank())[0], "Records have 2 unnamed allergies: (1) food; (2) no details. Ask the patient.");
});

test("other systems get the type and date too, and a long note can't fill the code", () => {
  const b = bundle(MOLD, blank({ category: ["environment"], criticality: "low", type: "allergy", recordedDate: WHEN, note: [{ text: "x".repeat(900) }] }));
  const a = b.entry.map((e) => e.resource).filter((r) => r.resourceType === "AllergyIntolerance")[1];
  assert.deepEqual([a.category, a.type, a.criticality, a.recordedDate], [["environment"], "allergy", "low", "1979-02-28"]);
  assert.ok(a.note[0].text.length < 360);
  const file = JSON.stringify(patientSummary(b, { now: NOW, uuid: () => "00000000-0000-4000-8000-000000000000" }));
  assert.match(file, /"category":\["environment"\]/);
  assert.match(file, /same day as Mold/);
});

test("a list or a code from before this still opens", () => {
  assert.equal(allergyNotices(groupShareBundle(buildShareBundle({ patient: { name: "A", birthDate: "1950" }, current: [], additions: [], stopped: [], allergies: { cards: [], statements: [], saidNone: null, unspecified: 1 } }, NOW, { allergies: { status: "loaded", savedAt: null } })).allergies)[0], "Records have an unnamed allergy. Ask the patient.");
  const saved = { items: [], statements: [], unspecified: 1, unnamed: ["food"], savedAt: "2026-11-21T10:00:00Z" };
  assert.deepEqual(keepAllergies({ status: "failed" , items: [], statements: [] }, saved).unnamed, ["food"]);
});

test("on the phone it's a row of its own", () => {
  assert.deepEqual(unnamedRow({ details: "environment, recorded Feb 28, 1979 (same day as Mold)" }), { name: "Unnamed allergy", lines: ["Environment, recorded Feb 28, 1979 (same day as Mold)", "In your records. Ask your care team."] });
  assert.deepEqual(unnamedRow({ details: "" }), { name: "Unnamed allergy", lines: ["In your records. Ask your care team."] });
});
