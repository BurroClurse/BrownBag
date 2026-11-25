import test from "node:test";
import { fromAllergyRecords, arrangeAllergies } from "../js/allergies.js";
import assert from "node:assert/strict";
import {
  allergyParts,
  buildShareBundle,
  groupShareBundle,
  packShare,
  unpackShare,
  fitsInQr,
  allergyNotices, staffSaysNone,
  allergyEmptyText,
  QR_MAX_BYTES,
  ShareError,
  AS_NEEDED_NOTE
} from "../js/share.js";

var BASE = "https://burroclurse.github.io/BrownBag/";
var NOW = new Date("2026-11-17T15:00:00Z");
var PATIENT = { name: "Jane Example", birthDate: "1961-04-02" };

function recordItem(name, rxcui) {
  return {
    key: rxcui ? "rx:" + rxcui : "text:" + name.toLowerCase(),
    rxcui: rxcui || null,
    name: name,
    dose: "1 tablet",
    route: "Oral",
    frequency: "once a day",
    start: "2023-03-02",
    end: null,
    prescriber: "Dr. Patel",
    source: "SMART sandbox",
    status: "current",
    origin: "records",
    lastDate: "2023-03-02",
    count: 1
  };
}

var ADDITION = { id: "a1", rxcui: "1", name: "Vitamin D3 2000 IU", dose: "1 capsule", frequency: "daily", addedAt: "2026-11-01" };

function oneOfEach() {
  return buildShareBundle({
    patient: PATIENT,
    current: [recordItem("lisinopril 10 MG Oral Tablet", "314076")],
    additions: [ADDITION],
    stopped: [Object.assign(recordItem("metformin 500 MG Oral Tablet", "861007"), { stoppedAt: "2026-10-01" })]
  }, NOW);
}

// Deterministic, varied names so compression can't shrink them to nothing.
function names(count) {
  var seed = 7;
  var letters = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: count }, function (unused, index) {
    var word = "";
    for (var i = 0; i < 28; i += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      word += letters[seed % 26];
    }
    return word + " " + (index + 5) + " MG Oral Tablet";
  });
}

test("pack then unpack with the right code gives the same bundle", async () => {
  var bundle = oneOfEach();
  var packed = await packShare(bundle, BASE);
  assert.equal(packed.prefix, BASE + "share.html#v3.");
  assert.match(packed.digits, /^\d+$/);
  assert.equal(packed.url, packed.prefix + packed.digits);
  var fragment = packed.url.split("#")[1];
  assert.deepEqual(await unpackShare(fragment, packed.code), bundle);
});

test("the code is 6 digits", async () => {
  var packed = await packShare(oneOfEach(), BASE);
  assert.match(packed.code, /^\d{6}$/);
});

test("wrong code throws wrong-code", async () => {
  var packed = await packShare(oneOfEach(), BASE);
  var wrong = packed.code === "000000" ? "111111" : "000000";
  await assert.rejects(unpackShare(packed.url.split("#")[1], wrong), (error) => error instanceof ShareError && error.code === "wrong-code");
});

test("missing prefix throws bad-link, and so does a fragment cut in half", async () => {
  var packed = await packShare(oneOfEach(), BASE);
  var fragment = packed.url.split("#")[1];
  await assert.rejects(unpackShare(fragment.slice(3), packed.code), (error) => error instanceof ShareError && error.code === "bad-link");
  await assert.rejects(unpackShare(fragment.slice(0, 12), packed.code), (error) => error instanceof ShareError && error.code === "bad-link");
  await assert.rejects(unpackShare("", packed.code), (error) => error instanceof ShareError && error.code === "bad-link");
});

test("the fragment does not contain the medicine name in plain text", async () => {
  var packed = await packShare(oneOfEach(), BASE);
  assert.ok(!packed.url.toLowerCase().includes("lisinopril"));
});

test("grouping puts each medicine in the right group", () => {
  var groups = groupShareBundle(oneOfEach());
  assert.deepEqual(groups.patient, PATIENT);
  assert.equal(groups.madeAt, NOW.toISOString());
  assert.deepEqual(groups.fromRecords.map((row) => row.name), ["lisinopril 10 MG Oral Tablet"]);
  assert.deepEqual(groups.addedByPatient.map((row) => row.name), ["Vitamin D3 2000 IU"]);
  assert.deepEqual(groups.patientSaysStopped.map((row) => row.name), ["metformin 500 MG Oral Tablet"]);
  assert.ok(groups.fromRecords[0].take.some(([, text]) => text === "once a day"));
  assert.deepEqual(groups.patientSaysStopped[0].facts, [["Not taking since", "Oct 1, 2026"]]);
});

test("records keep their RxNorm coding in the bundle", () => {
  var statement = oneOfEach().entry[1].resource;
  assert.equal(statement.resourceType, "MedicationStatement");
  assert.equal(statement.medicationCodeableConcept.coding[0].code, "314076");
  assert.equal(statement.medicationCodeableConcept.text, "lisinopril 10 MG Oral Tablet");
  assert.equal(statement.note[0].text, "From records: SMART sandbox");
});

test("additions only, no record medicines, still packs and groups", async () => {
  var bundle = buildShareBundle({ patient: PATIENT, current: [], additions: [ADDITION], stopped: [] }, NOW);
  var packed = await packShare(bundle, BASE);
  var groups = groupShareBundle(await unpackShare(packed.url.split("#")[1], packed.code));
  assert.equal(groups.fromRecords.length, 0);
  assert.equal(groups.addedByPatient.length, 1);
});

test("HTML in a name stays as literal text", () => {
  var bundle = buildShareBundle({ patient: PATIENT, current: [recordItem("<b>Aspirin</b>", null)], additions: [], stopped: [] }, NOW);
  assert.equal(groupShareBundle(bundle).fromRecords[0].name, "<b>Aspirin</b>");
});

function listOf(count) {
  return buildShareBundle({ patient: PATIENT, current: names(count).map((name, i) => recordItem(name, String(1000 + i))), additions: [], stopped: [] }, NOW);
}

test("fitsInQr is false for a 60 medicine list and true for 5", async () => {
  var big = await packShare(listOf(60), BASE);
  var small = await packShare(listOf(5), BASE);
  assert.equal(QR_MAX_BYTES, 2331);
  assert.equal(fitsInQr(big.prefix, big.digits), false);
  assert.equal(fitsInQr(small.prefix, small.digits), true);
});

test("fitsInQr takes more medicines than the old byte count", async () => {
  // The old way sent the payload as letters: one byte per base64url character.
  function fitsAsBytes(packed) {
    return new TextEncoder().encode(packed.prefix).length + packed.digits.length / 2 <= QR_MAX_BYTES;
  }
  var mostAsBytes = 0;
  var mostAsDigits = 0;
  for (var count = 1; count <= 60; count += 1) {
    var packed = await packShare(listOf(count), BASE);
    if (fitsAsBytes(packed)) mostAsBytes = count;
    if (fitsInQr(packed.prefix, packed.digits)) mostAsDigits = count;
  }
  assert.ok(mostAsBytes > 0);
  assert.ok(mostAsDigits > mostAsBytes, mostAsDigits + " should be more than " + mostAsBytes);
});

test("the bundle has no ids and uses resource references", () => {
  var bundle = oneOfEach();
  bundle.entry.forEach(function (entry, index) {
    assert.equal(entry.fullUrl, "resource:" + index);
    assert.equal(entry.resource.id, undefined);
    assert.equal(entry.resource.meta, undefined);
    assert.equal(entry.resource.text, undefined);
  });
  assert.equal(bundle.entry[0].resource.resourceType, "Patient");
  bundle.entry.slice(1).forEach(function (entry) {
    assert.deepEqual(entry.resource.subject, { reference: "resource:0" });
  });
  assert.deepEqual(bundle.entry[2].resource.informationSource, { reference: "resource:0" });
});

test("an odd number of digits throws bad-link", async () => {
  var packed = await packShare(oneOfEach(), BASE);
  await assert.rejects(unpackShare("v3." + packed.digits.slice(1), packed.code), (error) => error instanceof ShareError && error.code === "bad-link");
});

test("a digit pair above 77 throws bad-link", async () => {
  var packed = await packShare(oneOfEach(), BASE);
  await assert.rejects(unpackShare("v3.99" + packed.digits.slice(2), packed.code), (error) => error instanceof ShareError && error.code === "bad-link");
});

test("the old v1 link form is refused", async () => {
  await assert.rejects(unpackShare("v1.AAAA", "123456"), (error) => error instanceof ShareError && error.code === "bad-link");
});

test("a list from a saved copy or a partial load says so to staff", () => {
  var bundle = buildShareBundle(
    { patient: PATIENT, current: [recordItem("lisinopril 10 MG Oral Tablet", "314076")], additions: [], stopped: [] },
    NOW,
    { recordsSavedAt: "2026-11-01T14:00:00.000Z", incomplete: true }
  );
  var groups = groupShareBundle(bundle);
  assert.equal(groups.recordsSavedAt, "2026-11-01T14:00:00.000Z");
  assert.equal(groups.incomplete, true);
});

