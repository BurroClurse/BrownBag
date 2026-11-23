import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShareBundle,
  groupShareBundle,
  packShare,
  unpackShare,
  fitsInQr,
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
  assert.equal(packed.prefix, BASE + "share.html#v2.");
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
  assert.match(groups.fromRecords[0].detail, /once a day/);
  assert.match(groups.patientSaysStopped[0].detail, /2026-10-01/);
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
  await assert.rejects(unpackShare("v2." + packed.digits.slice(1), packed.code), (error) => error instanceof ShareError && error.code === "bad-link");
});

test("a digit pair above 77 throws bad-link", async () => {
  var packed = await packShare(oneOfEach(), BASE);
  await assert.rejects(unpackShare("v2.99" + packed.digits.slice(2), packed.code), (error) => error instanceof ShareError && error.code === "bad-link");
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
      { name: "metformin hydrochloride 500 MG Oral Tablet", rxcui: "861007", source: "SMART sandbox", completedButFilled: "2026-09-22", fills: fills(1, "2026-09-22") },
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
  assert.equal(statements[3].informationSource.display, "Aetna claims");
  assert.equal(notes(statements[3])[0], "Filled, not in the health record");
  assert.ok(!notes(statements[3]).some((t) => t.startsWith("From records")));
  const groups = groupShareBundle(bundle);
  assert.deepEqual(groups.fromClaims.map((r) => r.name), ["sertraline 50 MG Oral Tablet"]);
  assert.equal(groups.fromRecords.length, 3);
  assert.ok(groups.fromRecords[0].detail.includes("Last filled 2025-07-23 (Aetna claims), 3 fills"));
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
  assert.deepEqual(groups.patientSaysAsNeeded.map((r) => r.name), ["oxycodone 5 MG Oral Tablet"]);
  assert.ok(!groups.patientSaysAsNeeded[0].detail.includes(AS_NEEDED_NOTE));
  assert.ok(groups.patientSaysAsNeeded[0].detail.includes("From records"));
});
