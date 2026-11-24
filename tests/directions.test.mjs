// What a record says about taking a medicine. If these fail, the patient or
// staff can read a wrong dose: half of the directions, a schedule for something
// taken only as needed, or a held medicine as one to take.
import test from "node:test";
import assert from "node:assert/strict";
import { dedupe, formatDosage, fromMedicationRequest, holdText } from "../js/meds.js";
import { patientCard, takeRows } from "../js/card.js";
import { buildShareBundle, groupShareBundle } from "../js/share.js";
import { checkAddition } from "../js/add-check.js";

const often = (dosage) => formatDosage([dosage]).frequency;
const repeat = (r, more) => often(Object.assign({ timing: { repeat: r } }, more));
const UNCLEAR = "See the record for how often";
const DAILY = { frequency: 1, period: 1, periodUnit: "d" };

test("every direction shows, in the record's order", () => {
  const two = [{ sequence: 2, text: "2 capsules at bedtime" }, { sequence: 1, text: "1 capsule in the morning" }];
  assert.deepEqual(formatDosage(two), { dose: null, route: null, frequency: "Direction 1: 1 capsule in the morning\nDirection 2: 2 capsules at bedtime" });
  const coded = [{ route: { text: "Oral" }, doseAndRate: [{ doseQuantity: { value: 1, unit: "tablet" } }], timing: { repeat: DAILY } }, { text: "Stop if dizzy" }];
  assert.equal(formatDosage(coded).frequency, "Direction 1: 1 tablet, Oral, once a day\nDirection 2: Stop if dizzy");
  // One Brown Bag can't read is said, not skipped.
  assert.equal(formatDosage([{ text: "1 tablet" }, {}]).frequency, "Direction 1: 1 tablet\nDirection 2: See the record");
  assert.equal(formatDosage([{ text: "1 tablet" }, null]).frequency, "1 tablet");
});

test("several directions are labelled Directions, and one is as before", () => {
  const text = formatDosage([{ text: "1 daily" }, { text: "2 daily" }]).frequency;
  assert.deepEqual(takeRows(null, null, text), [["Directions", text]]);
  assert.deepEqual(formatDosage([{ text: "Take 1 tablet daily", route: { text: "Oral" } }]), { dose: null, route: "Oral", frequency: "Take 1 tablet daily" });
});

test("as needed for something is said", () => {
  assert.equal(repeat({ frequency: 1, period: 6, periodUnit: "h" }, { asNeededCodeableConcept: { text: "pain" } }), "once every 6 hours, as needed for pain");
  assert.equal(often({ asNeededCodeableConcept: { coding: [{ display: "Headache" }] } }), "as needed for Headache");
  assert.equal(often({ asNeededCodeableConcept: {} }), "as needed");
  assert.equal(often({ asNeededBoolean: false, timing: { repeat: DAILY } }), "once a day");
});

test("ranges say both numbers", () => {
  assert.equal(repeat({ frequency: 1, frequencyMax: 2, period: 1, periodUnit: "d" }), "1 to 2 times a day");
  assert.equal(repeat({ frequency: 1, period: 4, periodMax: 6, periodUnit: "h" }), "once every 4 to 6 hours");
  assert.equal(repeat({ frequency: 2, period: 1, periodMax: 2, periodUnit: "wk" }), "2 times every 1 to 2 weeks");
});

test("when in the day or week is said", () => {
  assert.equal(repeat(Object.assign({ when: ["HS"] }, DAILY)), "once a day, at bedtime");
  assert.equal(repeat({ when: ["ACM", "ACV"] }), "before breakfast and before dinner");
  assert.equal(repeat(Object.assign({ dayOfWeek: ["mon", "thu"] }, DAILY)), "once a day, on Monday and Thursday");
  assert.equal(repeat(Object.assign({ timeOfDay: ["09:00:00", "21:30:00"] }, DAILY)), "once a day, at 9:00 AM and 9:30 PM");
});

// Part of a schedule can read as the whole. What can't be put in words sends
// the reader to the record.
test("timing Brown Bag can't put in words is never shown in part", () => {
  for (const extra of [{ count: 3 }, { boundsDuration: { value: 7, unit: "d" } }, { boundsPeriod: { start: "2026-01-01", end: "2026-02-01" } }, { duration: 30, durationUnit: "min" }, { offset: 30 }, { when: ["XX"] }, { dayOfWeek: ["xyz"] }, { timeOfDay: ["noon"] }, { modifierExtension: [{}] }]) {
    assert.equal(repeat(Object.assign({}, DAILY, extra)), UNCLEAR, JSON.stringify(extra));
  }
  assert.equal(repeat({ period: 1, periodUnit: "d" }), UNCLEAR);
  assert.equal(repeat({ frequency: 1, period: 1, periodUnit: "fortnight" }), UNCLEAR);
  assert.equal(often({ timing: { event: ["2026-11-24"] } }), UNCLEAR);
  assert.equal(often({ timing: { repeat: DAILY }, modifierExtension: [{}] }), UNCLEAR);
  assert.equal(often({ timing: { repeat: DAILY }, asNeededCodeableConcept: { text: "pain" }, maxDosePerPeriod: { numerator: { value: 4 } } }), "once a day, as needed for pain, see the record for the most to take");
  // Starting on a day isn't a limit on how often.
  assert.equal(repeat(Object.assign({ boundsPeriod: { start: "2026-01-01" } }, DAILY)), "once a day");
  // The record's own words always win.
  assert.equal(repeat({ count: 3 }, { text: "One dose now" }), "One dose now");
});