test("a fresh, complete list carries no warnings", () => {
  var groups = groupShareBundle(oneOfEach());
  assert.equal(groups.recordsSavedAt, null);
  assert.equal(groups.incomplete, false);
  assert.equal(oneOfEach().meta, undefined);
});

test("fills travel in the shared list and land in their own staff group", () => {
  const fills = (count, last, insurers = ["Aetna"]) => ({ count, last, insurers, cash: false });
  const list = {
    patient: { name: "Avery Brownbag", birthDate: "1950-03-14" },
    current: [
      { name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", source: "SMART sandbox", fills: fills(3, "2025-07-23") },
      { name: "atorvastatin 20 MG Oral Tablet", rxcui: "617310", source: "SMART sandbox", fills: fills(0, null, []) },
      { name: "metformin hydrochloride 500 MG Oral Tablet", rxcui: "861007", source: "SMART sandbox", completedButFilled: "2026-09-22", recordStatus: "completed", fills: fills(1, "2026-09-22") },
      { name: "warfarin 5 MG Oral Tablet", rxcui: "855332", source: "SMART sandbox", completedButFilled: "2026-09-23", recordStatus: "stopped", fills: fills(1, "2026-09-23") },
      { name: "sertraline 50 MG Oral Tablet", rxcui: "312941", origin: "claims", source: "Aetna claims", fills: fills(1, "2026-10-22") }
    ],
    additions: [],
    stopped: []
  };
  const bundle = buildShareBundle(list, new Date("2026-11-21T12:00:00Z"));
  const statements = bundle.entry.map((e) => e.resource).filter((r) => r.resourceType === "MedicationStatement");
  const notes = (r) => (r.note || []).map((n) => n.text);
  assert.ok(notes(statements[0]).includes("Last filled 2025-07-23 (Aetna claims), 3 fills"));
  assert.ok(notes(statements[1]).includes("No fill found in claims"));
  assert.ok(notes(statements[2]).some((t) => /marked completed/i.test(t) && t.includes("2026-09-22")));
  assert.ok(notes(statements[3]).includes("Record marked stopped, but filled 2026-09-23"));
  assert.equal(statements[4].informationSource.display, "Aetna claims");
  assert.equal(notes(statements[4])[0], "Filled, not in the health record");
  assert.ok(!notes(statements[4]).some((t) => t.startsWith("From records")));
  const groups = groupShareBundle(bundle);
  assert.deepEqual(groups.fromClaims.map((r) => r.name), ["sertraline 50 MG Oral Tablet"]);
  assert.equal(groups.fromRecords.length, 4);
  assert.deepEqual(groups.fromRecords[0].facts.slice(0, 2), [["Filled", "3 times, last Jul 23, 2025"], ["Paid", "Through Aetna"]]);
});

test("a list without fills shares no fill notes", () => {
  const list = { patient: { name: "A", birthDate: "1950-01-01" }, current: [{ name: "lisinopril", rxcui: "314076", source: "SMART sandbox" }], additions: [], stopped: [] };
  const statement = buildShareBundle(list, new Date()).entry[1].resource;
  assert.deepEqual(statement.note.map((n) => n.text), ["From records: SMART sandbox"]);
  assert.deepEqual(groupShareBundle(buildShareBundle(list, new Date())).fromClaims, []);
});

function addedDosage(addition) {
  const bundle = buildShareBundle({ patient: PATIENT, current: [], stopped: [], additions: [addition] }, NOW);
  return bundle.entry.map((e) => e.resource).find((r) => r.resourceType === "MedicationStatement").dosage;
}

test("a picked dose and schedule go in as FHIR dosage, words kept", () => {
  const d = addedDosage({ name: "Amoxicillin", rxcui: "308191", dose: "5 mL", frequency: "3 times a day", quantity: { value: 5, unit: "mL", system: "http://unitsofmeasure.org", code: "mL" }, schedule: { frequency: 3, period: 1, periodUnit: "d" } })[0];
  assert.equal(d.text, "5 mL · 3 times a day");
  assert.deepEqual(d.doseAndRate, [{ doseQuantity: { value: 5, unit: "mL", system: "http://unitsofmeasure.org", code: "mL" } }]);
  assert.deepEqual(d.timing, { repeat: { frequency: 3, period: 1, periodUnit: "d" } });
});

test("bedtime and as needed use when and asNeededBoolean", () => {
  const bed = addedDosage({ name: "Melatonin", rxcui: null, dose: null, frequency: "At bedtime", quantity: null, schedule: { frequency: 1, period: 1, periodUnit: "d", when: ["HS"] } })[0];
  assert.deepEqual(bed.timing.repeat.when, ["HS"]);
  const prn = addedDosage({ name: "Ibuprofen", rxcui: null, dose: null, frequency: "As needed", quantity: null, schedule: { asNeeded: true } })[0];
  assert.equal(prn.asNeededBoolean, true);
  assert.equal(prn.timing, undefined);
});

test("additions saved before this change share as words only", () => {
  assert.deepEqual(addedDosage({ name: "Vitamin D3", rxcui: null, dose: "1 capsule", frequency: "daily" }), [{ text: "1 capsule · daily" }]);
});

test("an As needed medicine stays active, says so in FHIR, and gets its own staff group", () => {
  const list = {
    patient: PATIENT,
    current: [
      recordItem("lisinopril 10 MG Oral Tablet", "314076"),
      Object.assign(recordItem("oxycodone 5 MG Oral Tablet", "1049621"), { asNeededAt: "2026-11-20" })
    ],
    additions: [],
    stopped: []
  };
  const bundle = buildShareBundle(list, NOW);
  const oxy = bundle.entry.map((e) => e.resource).find((r) => r.medicationCodeableConcept && /oxycodone/.test(r.medicationCodeableConcept.text));
  assert.equal(oxy.status, "active");
  assert.equal(oxy.dosage[0].asNeededBoolean, true);
  assert.ok(oxy.note.some((n) => n.text === AS_NEEDED_NOTE));
  const groups = groupShareBundle(bundle);
  assert.deepEqual(groups.fromRecords.map((r) => r.name), ["lisinopril 10 MG Oral Tablet"]);
  assert.deepEqual(groups.asNeeded.map((r) => r.name), ["oxycodone 5 MG Oral Tablet"]);
  const texts = groups.asNeeded[0].facts.map(([, text]) => text);
  assert.ok(!texts.includes(AS_NEEDED_NOTE));
  assert.ok(texts.includes("SMART sandbox"));
});

const CARD = (o) => Object.assign({ key: "k", otherKeys: [], name: "Mold", code: null, reactions: [], intolerance: false, unconfirmed: false, highRisk: false, source: "SMART sandbox", origin: "records", mine: null }, o);
const OWN = (name, reaction, o) => CARD(Object.assign({ name, source: null, origin: "added", mine: { ids: ["o"], keys: [], reaction, addedAt: "2026-11-23" } }, o));
function withAllergies(cards, { statements = [], saidNone = null, status = "loaded", savedAt = null, unspecified = 0 } = {}) {
  return buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [], allergies: { cards, statements, saidNone, unspecified } }, NOW, { allergies: { status, savedAt } });
}
const allergyEntries = (bundle) => bundle.entry.map((e) => e.resource).filter((r) => r.resourceType === "AllergyIntolerance");

test("an allergy from the records travels as FHIR with its reaction and flags", () => {
  const bundle = withAllergies([CARD({
    code: { system: "http://snomed.info/sct", code: "84489001" }, highRisk: true, intolerance: true, unconfirmed: true,
    reactions: [{ text: "Hives", severity: "severe" }], mine: { ids: [], keys: ["k"], reaction: "Itching", addedAt: "2026-11-23" }
  })]);
  const [a] = allergyEntries(bundle);
  assert.deepEqual(a.patient, { reference: "resource:0" });
  assert.equal(a.clinicalStatus.coding[0].code, "active");
  assert.equal(a.verificationStatus.coding[0].code, "unconfirmed");
  assert.equal(a.criticality, "high");
  assert.equal(a.type, "intolerance");
  assert.deepEqual(a.code, { text: "Mold", coding: [{ system: "http://snomed.info/sct", code: "84489001" }] });
  assert.deepEqual(a.reaction, [{ manifestation: [{ text: "Hives" }], severity: "severe" }, { manifestation: [{ text: "Itching" }], note: [{ text: "From the patient" }] }]);
  assert.deepEqual(a.note, [{ text: "From records: SMART sandbox" }]);
  assert.equal(a.asserter, undefined);
  const groups = groupShareBundle(bundle).allergies;
  assert.deepEqual(groups.fromRecords, [{ name: "Mold", source: "SMART sandbox", lines: ["Marked high risk · Intolerance · Not confirmed", "Reaction: Hives, severe (records) · Itching (patient)"] }]);
  assert.deepEqual(groups.fromPatient, []);
});

