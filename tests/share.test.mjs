import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShareBundle,
  groupShareBundle,
  packShare,
  unpackShare,
  fitsInQr,
  QR_MAX_BYTES,
  ShareError
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
  assert.ok(packed.url.startsWith(BASE + "share.html#v1."));
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

test("fitsInQr is false for a 60 medicine list and true for 5", async () => {
  var big = buildShareBundle({ patient: PATIENT, current: names(60).map((name, i) => recordItem(name, String(1000 + i))), additions: [], stopped: [] }, NOW);
  var small = buildShareBundle({ patient: PATIENT, current: names(5).map((name, i) => recordItem(name, String(1000 + i))), additions: [], stopped: [] }, NOW);
  assert.equal(QR_MAX_BYTES, 2331);
  assert.equal(fitsInQr((await packShare(big, BASE)).url), false);
  assert.equal(fitsInQr((await packShare(small, BASE)).url), true);
});
