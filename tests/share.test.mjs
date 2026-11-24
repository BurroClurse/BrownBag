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
  assert.deepEqual(allergyNotices(g), ["Records also have an allergy entry that doesn't say what it's to. Ask the patient."]);
  const alone = groupShareBundle(withAllergies([], { unspecified: 2 })).allergies;
  assert.equal(allergyEmptyText(alone), null);
  assert.deepEqual(allergyNotices(alone), ["Records have 2 allergy entries that don't say what they're to. Ask the patient."]);
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