test("a missing reaction is said, never blank", () => {
  const groups = groupShareBundle(withAllergies([CARD(), OWN("Latex", "Not sure"), CARD({ name: "Dust", mine: { ids: [], keys: ["k"], reaction: "Not sure" } })])).allergies;
  assert.deepEqual(groups.fromRecords[0].lines, ["Reaction: not listed"]);
  assert.deepEqual(groups.fromPatient[0].lines, ["Reaction: not known"]);
  assert.deepEqual(groups.fromRecords[1].lines, ["Reaction: not known (patient)"]);
  const both = groupShareBundle(withAllergies([CARD({ reactions: [{ text: "Hives", severity: null }, { text: "Rash", severity: "mild" }], mine: { ids: [], keys: ["k"], reaction: "Not sure" } })])).allergies;
  assert.deepEqual(both.fromRecords[0].lines, ["Reaction: Hives (records) · Rash, mild (records) · not known (patient)"]);
});

// The source is said once, over the list. If this broke, staff couldn't tell
// where an allergy came from.
test("allergies say where they're from: once when it's one place, else each", () => {
  const parts = (cards) => allergyParts(groupShareBundle(withAllergies(cards)).allergies);
  const one = parts([CARD(), CARD({ name: "Dust" }), OWN("Latex", "Hives")]);
  assert.deepEqual(one.map((p) => p.title), ["From records (SMART sandbox)", "From patient"]);
  assert.deepEqual(one[0].rows.map((r) => r.lines), [["Reaction: not listed"], ["Reaction: not listed"]]);
  assert.deepEqual(one[1].rows, [{ name: "Latex", lines: ["Reaction: Hives"] }]);
  const two = parts([CARD(), CARD({ name: "Dust", source: "Other Clinic" })]);
  assert.deepEqual(two.map((p) => p.title), ["From records"]);
  assert.deepEqual(two[0].rows.map((r) => r.lines[1]), ["Source: SMART sandbox", "Source: Other Clinic"]);
  assert.deepEqual(parts([]), []);
});

// Anyone can make a code; a note Brown Bag doesn't know is still read by staff.
test("an allergy's other notes are kept, and a missing source is never filled in", () => {
  const bundle = withAllergies([CARD(), CARD({ name: "Dust" })]);
  const entries = allergyEntries(bundle);
  entries[0].note = [{ text: "Carries an EpiPen" }];
  const part = allergyParts(groupShareBundle(bundle).allergies)[0];
  assert.equal(part.title, "From records");
  assert.deepEqual(part.rows.map((r) => r.lines), [["Reaction: not listed", "Carries an EpiPen"], ["Reaction: not listed", "Source: SMART sandbox"]]);
});

test("the patient's own allergy says who says so", () => {
  const bundle = withAllergies([OWN("Penicillin", "Hives or rash", { rxcui: "1" })]);
  const [a] = allergyEntries(bundle);
  assert.deepEqual(a.asserter, { reference: "resource:0" });
  assert.equal(a.verificationStatus.coding[0].code, "unconfirmed");
  assert.equal(a.code.coding[0].code, "1");
  assert.deepEqual(groupShareBundle(bundle).allergies.fromPatient, [{ name: "Penicillin", source: null, lines: ["Reaction: Hives or rash"] }]);
  assert.equal(allergyEntries(withAllergies([OWN("Latex", "Not sure")]))[0].reaction, undefined);
});

test("no known allergies says whether the patient or the records said it", () => {
  const said = withAllergies([], { saidNone: "2026-11-23" });
  assert.equal(allergyEntries(said)[0].code.coding[0].code, "716186003");
  // US Core: asked and none is confirmed.
  assert.equal(allergyEntries(said)[0].verificationStatus.coding[0].code, "confirmed");
  const g = groupShareBundle(said).allergies;
  assert.equal(g.saidNone, true);
  assert.equal(allergyEmptyText(g), "Patient says: no known allergies.");
  const records = groupShareBundle(withAllergies([], { statements: ["No known drug allergy"] })).allergies;
  assert.deepEqual(records.statements, ["No known drug allergy"]);
  assert.equal(records.saidNone, false);
  assert.equal(allergyEmptyText(records), null);
  const beside = groupShareBundle(withAllergies([OWN("Penicillin", "Itching")], { statements: ["No known drug allergy"] })).allergies;
  assert.equal(beside.fromPatient.length, 1);
  assert.deepEqual(beside.statements, ["No known drug allergy"]);
});

test("a load that failed is said, even when something is listed", () => {
  for (const status of ["failed", "refused", "not-loaded"]) {
    const g = groupShareBundle(withAllergies([OWN("Latex", "Itching")], { status })).allergies;
    assert.deepEqual(allergyNotices(g), ["Allergies from records couldn't be loaded. Ask the patient."], status);
    assert.equal(allergyEmptyText(groupShareBundle(withAllergies([], { status })).allergies), null, status);
    assert.deepEqual(allergyNotices(groupShareBundle(withAllergies([], { status, saidNone: "2026-11-23" })).allergies).length, 1);
  }
  assert.deepEqual(allergyNotices(groupShareBundle(withAllergies([])).allergies), []);
  assert.equal(allergyEmptyText(groupShareBundle(withAllergies([])).allergies), "None in the records. The patient hasn't said.");
});

test("a saved copy of the allergies says its date", () => {
  const g = groupShareBundle(withAllergies([CARD()], { status: "failed", savedAt: "2026-11-21T18:00:00Z" })).allergies;
  const notices = allergyNotices(g);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /^Allergies from records are a copy saved on .*2026.*\. They may be out of date\.$/);
  const empty = groupShareBundle(withAllergies([], { status: "loaded", savedAt: "2026-11-21T18:00:00Z" })).allergies;
  assert.equal(allergyEmptyText(empty), "None in the records. The patient hasn't said.");
});

test("a code from before allergies says it doesn't include them", () => {
  const before = groupShareBundle(oneOfEach()).allergies;
  assert.equal(before, null);
  assert.equal(allergyEmptyText(before), "This code doesn't include allergies. Ask the patient.");
  assert.deepEqual(allergyNotices(before), []);
});

test("new codes start v3 and old v2 codes still open", async () => {
  const packed = await packShare(withAllergies([CARD()]), BASE);
  assert.equal(packed.prefix, BASE + "share.html#v3.");
  assert.equal(groupShareBundle(await unpackShare("v3." + packed.digits, packed.code)).allergies.fromRecords.length, 1);
  assert.equal(groupShareBundle(await unpackShare("v2." + packed.digits, packed.code)).allergies.fromRecords.length, 1);
  await assert.rejects(unpackShare("v4." + packed.digits, packed.code), (error) => error.code === "bad-link");
});

test("eight allergies take little room in the code", async () => {
  const meds = names(15).map((name, i) => recordItem(name, String(1000 + i)));
  const cards = ["Penicillin", "Latex", "Peanuts", "Codeine"].map((n) => OWN(n, "Hives or rash")).concat(["Mold", "Shellfish", "Eggs", "Dust"].map((name, i) => CARD({ name, code: { system: "http://snomed.info/sct", code: String(84489001 + i) } })));
  const packed = await packShare(buildShareBundle({ patient: PATIENT, current: meds, additions: [], stopped: [], allergies: { cards, statements: [], saidNone: null } }, NOW, { allergies: { status: "loaded", savedAt: null } }), BASE);
  assert.ok(fitsInQr(packed.prefix, packed.digits));
});

test("only the patient's own no known allergies statement reads as one", () => {
  const typed = groupShareBundle(withAllergies([OWN("No known food allergies", "Not sure"), OWN("Latex", "Itching")])).allergies;
  assert.equal(typed.saidNone, false);
  assert.deepEqual(typed.fromPatient.map((a) => a.name), ["No known food allergies", "Latex"]);
});

test("staff hear about an entry that doesn't say what it's to", () => {
  const g = groupShareBundle(withAllergies([CARD()], { unspecified: 1 })).allergies;
  assert.equal(g.unspecified, 1);
  assert.deepEqual(g.fromRecords.map((a) => a.name), ["Mold"]);
  assert.deepEqual(allergyNotices(g), ["Records also have an unnamed allergy. Ask the patient."]);
  const alone = groupShareBundle(withAllergies([], { unspecified: 2 })).allergies;
  assert.equal(allergyEmptyText(alone), null);
  assert.deepEqual(allergyNotices(alone), ["Records have 2 unnamed allergies. Ask the patient."]);
  const said = groupShareBundle(withAllergies([], { unspecified: 1, saidNone: "2026-11-23" })).allergies;
  assert.equal(allergyEmptyText(said), "Patient says: no known allergies.");
  assert.equal(allergyNotices(said).length, 1);
  assert.equal(allergyNotices(groupShareBundle(withAllergies([], { unspecified: 1, status: "failed" })).allergies).length, 2);
});

test("every code and the record's own status travel", () => {
  const [a] = allergyEntries(withAllergies([CARD({ codes: [{ system: "http://local", code: "A1" }, { system: "http://snomed.info/sct", code: "84489001" }, { system: null, code: "x" }], clinical: "recurrence" })]));
  assert.deepEqual(a.code.coding.map((c) => c.code), ["A1", "84489001"]);
  assert.equal(a.clinicalStatus.coding[0].code, "recurrence");
  // A list saved before this has one code and no status.
  const [b] = allergyEntries(withAllergies([CARD({ code: { system: "http://snomed.info/sct", code: "1" } })]));
  assert.deepEqual([b.code.coding[0].code, b.clinicalStatus.coding[0].code], ["1", "active"]);
});