test("a coded schedule with no numbers uses its words", () => {
  assert.equal(often({ timing: { code: { text: "Twice daily with food" } } }), "Twice daily with food");
  assert.equal(often({ timing: { code: { coding: [{ code: "BID" }] } } }), "twice a day");
  assert.equal(often({ timing: { code: { coding: [{ code: "Q99", display: "Every so often" }] } } }), "Every so often");
  assert.equal(often({ timing: { code: { coding: [{ code: "Q99" }] } } }), UNCLEAR);
  assert.equal(often({}), null);
  assert.equal(often({ timing: {} }), null);
});

const med = (o) => fromMedicationRequest(Object.assign({ resourceType: "MedicationRequest", status: "active", authoredOn: "2026-09-01", medicationCodeableConcept: { text: "warfarin 5 MG", coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "855332" }] } }, o), "SMART sandbox");

test("a held medicine says so on the phone", () => {
  const held = med({ status: "on-hold" });
  assert.equal(holdText(held), "all");
  assert.deepEqual(patientCard(held, true).flags, ["On hold in your records"]);
  assert.deepEqual(patientCard(med({}), true).flags, []);
  // A list saved before this has only the record's status.
  assert.deepEqual(patientCard({ name: "x", recordStatus: "on-hold", origin: "records" }, true).flags, ["On hold in your records"]);
});

test("records that disagree about a hold say that", () => {
  for (const pair of [[med({}), med({ status: "on-hold", authoredOn: "2026-10-01" })], [med({ status: "on-hold" }), med({ authoredOn: "2026-10-01" })]]) {
    const [one] = dedupe(pair);
    assert.deepEqual(patientCard(one, true).flags, ["One of your records has this on hold"]);
  }
  assert.deepEqual(patientCard(dedupe([med({ status: "on-hold" }), med({ status: "on-hold", authoredOn: "2026-10-01" })])[0], true).flags, ["On hold in your records"]);
  // A stopped record isn't a reason to take it.
  assert.deepEqual(patientCard(dedupe([med({ status: "stopped" }), med({ status: "on-hold", authoredOn: "2026-10-01" })])[0], true).flags, ["On hold in your records"]);
});

const share = (item) => buildShareBundle({ patient: { name: "A", birthDate: "1950-01-01" }, current: [item], additions: [], stopped: [] }, new Date("2026-11-24T12:00:00Z"));
const round = (item) => groupShareBundle(JSON.parse(JSON.stringify(share(item)))).fromRecords[0];

test("a held medicine says so to staff, and in FHIR", () => {
  assert.equal(share(med({ status: "on-hold" })).entry[1].resource.status, "on-hold");
  assert.deepEqual(round(med({ status: "on-hold" })).flags, ["On hold in the records"]);
  const some = dedupe([med({}), med({ status: "on-hold", authoredOn: "2026-10-01" })])[0];
  assert.deepEqual(round(some).flags, ["One record has this on hold"]);
  assert.equal(share(some).entry[1].resource.status, "unknown");
  assert.deepEqual(round(med({})).flags, []);
});

test("every direction reaches staff", () => {
  const row = round(med({ dosageInstruction: [{ text: "1 capsule in the morning" }, { text: "2 capsules at bedtime" }] }));
  assert.deepEqual(row.take, [["Directions", "Direction 1: 1 capsule in the morning\nDirection 2: 2 capsules at bedtime"]]);
});

// "Already on your list" needs the same directions, not one of several.
test("one of several directions, or one end of a range, isn't the same schedule", () => {
  const entry = (frequency) => ({ name: "gabapentin 300 MG Oral Capsule", rxcui: "310431", dose: null, frequency });
  const add = { name: "gabapentin 300 MG Oral Capsule", rxcui: "310431", dose: "1 capsule", frequency: "Once a day" };
  const kind = (frequency, o) => checkAddition(Object.assign({}, add, o), [entry(frequency)], new Map()).kind;
  assert.equal(kind("1 capsule once a day"), "duplicate");
  assert.equal(kind("Direction 1: 1 capsule once a day\nDirection 2: 2 capsules at bedtime"), "different");
  assert.equal(kind("1 capsule 1 to 2 times a day", { frequency: "Twice a day" }), "different");
  assert.equal(kind("1 capsule once a day, see the record for the most to take"), "different");
});