// The R4 rules for AllergyIntolerance that a Brown Bag code must keep:
// required elements, the required code lists, ait-1 and ait-2.
const CLINICAL = "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical";
const VERIFICATION = "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification";
function problems(a) {
  const out = [];
  const one = (concept, system, allowed, name) => {
    const c = concept && concept.coding && concept.coding[0];
    if (!c || c.system !== system || !allowed.includes(c.code)) out.push(name + " " + JSON.stringify(concept));
  };
  one(a.clinicalStatus, CLINICAL, ["active", "recurrence", "relapse", "inactive", "resolved", "remission"], "clinicalStatus");
  if (a.verificationStatus) one(a.verificationStatus, VERIFICATION, ["unconfirmed", "confirmed"], "verificationStatus");
  if (!a.patient || a.patient.reference !== "resource:0") out.push("patient");
  if (!a.code || !(a.code.text || (a.code.coding || []).length)) out.push("code");
  (a.code.coding || []).forEach((c) => { if (!/^(https?:|urn:)/.test(c.system || "") || !c.code) out.push("coding " + JSON.stringify(c)); });
  if (a.type && !["allergy", "intolerance"].includes(a.type)) out.push("type");
  (a.category || []).forEach((c) => { if (!["food", "medication", "environment", "biologic"].includes(c)) out.push("category " + c); });
  if (a.criticality && !["low", "high", "unable-to-assess"].includes(a.criticality)) out.push("criticality");
  if (a.recordedDate && !/^\d{4}(-\d\d(-\d\d)?)?/.test(a.recordedDate)) out.push("recordedDate");
  (a.reaction || []).forEach((r) => {
    if (!(r.manifestation || []).length) out.push("reaction without manifestation");
    if (r.severity && !["mild", "moderate", "severe"].includes(r.severity)) out.push("severity");
  });
  Object.keys(a).forEach((k) => { if (Array.isArray(a[k]) && !a[k].length) out.push("empty " + k); });
  return out;
}

const RECORD = {
  resourceType: "AllergyIntolerance", id: "9", type: "allergy", category: ["food"], criticality: "low", recordedDate: "2019-04-02T10:00:00Z",
  clinicalStatus: { coding: [{ system: CLINICAL, code: "active" }] }, verificationStatus: { coding: [{ system: VERIFICATION, code: "confirmed" }] },
  code: { text: "Peanut", coding: [{ system: "http://snomed.info/sct", code: "762952008", display: "Peanut" }] },
  reaction: [{ severity: "moderate", manifestation: [{ text: "Hives", coding: [{ system: "http://snomed.info/sct", code: "126485001", display: "Urticaria" }] }] }]
};

test("a coded record keeps its codes, status, category, risk, date and coded reaction", () => {
  const items = fromAllergyRecords([RECORD], "SMART sandbox");
  const arranged = arrangeAllergies({ status: "loaded", items: items.items, statements: [], savedAt: null }, { allergies: [], allergyReactions: {} });
  const bundle = buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [], allergies: arranged }, NOW, { allergies: { status: "loaded", savedAt: null } });
  const [a] = allergyEntries(bundle);
  assert.equal(a.verificationStatus.coding[0].code, "confirmed");
  assert.deepEqual([a.type, a.category, a.criticality, a.recordedDate], ["allergy", ["food"], "low", "2019-04-02"]);
  assert.deepEqual(a.reaction[0].manifestation[0], { text: "Hives", coding: [{ system: "http://snomed.info/sct", code: "126485001" }] });
  assert.equal(a.reaction[0].severity, "moderate");
  assert.deepEqual(problems(a), []);
  // Staff see a low risk or a plain allergy as nothing special.
  assert.deepEqual(groupShareBundle(bundle).allergies.fromRecords[0].lines, ["Reaction: Hives, moderate (records)"]);
});

test("the patient's own says who said it, who recorded it and when", () => {
  const [pen, kiwi, bee] = allergyEntries(withAllergies([OWN("Penicillin", "Hives"), OWN("Kiwi", "Not sure"), OWN("Bee stings", "Itching")]));
  assert.deepEqual([pen.asserter, pen.recorder], [{ reference: "resource:0" }, { reference: "resource:0" }]);
  assert.equal(pen.recordedDate, "2026-11-23");
  assert.deepEqual(pen.category, ["medication"]);
  assert.equal(kiwi.category, undefined);
  assert.deepEqual(bee.category, ["environment"]);
  for (const a of [pen, kiwi, bee]) assert.deepEqual(problems(a), []);
});

test("every allergy Brown Bag sends keeps the R4 rules", () => {
  const odd = fromAllergyRecords([
    RECORD,
    { resourceType: "AllergyIntolerance", id: "a" },
    { resourceType: "AllergyIntolerance", id: "b", code: { coding: [{ code: "x" }] }, verificationStatus: { coding: [{ code: "presumed" }] }, type: "weird", category: ["other"], criticality: "extreme", recordedDate: "soon", reaction: [{ severity: "awful" }] },
    { resourceType: "AllergyIntolerance", id: "c", code: { text: "Latex", coding: [{ system: "", code: "1" }] }, clinicalStatus: { coding: [{ code: "recurrence" }] } },
    { resourceType: "AllergyIntolerance", id: "d", code: { text: "Dust" }, clinicalStatus: { coding: [{ code: "odd" }] } }
  ], "S").items;
  const arranged = arrangeAllergies({ status: "loaded", items: odd, statements: ["No known drug allergy"], unspecified: 1, savedAt: null }, { allergies: [{ id: "1", name: "Eggs", reaction: "Not sure", addedAt: "2026-11-23" }], allergyReactions: {} });
  const list = allergyEntries(buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [], allergies: arranged }, NOW, { allergies: { status: "loaded", savedAt: null } }));
  assert.ok(list.length >= 7);
  for (const a of list) assert.deepEqual(problems(a), [], JSON.stringify(a));
  for (const a of allergyEntries(withAllergies([], { saidNone: "2026-11-23" }))) assert.deepEqual(problems(a), []);
});

test("an allergy with no name says the name is unknown, in the standard's own words", () => {
  const items = fromAllergyRecords([{ resourceType: "AllergyIntolerance", id: "a" }], "S").items;
  const arranged = arrangeAllergies({ status: "loaded", items, statements: [], savedAt: null }, {});
  const [a] = allergyEntries(buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [], allergies: arranged }, NOW, { allergies: { status: "loaded", savedAt: null } }));
  assert.deepEqual(a.code, { text: "Unnamed allergy", coding: [{ system: "http://terminology.hl7.org/CodeSystem/data-absent-reason", code: "unknown" }] });
});

test("the medicines block counts what the home button counts", async () => {
  const { shareMedicineCount } = await import("../js/share.js");
  const { medicineCount, arrangeList, shareListFrom } = await import("../js/view.js");
  const current = [recordItem("lisinopril", "314076"), Object.assign(recordItem("sertraline", "312941"), { origin: "claims", source: "Aetna claims" }), recordItem("warfarin", "855332")];
  const split = { current, older: [recordItem("old one", "9")], failed: false };
  const data = { stopped: { "rx:855332": { name: "warfarin", stoppedAt: "2026-11-01" } }, additions: [ADDITION], changes: [] };
  const arranged = arrangeList(split, data);
  const groups = groupShareBundle(buildShareBundle(shareListFrom(PATIENT, arranged, data.additions), NOW));
  assert.equal(shareMedicineCount(groups), medicineCount(arranged, data.additions));
  assert.equal(shareMedicineCount(groups), 3);
});

test("a partial list never gets a definite total", async () => {
  const { medicinesTitle } = await import("../js/share.js");
  const groups = { fromRecords: [], fromClaims: [], addedByPatient: [{}], incomplete: false };
  assert.equal(medicinesTitle(groups), "Medicines (1)");
  assert.equal(medicinesTitle(Object.assign({}, groups, { incomplete: true })), "Medicines");
});

// The staff page and See what's inside say how old the list is. If this broke,
// a list from last week could look as new as the code, or a date could vouch
// for a list that only partly loaded.
const at = (iso) => "<" + iso + ">";
const dated = (warnings, list = {}) => groupShareBundle(buildShareBundle(Object.assign({ patient: PATIENT, current: [], additions: [], stopped: [] }, list), NOW, warnings));

test("the dates say when the records were updated, then when the QR code was made", async () => {
  const { dateLines } = await import("../js/share.js");
  const made = "QR code made: <" + NOW.toISOString() + ">";
  assert.deepEqual(dateLines(dated({ recordsUpdatedAt: "2026-11-23T10:00:00.000Z" }), at), ["Meds last updated: <2026-11-23T10:00:00.000Z>", made]);
  assert.deepEqual(dateLines(dated({ recordsSavedAt: "2026-11-01T14:00:00.000Z" }), at), ["Meds last updated: <2026-11-01T14:00:00.000Z>", made]);
  assert.deepEqual(dateLines(dated({ recordsUpdatedAt: "2026-11-23T10:00:00.000Z", incomplete: true }), at), ["Meds: some didn't load", made]);
  // A code made before the date was in it.
  assert.deepEqual(dateLines(dated({}), at), [made]);
  // A list too long for one code has no QR code.
  assert.deepEqual(dateLines(dated({}), at, "List made"), ["List made: <" + NOW.toISOString() + ">"]);
});

test("allergies always have their own date, unless they didn't load", async () => {
  const { allergyDateLine } = await import("../js/share.js");
  const none = { cards: [], statements: [], saidNone: null };
  const groups = (records, allergies, more = {}) => dated(Object.assign({ recordsUpdatedAt: records, allergies }, more), { allergies: none });
  const fresh = (iso) => ({ status: "loaded", savedAt: null, updatedAt: iso });
  assert.equal(allergyDateLine(groups("2026-11-23T10:00:00.000Z", fresh("2026-11-23T10:00:04.000Z")), at), "Allergies last updated: <2026-11-23T10:00:04.000Z>", "the same update");
  assert.equal(allergyDateLine(groups("2026-11-19T10:00:00.000Z", fresh("2026-11-23T10:00:00.000Z")), at), "Allergies last updated: <2026-11-23T10:00:00.000Z>");
  assert.equal(allergyDateLine(groups("2026-11-23T10:00:00.000Z", fresh("2026-11-23T10:00:00.000Z"), { incomplete: true }), at), "Allergies last updated: <2026-11-23T10:00:00.000Z>", "the records have no date");
  // A saved copy has its own date; a failed load has none.
  assert.equal(allergyDateLine(groups("2026-11-23T10:00:00.000Z", { status: "loaded", savedAt: "2026-11-19T10:00:00.000Z", updatedAt: null }), at), "Allergies last updated: <2026-11-19T10:00:00.000Z>");
  assert.equal(allergyDateLine(groups("2026-11-23T10:00:00.000Z", { status: "failed", savedAt: null, updatedAt: null }), at), null);
  assert.equal(allergyDateLine(dated({}), at), null, "a code without allergies");
});

test("the dates travel in the QR code", async () => {
  const bundle = buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [], allergies: { cards: [], statements: [], saidNone: null } }, NOW, { recordsUpdatedAt: "2026-11-19T10:00:00.000Z", allergies: { status: "loaded", savedAt: null, updatedAt: "2026-11-23T10:00:00.000Z" } });
  const packed = await packShare(bundle, BASE);
  const groups = groupShareBundle(await unpackShare("v3." + packed.digits, packed.code));
  assert.equal(groups.recordsUpdatedAt, "2026-11-19T10:00:00.000Z");
  assert.equal(groups.allergies.updatedAt, "2026-11-23T10:00:00.000Z");
});

// Staff must hear that fills are missing, or a medicine only insurance knows
// about would be left out with no word. It must not say the list is wrong
// (Tyler, 2026-11-23): what's on it still comes from the records and the patient.
test("insurance fills that didn't load are said, without calling the list wrong", async () => {
  const { fillsNote } = await import("../js/share.js");
  const text = "Insurance fills couldn't be loaded. That doesn't mean this list is wrong: what's here comes from the records and the patient. A medicine only insurance knows about may not be listed.";
  for (const claims of ["failed", "refused"]) assert.equal(fillsNote(dated({ claims })), text, claims);
  for (const claims of ["loaded", null, undefined]) assert.equal(fillsNote(dated({ claims })), null, String(claims));
  // When the records themselves didn't load, that warning says it all.
  assert.equal(fillsNote(dated({ claims: "failed", incomplete: true })), null);
});

test("the fills note travels in the QR code, and an older code has none", async () => {
  const { fillsNote } = await import("../js/share.js");
  const open = async (bundle) => { const p = await packShare(bundle, BASE); return groupShareBundle(await unpackShare("v3." + p.digits, p.code)); };
  const list = { patient: PATIENT, current: [], additions: [], stopped: [] };
  assert.ok(fillsNote(await open(buildShareBundle(list, NOW, { claims: "failed" }))));
  assert.equal(fillsNote(await open(buildShareBundle(list, NOW, {}))), null);
});

test("the app tells the code about the fills, and the page draws the note", async () => {
  const { readFileSync } = await import("node:fs");
  const file = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  assert.match(file("js/app.js"), /shareBundleFor\(list, new Date\(\), warnings, here\)/);
  assert.match(file("js/app.js"), /warnings = shareWarnings\(state\)/);
  assert.match(file("js/view.js"), /claims: state\.split\.claims,/);
  assert.match(file("js/share-list.js"), /fillsNote\(groups\)/);
});

// The staff page's box is red unless the patient said none and nothing else
// is in doubt, a saved copy that may be out of date included.
test("staff see a calm allergies box only when the patient said none and nothing is in doubt", () => {
  const of = (o) => groupShareBundle(withAllergies([], Object.assign({ saidNone: "2026-11-24" }, o))).allergies;
  assert.equal(staffSaysNone(of()), true);
  assert.equal(staffSaysNone(of({ statements: ["No known drug allergy"] })), true);
  for (const status of ["failed", "refused", "not-loaded"]) assert.equal(staffSaysNone(of({ status })), false, status);
  assert.equal(staffSaysNone(of({ unspecified: 1 })), false);
  assert.equal(staffSaysNone(of({ savedAt: "2026-11-21T18:00:00Z" })), false);
  assert.equal(staffSaysNone(of({ saidNone: null })), false);
  assert.equal(staffSaysNone(null), false);
  assert.equal(staffSaysNone(groupShareBundle(withAllergies([CARD()], { saidNone: "2026-11-24" })).allergies), false);
});

// How it looks is drawn by the page. What's in the code doesn't change.
test("no color or layout is in the QR code", () => {
  assert.doesNotMatch(JSON.stringify(withAllergies([], { saidNone: "2026-11-24" })), /color|class|style|none-known/i);
});

// Both sides of a disagreement go in the QR code (spec section 9). If these
// fail, staff can be handed one source's dose as if it were the only one.
const TAGS = "https://burroclurse.github.io/BrownBag/tags";
const SIDES = [
  { sourceId: "smart-sandbox", sourceName: "SMART sandbox", kind: "records", asOf: "2026-03-02", name: "lisinopril 10 MG Oral Tablet", dose: "10 mg", route: null, frequency: "once a day", status: "current", recordStatus: "active", key: "rx:314076" },
  { sourceId: "valley-clinic-demo", sourceName: "Valley Clinic (test records)", kind: "records", asOf: "2026-10-05", name: "lisinopril 20 MG Oral Tablet", dose: "20 mg", route: null, frequency: "once a day", status: "current", recordStatus: "active", key: "rx:314077" }
];
function grouped(more) {
  return Object.assign(recordItem("lisinopril 20 MG Oral Tablet", "314077"), {
    dose: "20 mg", route: null, source: "Valley Clinic (test records)", lastDate: "2026-10-05",
    group: { id: "29046", sources: ["SMART sandbox", "Valley Clinic (test records)"], verdicts: ["dose"], sides: SIDES, fingerprint: "fp", notes: [] }
  }, more);
}
const ANSWER = (choice, more) => Object.assign({ groupId: "29046", fingerprint: "fp", sides: SIDES, choice, answeredAt: "2026-11-25T15:00:00.000Z" }, more);
async function shared(current, data, warnings) {
  const { arrangeList, shareListFrom } = await import("../js/view.js");
  const arranged = arrangeList({ current, older: [] }, data || {});
  return JSON.parse(JSON.stringify(buildShareBundle(shareListFrom(PATIENT, arranged, []), NOW, warnings, 2)));
}
const statementsOf = (bundle) => bundle.entry.filter((e) => e.resource.resourceType === "MedicationStatement").map((e) => e.resource);
const notesOf = (resource) => (resource.note || []).map((n) => n.text);
const tagsOf = (bundle, code) => ((bundle.meta && bundle.meta.tag) || []).filter((t) => t.system === TAGS && t.code === code);

test("an unanswered disagreement is two linked statements", async () => {
  const bundle = await shared([grouped()]);
  const meds = statementsOf(bundle);
  assert.equal(meds.length, 2);
  // The shown record keeps everything it said; the other side only its own.
  assert.deepEqual(meds.map(notesOf), [["From records: SMART sandbox", "Records disagree", "Record date: 2026-03"], ["From records: Valley Clinic (test records)", "Records disagree", "Record date: 2026-10", "Prescribed by Dr. Patel"]]);
  assert.deepEqual(meds.map((m) => m.dosage[0].text), ["10 mg · once a day", "20 mg · once a day"]);
  assert.deepEqual(meds.map((m) => m.medicationCodeableConcept.text), ["lisinopril 10 MG Oral Tablet", "lisinopril 20 MG Oral Tablet"]);
  for (const m of meds) assert.equal(m.informationSource, undefined, "the record's, not the patient's");
  assert.deepEqual(tagsOf(bundle, "differs"), [{ system: TAGS, code: "differs", display: "1 2" }]);
  const groups = groupShareBundle(bundle);
  assert.equal(groups.disagree.length, 1);
  assert.equal(groups.disagree[0].sides.length, 2);
  assert.deepEqual(groups.disagree[0].sides.map((row) => row.take), [[["Dose", "10 mg"], ["How often", "once a day"]], [["Dose", "20 mg"], ["How often", "once a day"]]]);
  assert.deepEqual(groups.fromRecords, []);
});

test("an answer keeps the other side as a note", async () => {
  const bundle = await shared([grouped()], { answers: [ANSWER("valley-clinic-demo")] });
  const meds = statementsOf(bundle);
  assert.equal(meds.length, 1);
  assert.equal(meds[0].medicationCodeableConcept.text, "lisinopril 20 MG Oral Tablet");
  assert.deepEqual(notesOf(meds[0]), ["From records: Valley Clinic (test records)", "Prescribed by Dr. Patel", "Patient confirmed this, 2026-11-25", "Other record: SMART sandbox, 10 mg, once a day, 2026-03"]);
  assert.equal(meds[0].informationSource, undefined, "not filed under Added by patient");
  assert.deepEqual(tagsOf(bundle, "differs"), []);
  // The other side chosen: its own words, never the shown record's prescriber.
  const other = statementsOf(await shared([grouped()], { answers: [ANSWER("smart-sandbox")] }));
  assert.equal(other.length, 1);
  assert.equal(other[0].medicationCodeableConcept.text, "lisinopril 10 MG Oral Tablet");
  assert.deepEqual(other[0].medicationCodeableConcept.coding, [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "314076" }]);
  assert.equal(other[0].dosage[0].text, "10 mg · once a day");
  assert.deepEqual(notesOf(other[0]), ["From records: SMART sandbox", "Patient confirmed this, 2026-11-25", "Other record: Valley Clinic (test records), 20 mg, once a day, 2026-10"]);
  assert.equal(groupShareBundle(bundle).fromRecords.length, 1);
});

test("Not sure travels", async () => {
  const bundle = await shared([grouped()], { answers: [ANSWER("not-sure")] });
  const meds = statementsOf(bundle);
  assert.equal(meds.length, 2);
  for (const m of meds) assert.deepEqual(notesOf(m).slice(1, 3), ["Records disagree", "Patient isn't sure"]);
  assert.deepEqual(tagsOf(bundle, "differs").map((t) => t.display), ["1 2"]);
  assert.equal(groupShareBundle(bundle).disagree[0].sides.length, 2);
});

test("an older staff page still sees both", async () => {
  const bundle = await shared([grouped()]);
  bundle.meta.tag = bundle.meta.tag.filter((t) => t.code !== "differs");
  if (!bundle.meta.tag.length) delete bundle.meta;
  const groups = groupShareBundle(bundle);
  assert.deepEqual(groups.disagree, []);
  assert.equal(groups.fromRecords.length, 2);
  for (const row of groups.fromRecords) assert.ok(row.facts.some(([, text]) => text === "Records disagree"), JSON.stringify(row));
  assert.deepEqual(groups.fromRecords.map((row) => row.facts.filter(([label]) => label === "Source")), [[["Source", "SMART sandbox"]], [["Source", "Valley Clinic (test records)"]]]);
});

test("I don't take this anymore is stopped, with each side as another record", async () => {
  const bundle = await shared([grouped()], { answers: [ANSWER("not-taking")] });
  const meds = statementsOf(bundle);
  assert.equal(meds.length, 1);
  assert.equal(meds[0].status, "stopped");
  assert.deepEqual(meds[0].informationSource, { reference: "resource:0" });
  assert.deepEqual(meds[0].effectivePeriod, { end: "2026-11-25T15:00:00.000Z" });
  assert.deepEqual(notesOf(meds[0]), ["Other record: SMART sandbox, 10 mg, once a day, 2026-03", "Other record: Valley Clinic (test records), 20 mg, once a day, 2026-10"]);
  assert.equal(groupShareBundle(bundle).patientSaysStopped.length, 1);
});

// Spec section 8: a Not taking mark never hides a newer prescription, so
// until it's answered staff see the record and the mark side by side.
test("a mark against a newer prescription is the record and the mark, linked", async () => {
  const card = Object.assign(recordItem("lisinopril 10 MG Oral Tablet", "314076"), { lastDate: "2026-10-02" });
  const marks = { stopped: { "rx:314076": "2026-03-03" } };
  const bundle = await shared([card], marks);
  const meds = statementsOf(bundle);
  assert.deepEqual(meds.map((m) => m.status), ["active", "stopped"]);
  assert.deepEqual(notesOf(meds[0]), ["From records: SMART sandbox", "Records disagree", "Prescribed by Dr. Patel"]);
  assert.deepEqual(meds[1].informationSource, { reference: "resource:0" });
  assert.deepEqual(meds[1].effectivePeriod, { end: "2026-03-03" });
  assert.deepEqual(tagsOf(bundle, "differs").map((t) => t.display), ["1 2"]);
  const groups = groupShareBundle(bundle);
  assert.equal(groups.disagree[0].sides.length, 2);
  assert.deepEqual(groups.fromRecords, []);
  assert.deepEqual(groups.patientSaysStopped, []);
  assert.ok(groups.disagree[0].sides[1].facts.some(([label]) => label === "Not taking since"));
  // Answered "not sure": the record, and that the patient isn't sure.
  const answer = (choice) => ({ groupId: "rx:314076", fingerprint: "mark:2026-03-03>2026-10-02", sides: [], choice, answeredAt: "2026-11-25T15:00:00.000Z" });
  const unsure = await shared([card], Object.assign({ answers: [answer("not-sure")] }, marks));
  assert.deepEqual(statementsOf(unsure).map(notesOf), [["From records: SMART sandbox", "Prescribed by Dr. Patel", "Patient isn't sure"]]);
  assert.deepEqual(tagsOf(unsure, "differs"), []);
  // Answered "no": simply stopped, as today.
  const no = statementsOf(await shared([card], Object.assign({ answers: [answer("not-taking")] }, marks)));
  assert.deepEqual(no.map((m) => [m.status, m.effectivePeriod.end, m.note]), [["stopped", "2026-03-03", undefined]]);
});

test("a mark on one side of a group is the records and the mark, linked", async () => {
  const card = grouped({ group: Object.assign({}, grouped().group, { verdicts: [] }) });
  const bundle = await shared([card], { stopped: { "rx:314076": "2026-03-03" } });
  const meds = statementsOf(bundle);
  assert.deepEqual(meds.map((m) => m.status), ["active", "stopped"]);
  // The records agree with each other, so one statement names them both.
  assert.deepEqual(notesOf(meds[0]), ["From records: SMART sandbox, Valley Clinic (test records)", "Records disagree", "Prescribed by Dr. Patel"]);
  assert.deepEqual(tagsOf(bundle, "differs").map((t) => t.display), ["1 2"]);
  // Records that also disagree with each other: every side, and the mark.
  const both = await shared([grouped()], { stopped: { "rx:314076": "2026-03-03" } });
  assert.deepEqual(statementsOf(both).map((m) => [m.status, notesOf(m)[0]]), [["active", "From records: SMART sandbox"], ["active", "From records: Valley Clinic (test records)"], ["stopped", undefined]]);
  assert.deepEqual(tagsOf(both, "differs").map((t) => t.display), ["1 2 3"]);
  assert.equal(groupShareBundle(both).disagree[0].sides.length, 3);
});

test("records that agree are one statement naming every source", async () => {
  const card = grouped({ group: Object.assign({}, grouped().group, { verdicts: [] }) });
  const meds = statementsOf(await shared([card]));
  assert.equal(meds.length, 1);
  assert.equal(notesOf(meds[0])[0], "From records: SMART sandbox, Valley Clinic (test records)");
  assert.deepEqual(groupShareBundle(await shared([card])).fromRecords[0].facts.filter(([label]) => label === "Source"), [["Source", "SMART sandbox, Valley Clinic (test records)"]]);
});

test("a group's notes go on its statements", async () => {
  const notes = ["Mercy Health didn't load", "May be the same medicine as lisinopril 5 MG Oral Tablet"];
  const asked = statementsOf(await shared([grouped({ group: Object.assign({}, grouped().group, { notes }) })]));
  for (const m of asked) assert.deepEqual(notesOf(m).slice(-2), notes);
  const one = statementsOf(await shared([grouped({ group: Object.assign({}, grouped().group, { verdicts: [], notes }) })]));
  assert.deepEqual(notesOf(one[0]).slice(-2), notes);
});

test("a second source that didn't load is a tag, read back by name", async () => {
  const { shareWarnings } = await import("../js/view.js");
  const sourceStatus = [{ id: "smart-sandbox", name: "SMART sandbox", loaded: false, complete: true }, { id: "valley-clinic-demo", name: "Valley Clinic (test records)", loaded: false, complete: true }, { id: "mercy", name: "Mercy Health", loaded: true, complete: false }];
  const state = { split: { current: [], older: [], sourceStatus }, data: {}, allergies: { status: "loaded", savedAt: null, updatedAt: null } };
  const warnings = shareWarnings(state);
  assert.deepEqual(warnings.sourceStatus, sourceStatus);
  const bundle = buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [] }, NOW, warnings);
  assert.deepEqual(tagsOf(bundle, "source-not-loaded"), [{ system: TAGS, code: "source-not-loaded", display: "Valley Clinic (test records)" }]);
  assert.deepEqual(groupShareBundle(JSON.parse(JSON.stringify(bundle))).notLoaded, ["Valley Clinic (test records)"]);
  assert.deepEqual(groupShareBundle(buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [] }, NOW)).notLoaded, []);
});

// Ruling R18: Brown Bag knows its own QR lists by their tag when one comes
// back as a snapshot, so a code made the way the app makes it always has one.
test("a QR code made the way the app makes it always has a Brown Bag tag", async () => {
  const { shareWarnings } = await import("../js/view.js");
  const state = { split: { current: [], older: [] }, data: {}, allergies: { status: "loaded", savedAt: null, updatedAt: null } };
  const list = { patient: PATIENT, current: [], additions: [], stopped: [], allergies: { cards: [], statements: [], saidNone: null } };
  for (const status of ["loaded", "failed", "refused", "not-loaded"]) {
    const bundle = buildShareBundle(list, NOW, shareWarnings(Object.assign({}, state, { allergies: { status, savedAt: null, updatedAt: null } })));
    assert.deepEqual(bundle.meta.tag.filter((t) => t.system === TAGS).map((t) => t.code), ["allergies-" + status]);
  }
  const failed = buildShareBundle(list, NOW, shareWarnings(Object.assign({}, state, { dataFailed: true })));
  assert.ok(failed.meta.tag.some((t) => t.system === TAGS && t.code === "allergies-failed"));
});

test("a disagreement counts once, as on the home button", async () => {
  const { shareMedicineCount } = await import("../js/share.js");
  const { medicineCount, arrangeList } = await import("../js/view.js");
  const split = { current: [grouped(), recordItem("metformin", "861007")], older: [] };
  const groups = groupShareBundle(await shared(split.current));
  assert.equal(shareMedicineCount(groups), medicineCount(arrangeList(split, {}), []));
  assert.equal(shareMedicineCount(groups), 2);
});

test("at level 0 another record is its source and month only", async () => {
  const { arrangeList, shareListFrom } = await import("../js/view.js");
  const list = shareListFrom(PATIENT, arrangeList({ current: [grouped()], older: [] }, { answers: [ANSWER("valley-clinic-demo")] }), []);
  assert.deepEqual(notesOf(statementsOf(buildShareBundle(list, NOW, {}, 1))[0]).slice(-1), ["Other record: SMART sandbox, 10 mg, once a day, 2026-03"]);
  assert.deepEqual(notesOf(statementsOf(buildShareBundle(list, NOW, {}, 0))[0]).slice(-1), ["Other record: SMART sandbox, 2026-03"]);
});

// Two sources often give the same code, so the same key: each side is still
// its own source's words, never the shown record's (Riley's methotrexate).
test("sides with the same code keep their own words", async () => {
  const weekly = Object.assign({}, SIDES[0], { name: "lisinopril 20 MG Oral Tablet", key: "rx:314077", dose: "20 mg", frequency: "once a week" });
  const card = grouped({ group: Object.assign({}, grouped().group, { verdicts: ["schedule"], sides: [weekly, SIDES[1]] }) });
  const meds = statementsOf(await shared([card]));
  assert.deepEqual(meds.map((m) => [m.dosage[0].text, notesOf(m)]), [
    ["20 mg · once a week", ["From records: SMART sandbox", "Records disagree", "Record date: 2026-03"]],
    ["20 mg · once a day", ["From records: Valley Clinic (test records)", "Records disagree", "Record date: 2026-10", "Prescribed by Dr. Patel"]]
  ]);
  // A status side that's stopped says so in FHIR's own word, not the patient's.
  const status = grouped({ group: Object.assign({}, grouped().group, { verdicts: ["status"], sides: [Object.assign({}, weekly, { frequency: "once a day", status: "not-current", recordStatus: "stopped" }), SIDES[1]] }) });
  const both = await shared([status]);
  assert.deepEqual(statementsOf(both).map((m) => m.status), ["completed", "active"]);
  assert.deepEqual(groupShareBundle(both).disagree[0].sides.map((row) => row.status), ["completed", "active"]);
  assert.deepEqual(groupShareBundle(both).patientSaysStopped, []);
});

// Ruling on concern 3: staff see how new each side is.
test("the lisinopril pair carries both dates and reads them back", async () => {
  const bundle = await shared([grouped()]);
  assert.deepEqual(statementsOf(bundle).map((m) => notesOf(m).filter((t) => t.startsWith("Record date: "))), [["Record date: 2026-03"], ["Record date: 2026-10"]]);
  assert.deepEqual(statementsOf(bundle).map((m) => notesOf(m).slice(0, 3)), [["From records: SMART sandbox", "Records disagree", "Record date: 2026-03"], ["From records: Valley Clinic (test records)", "Records disagree", "Record date: 2026-10"]]);
  const sides = groupShareBundle(bundle).disagree[0].sides;
  assert.deepEqual(sides.map((row) => row.facts.filter(([label]) => label === "Record date")), [[["Record date", "Mar 2026"]], [["Record date", "Oct 2026"]]]);
  // Only the year when that's all there is; no date, no note.
  const odd = grouped({ group: Object.assign({}, grouped().group, { sides: [Object.assign({}, SIDES[0], { asOf: "2026" }), Object.assign({}, SIDES[1], { asOf: null })] }) });
  const oddBundle = await shared([odd]);
  assert.deepEqual(statementsOf(oddBundle).map((m) => notesOf(m).filter((t) => t.startsWith("Record date"))), [["Record date: 2026"], []]);
  assert.deepEqual(groupShareBundle(oddBundle).disagree[0].sides[0].facts.filter(([label]) => label === "Record date"), [["Record date", "2026"]]);
  // At level 0 the date stays.
  const { arrangeList, shareListFrom } = await import("../js/view.js");
  const level0 = buildShareBundle(shareListFrom(PATIENT, arrangeList({ current: [grouped()], older: [] }, {}), []), NOW, {}, 0);
  assert.equal(statementsOf(level0).filter((m) => notesOf(m).some((t) => t.startsWith("Record date: "))).length, 2);
});

// Fix round 1. A mark meeting a group whose records also disagree keeps
// every side, and the patient's Not taking is the record they marked.
test("Not sure on a mark keeps every side when the records disagree too", async () => {
  const { arrangeList } = await import("../js/view.js");
  const marks = { stopped: { "rx:314076": "2026-03-03" } };
  const fingerprint = arrangeList({ current: [grouped()], older: [] }, marks).toCheck[0].question.fingerprint;
  assert.match(fingerprint, /^mark:/);
  const answers = [ANSWER("not-sure", { fingerprint, sides: [] })];
  const bundle = await shared([grouped()], Object.assign({ answers }, marks));
  const meds = statementsOf(bundle);
  assert.deepEqual(meds.map((m) => m.dosage[0].text), ["10 mg · once a day", "20 mg · once a day"]);
  for (const m of meds) assert.deepEqual(notesOf(m).slice(1, 3), ["Records disagree", "Patient isn't sure"]);
  assert.deepEqual(tagsOf(bundle, "differs").map((t) => t.display), ["1 2"]);
  assert.equal(groupShareBundle(bundle).disagree[0].sides.length, 2);
});

test("the patient's Not taking is the record they marked", async () => {
  // The mark is on SMART sandbox's 10 mg; Valley Clinic's 20 mg is the card.
  for (const verdicts of [[], ["dose"]]) {
    const card = grouped({ group: Object.assign({}, grouped().group, { verdicts }) });
    const meds = statementsOf(await shared([card], { stopped: { "rx:314076": "2026-03-03" } }));
    const mark = meds.filter((m) => m.status === "stopped");
    assert.equal(mark.length, 1, String(verdicts));
    assert.equal(mark[0].medicationCodeableConcept.text, "lisinopril 10 MG Oral Tablet");
    assert.deepEqual(mark[0].medicationCodeableConcept.coding, [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "314076" }]);
    assert.equal(mark[0].dosage[0].text, "10 mg · once a day");
    assert.deepEqual(mark[0].effectivePeriod, { end: "2026-03-03" });
  }
  // Marked on the card's own record: its own words, as before.
  const own = statementsOf(await shared([grouped({ group: Object.assign({}, grouped().group, { verdicts: [] }) })], { stopped: { "rx:314077": "2026-03-03" } }));
  assert.equal(own.filter((m) => m.status === "stopped")[0].medicationCodeableConcept.text, "lisinopril 20 MG Oral Tablet");
});

// arrangeList renames a card by its As needed mark's key, which can be the
// other source's. The card's own record is still its own.
test("an As needed mark under the other side's key never swaps the sides' words", async () => {
  const needed = { asNeeded: { "rx:314076": "2026-11-20" } };
  for (const card of [grouped(), grouped({ sourceId: "valley-clinic-demo" })]) {
    const meds = statementsOf(await shared([card], needed));
    assert.deepEqual(meds.map((m) => [m.medicationCodeableConcept.text, m.dosage[0].text, notesOf(m)[0]]), [
      ["lisinopril 10 MG Oral Tablet", "10 mg · once a day", "From records: SMART sandbox"],
      ["lisinopril 20 MG Oral Tablet", "20 mg · once a day", "From records: Valley Clinic (test records)"]
    ], card.sourceId || "saved before sourceId");
    assert.ok(notesOf(meds[1]).includes("Prescribed by Dr. Patel"), "the card's own record keeps its details");
    assert.ok(!notesOf(meds[0]).includes("Prescribed by Dr. Patel"));
  }
});

test("a mark's record says records disagree, and a card to check is matched by itself", async () => {
  const card = Object.assign(recordItem("lisinopril 10 MG Oral Tablet", "314076"), { lastDate: "2026-10-02" });
  const meds = statementsOf(await shared([card], { stopped: { "rx:314076": "2026-03-03" } }));
  assert.deepEqual(notesOf(meds[0]), ["From records: SMART sandbox", "Records disagree", "Prescribed by Dr. Patel"]);
  // Another card with the same key, to check, still goes in.
  const other = Object.assign(recordItem("lisinopril 10 MG Oral Tablet", "314076"), { source: "Valley Clinic", question: { kind: "dose", why: null, groupId: "1", fingerprint: "fp" }, group: grouped().group });
  const bundle = buildShareBundle({ patient: PATIENT, current: [recordItem("lisinopril 10 MG Oral Tablet", "314076")], additions: [], stopped: [], toCheck: [other] }, NOW, {}, 2);
  assert.equal(statementsOf(bundle).length, 3);
});

// Tyler, 2026-11-25: on a status disagreement each side says what its
// records say, so even an older staff page can tell which is stopped.
test("a status disagreement says which side is current and which stopped", async () => {
  const sides = [Object.assign({}, SIDES[0], { status: "not-current", recordStatus: "stopped" }), SIDES[1], Object.assign({}, SIDES[1], { sourceId: "lakeside", sourceName: "Lakeside", key: "rx:9", status: "unknown" })];
  const card = grouped({ group: Object.assign({}, grouped().group, { verdicts: ["status"], sides }) });
  const bundle = await shared([card]);
  const said = (m) => notesOf(m).filter((t) => t.startsWith("Records say: "));
  assert.deepEqual(statementsOf(bundle).map(said), [["Records say: stopped"], ["Records say: current"], []]);
  assert.deepEqual(notesOf(statementsOf(bundle)[0]), ["From records: SMART sandbox", "Records disagree", "Records say: stopped", "Record date: 2026-03"]);
  assert.deepEqual(groupShareBundle(bundle).disagree[0].sides.map((row) => row.facts.filter(([label]) => label === "Records say")), [[["Records say", "stopped"]], [["Records say", "current"]], []]);
  // A dose disagreement says nothing of the kind.
  assert.deepEqual(statementsOf(await shared([grouped()])).map(said), [[], []]);
});

test("an empty From records names the parts that have the medicines", async () => {
  const { emptyPartText } = await import("../js/share.js");
  const groups = (o) => Object.assign({ fromRecords: [], fromClaims: [], addedByPatient: [], patientSaysStopped: [], asNeeded: [], disagree: [], unnamed: 0, noMedicines: [] }, o);
  const needed = [{ name: "x", added: false }];
  const disagree = [{ name: "y", sides: [{}, {}] }];
  assert.equal(emptyPartText(groups({ disagree }), "records"), "All under Records disagree: ask the patient.");
  assert.equal(emptyPartText(groups({ asNeeded: needed }), "records"), "All under As needed.");
  assert.equal(emptyPartText(groups({ disagree, asNeeded: needed }), "records"), "All under Records disagree: ask the patient, and As needed.");
  assert.equal(emptyPartText(groups({}), "records"), "No medicines from records.");
  // A source that says it has none doesn't hide where the others are.
  assert.equal(emptyPartText(groups({ disagree, noMedicines: [{ source: "Mercy Health", kind: "no-info" }] }), "records"), "All under Records disagree: ask the patient.");
});

// Task 8: what a fill suggests goes to staff only. If this fails, the
// patient could read a pharmacy's count as how much they should take.
test("staff see the hint, the patient doesn't", async () => {
  const { patientCard } = await import("../js/card.js");
  const fills = { count: 2, last: "2026-10-21", insurers: ["Aetna"], cash: false, sizedOn: "2026-10-21", suggests: { perDay: 2, quantity: 60, days: 30 } };
  const entry = Object.assign(recordItem("metformin 500 MG Oral Tablet", "861007"), { fills });
  const bundle = JSON.parse(JSON.stringify(buildShareBundle({ patient: PATIENT, current: [entry], additions: [], stopped: [] }, NOW, {}, 2)));
  const notes = notesOf(statementsOf(bundle)[0]);
  assert.deepEqual(notes.slice(-2), ["Last filled 2026-10-21 (Aetna claims), 2 fills", "Fill suggests about 2 a day (60 for 30 days)"]);
  const row = groupShareBundle(bundle).fromRecords[0];
  // Tyler, 2026-11-25: the row says where it comes from.
  assert.deepEqual(row.facts.filter(([label]) => label === "From the fill"), [["From the fill", "about 2 a day (60 for 30 days)"]]);
  assert.ok(!row.facts.some(([label]) => label === "Note"), "read as a fact, not a loose note");
  const mine = patientCard(entry, true);
  assert.ok(!JSON.stringify(mine).toLowerCase().includes("suggest"), JSON.stringify(mine));
  // No hint, no note.
  const plain = Object.assign({}, entry, { fills: Object.assign({}, fills, { suggests: null }) });
  assert.ok(!notesOf(statementsOf(buildShareBundle({ patient: PATIENT, current: [plain], additions: [], stopped: [] }, NOW, {}, 2))[0]).some((t) => t.startsWith("Fill suggests")));
});

test("a source that didn't load is said under Medicines", async () => {
  const { medicineNotices } = await import("../js/share.js");
  const base = { fromRecords: [], disagree: [], noMedicines: [], unnamed: 0 };
  assert.deepEqual(medicineNotices(Object.assign({ notLoaded: ["Valley Clinic (test records)", "Mercy Health"] }, base)), ["Valley Clinic (test records) didn't load.", "Mercy Health didn't load."]);
  assert.deepEqual(medicineNotices(Object.assign({ notLoaded: [] }, base)), []);
  // A code from before the tag.
  assert.deepEqual(medicineNotices(base), []);
});

// The staff part (Task 8): each disagreement's sides together, under their
// source and date, the patient's answer first.
test("each disagreement's sides go together, labelled by source and date", async () => {
  const { disagreeParts } = await import("../js/share.js");
  const parts = disagreeParts(groupShareBundle(await shared([grouped()])));
  assert.equal(parts.length, 1);
  assert.equal(parts[0].answer, null);
  assert.deepEqual(parts[0].sides.map((side) => side.label), ["SMART sandbox, Mar 2026", "Valley Clinic (test records), Oct 2026"]);
  assert.deepEqual(parts[0].sides.map((side) => side.row.name), ["lisinopril 10 MG Oral Tablet", "lisinopril 20 MG Oral Tablet"]);
  // The label and the part's title say these; the side doesn't again.
  for (const side of parts[0].sides) {
    assert.ok(!side.row.facts.some(([label, text]) => label === "Source" || label === "Record date" || text === "Records disagree"), JSON.stringify(side.row.facts));
  }
  assert.deepEqual(parts[0].sides[1].row.facts, [["Prescribed by", "Dr. Patel"]]);
  const unsure = disagreeParts(groupShareBundle(await shared([grouped()], { answers: [ANSWER("not-sure")] })));
  assert.equal(unsure[0].answer, "Patient isn't sure");
  for (const side of unsure[0].sides) assert.ok(!side.row.facts.some(([, text]) => text === "Patient isn't sure"));
  // A status disagreement keeps what each side's records say.
  const sides = [Object.assign({}, SIDES[0], { status: "not-current", recordStatus: "stopped" }), SIDES[1]];
  const status = disagreeParts(groupShareBundle(await shared([grouped({ group: Object.assign({}, grouped().group, { verdicts: ["status"], sides }) })])));
  assert.deepEqual(status[0].sides.map((side) => side.row.facts.filter(([label]) => label === "Records say")), [[["Records say", "stopped"]], [["Records say", "current"]]]);
});

test("a confirmed side comes first, and the patient's own mark is labelled as theirs", async () => {
  const { disagreeParts } = await import("../js/share.js");
  const row = (name, facts, status) => ({ name, take: [], flags: [], facts, status });
  const parts = disagreeParts({ disagree: [{ name: "a", sides: [
    row("a 10", [["Note", "Records disagree"], ["Source", "SMART sandbox"]], "active"),
    row("a 20", [["Note", "Records disagree"], ["Note", "Patient confirmed this, 2026-11-25"], ["Source", "Valley Clinic"], ["Record date", "Oct 2026"]], "active"),
    row("a 10", [["Not taking since", "Mar 3, 2026"]], "stopped")
  ] }] });
  assert.equal(parts[0].answer, "Patient confirmed this, 2026-11-25");
  assert.deepEqual(parts[0].sides.map((side) => side.label), ["Valley Clinic, Oct 2026", "SMART sandbox", "Patient says not taking"]);
  assert.deepEqual(parts[0].sides[2].row.facts, [["Not taking since", "Mar 3, 2026"]]);
  assert.deepEqual(disagreeParts({}), []);
});
