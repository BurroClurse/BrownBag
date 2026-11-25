// The sandbox test patients whose records disagree (tools/reconcile-patients.mjs).
// If these fail, signing in as Riley or Jordan wouldn't show the cases they're
// for, or the script could write to someone else's records on the sandbox.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PATIENTS, definitions, writeClinics } from "../tools/reconcile-patients.mjs";
import { demoSource } from "../js/demo-source.js";
import { reconcile } from "../js/reconcile.js";
import { fillsFromClaims, mergeClaims } from "../js/claims.js";
import { fromMedicationRequest, fromMedicationStatement, usableRecord, isPlaceholderDrug, dedupe, groupByIngredient, splitByStatus } from "../js/meds.js";
import { arrangeList, sourceNotices, firstHeldBack } from "../js/view.js";

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const clinicFile = (id) => read("./fixtures/reconcile/clinics/" + id + ".json");
const CLINIC = "Valley Clinic (test records)";

// What RxNav gives for each code (checked 2026-11-25), so no test needs it.
const MAP = new Map([
  ["314076", "29046"], ["314077", "29046"], ["197886", "5487+29046"], ["105585", "6851"],
  ["617310", "83367"], ["208161", "36437"], ["312941", "36437"], ["861007", "6809"],
  ["860975", "6809"], ["1740467", "26225"], ["197361", "17767"], ["966222", "10582"], ["312961", "36567"]
].map(([code, ingredient]) => [code, { rxcui: ingredient, name: "x" }]));

// The day a clinic file was written, so the sandbox side is built for that
// same day and the two never drift apart.
const writtenOn = (file) => new Date(file.patient.meta.lastUpdated);

// The way loadFresh in app.js builds the sandbox's source and its claims.
function sandbox(resources) {
  const patient = resources.find((r) => r.resourceType === "Patient");
  const items = [];
  [["MedicationRequest", fromMedicationRequest], ["MedicationStatement", fromMedicationStatement]].forEach(([type, convert]) => {
    resources.filter((r) => r.resourceType === type && usableRecord(r)).forEach((r) => {
      const item = convert(r, "SMART sandbox");
      if (!isPlaceholderDrug(item)) items.push(item);
    });
  });
  const split = Object.assign(splitByStatus(groupByIngredient(dedupe(items), MAP)), { failed: false, heldBack: false, placeholders: 0, ingredientOf: MAP });
  return { id: "smart-sandbox", name: "SMART sandbox", kind: "records", refreshes: true, patient, split };
}

function signedIn(id) {
  const file = clinicFile(id);
  const day = writtenOn(file);
  const own = definitions(day).find((patient) => patient.id === id).sandbox;
  const records = sandbox(own);
  const joined = reconcile([records, demoSource(file, records.patient, "")], MAP);
  const claims = fillsFromClaims(own.filter((r) => r.resourceType === "ExplanationOfBenefit"));
  const split = claims.length ? mergeClaims(joined, { status: "loaded", fills: claims, ingredientOf: MAP }, day) : joined;
  return { split, day };
}

const cards = (split) => split.current.concat(split.older);
const only = (split, pattern) => {
  const found = cards(split).filter((card) => pattern.test(card.name));
  assert.equal(found.length, 1, String(pattern));
  return found[0];
};
const daysBefore = (day, days) => new Date(day.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

test("the script's patients are Riley and Jordan", () => {
  assert.deepEqual(PATIENTS.map((p) => [p.id, p.name, p.birthDate]), [
    ["brownbag-recon-riley", "Riley Reconcile", "1948-06-02"],
    ["brownbag-recon-jordan", "Jordan Partial", "1955-11-20"]
  ]);
  for (const patient of definitions(new Date("2026-11-25T00:00:00Z"))) {
    const person = patient.sandbox.find((r) => r.resourceType === "Patient");
    assert.equal(person.id, patient.id);
    assert.equal(person.birthDate, patient.birthDate);
    assert.equal(patient.clinic.patient.birthDate, patient.birthDate);
  }
});

test("the script writes only ids it owns, once each, about its own patients", () => {
  const all = definitions(new Date("2026-11-25T00:00:00Z"));
  const ids = all.flatMap((patient) => patient.sandbox.map((r) => r.resourceType + "/" + r.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const patient of all) {
    for (const resource of patient.sandbox) {
      assert.match(resource.id, /^brownbag-recon-[a-z0-9-]+$/, resource.id);
      if (resource.resourceType === "Patient") continue;
      const who = resource.subject || resource.patient;
      assert.equal(who.reference, "Patient/" + patient.id, resource.id);
    }
    for (const resource of patient.clinic.requests.concat(patient.clinic.statements)) {
      assert.match(resource.id, /^brownbag-recon-/, resource.id);
    }
  }
});

test("the committed clinic files are what the script writes", () => {
  for (const patient of PATIENTS) {
    const file = clinicFile(patient.id);
    const day = writtenOn(file);
    assert.equal(file.patient.meta.lastUpdated, day.toISOString().slice(0, 10) + "T00:00:00Z", "a whole day");
    assert.deepEqual(file, definitions(day).find((p) => p.id === patient.id).clinic);
  }
});

test("a dry run writes each clinic file and nothing else", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "brownbag-clinics-"));
  try {
    const day = new Date("2027-03-04T15:30:00Z");
    writeClinics(dir, day);
    assert.deepEqual(readdirSync(dir).sort(), ["brownbag-recon-jordan.json", "brownbag-recon-riley.json"]);
    const riley = JSON.parse(readFileSync(path.join(dir, "brownbag-recon-riley.json"), "utf8"));
    assert.equal(riley.patient.meta.lastUpdated, "2027-03-04T00:00:00Z");
    assert.deepEqual(riley, definitions(day).find((p) => p.id === "brownbag-recon-riley").clinic);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Riley's clinic file disagrees in every way the design names", () => {
  const { split, day } = signedIn("brownbag-recon-riley");

  const lisinopril = only(split, /^lisinopril/);
  assert.deepEqual(lisinopril.group.verdicts, ["dose"]);
  assert.deepEqual(lisinopril.group.sources, ["SMART sandbox", CLINIC]);
  assert.deepEqual(lisinopril.group.notes, ["Possible duplicate of hydrochlorothiazide 12.5 MG / lisinopril 20 MG Oral Tablet"]);

  const methotrexate = only(split, /^methotrexate/);
  assert.deepEqual(methotrexate.group.verdicts, ["schedule"]);
  assert.deepEqual(methotrexate.group.sides.map((side) => side.frequency), ["once a week", "once a day"]);

  const atorvastatin = only(split, /^atorvastatin/);
  assert.deepEqual(atorvastatin.group.verdicts, ["status"]);
  assert.equal(atorvastatin.status, "current");
  assert.deepEqual(atorvastatin.group.sides.map((side) => [side.sourceName, side.status]), [["SMART sandbox", "current"], [CLINIC, "not-current"]]);

  // Brand and generic, same strength and directions: one card, nothing to ask.
  const sertraline = only(split, /sertraline/i);
  assert.deepEqual(sertraline.group.verdicts, []);
  assert.deepEqual(sertraline.group.sources, ["SMART sandbox", CLINIC]);
  assert.deepEqual(sertraline.group.sides.map((side) => side.name), ["Sertraline 50 MG Oral Tablet [Zoloft]", "sertraline 50 MG Oral Tablet"]);

  // Regular and extended release stay two cards, each naming the other.
  const regular = only(split, /^metformin/);
  const extended = only(split, /^24 HR metformin/);
  assert.deepEqual(regular.group.notes, ["Possible duplicate of 24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet"]);
  assert.deepEqual(extended.group.notes, ["Possible duplicate of metformin hydrochloride 500 MG Oral Tablet"]);
  assert.equal(split.current.includes(regular) && split.current.includes(extended), true);

  const combo = only(split, /^hydrochlorothiazide/);
  assert.deepEqual(combo.group.sources, [CLINIC]);
  assert.deepEqual(combo.group.notes, ["Possible duplicate of lisinopril 10 MG Oral Tablet"]);

  const iv = only(split, /ondansetron/);
  assert.equal(iv.hospital, true);
  assert.equal(iv.recordStatus, "active");
  assert.equal(split.older.includes(iv), true);
  assert.equal(iv.group, undefined);

  // Stopped in the record, filled since: back on the list, with the line.
  const levothyroxine = only(split, /^levothyroxine/);
  assert.equal(split.current.includes(levothyroxine), true);
  assert.equal(levothyroxine.recordStatus, "stopped");
  assert.equal(levothyroxine.completedButFilled, daysBefore(day, 25));

  const amlodipine = only(split, /^amlodipine/);
  assert.equal(amlodipine.source, CLINIC);
  assert.equal(amlodipine.group, undefined);

  // The fill backs the clinic's newer strength.
  assert.equal(lisinopril.fills.last, daysBefore(day, 20));

  const asked = arrangeList(split, {}).toCheck.map((entry) => [entry.name.split(" ")[0], entry.question.kind]);
  assert.deepEqual(asked.sort(), [["atorvastatin", "status"], ["lisinopril", "dose"], ["methotrexate", "schedule"]]);
});

test("Jordan's clinic file held some back", () => {
  const { split } = signedIn("brownbag-recon-jordan");
  assert.deepEqual(split.sourceStatus[1], { id: "valley-clinic-demo", name: CLINIC, loaded: true, complete: false });
  assert.equal(split.heldBack, true);
  const grouped = cards(split).filter((card) => card.group);
  assert.equal(grouped.length, 3);
  for (const card of grouped) {
    assert.ok(card.group.notes.includes(CLINIC + " didn't send some records"), card.name);
  }

  // The second source that held back is named; the first source's line isn't needed.
  assert.deepEqual(sourceNotices(split), [CLINIC + " didn't send some of your medicines."]);
  assert.equal(firstHeldBack(split), false);

  // A stop dated by year only can't be put before the prescription: it asks.
  const simvastatin = only(split, /^simvastatin/);
  assert.deepEqual(simvastatin.group.verdicts, ["status"]);
  const stop = simvastatin.group.sides.find((side) => side.sourceName === CLINIC);
  assert.match(stop.asOf, /^\d{4}$/);
  // It dates by when it stopped (2026), so it sorts after the sandbox's Dec 2025 side.
  assert.equal(stop.asOf, "2026");
  assert.deepEqual(simvastatin.group.sides.map((side) => side.sourceName), ["SMART sandbox", CLINIC]);

  // An undated stop can't be put in order either.
  const metformin = only(split, /^metformin/);
  assert.deepEqual(metformin.group.verdicts, ["status"]);
  assert.equal(metformin.group.sides.find((side) => side.sourceName === CLINIC).asOf, null);

  // Agreeing, but the source that held back can't vouch for it.
  const amlodipine = only(split, /^amlodipine/);
  assert.deepEqual(amlodipine.group.verdicts, []);
});

// Riley's atorvastatin and methotrexate have the same code in both sources:
// the card says which source is its own record.
test("a joined card knows its own source, even when the code is the same", async () => {
  const { isOwnSide } = await import("../js/reconcile.js");
  const { split } = signedIn("brownbag-recon-riley");
  for (const pattern of [/^atorvastatin/, /^methotrexate/]) {
    const card = only(split, pattern);
    assert.equal(new Set(card.group.sides.map((side) => side.key)).size, 1, "the same key");
    assert.equal(card.group.sides.filter((side) => isOwnSide(card, side)).length, 1, String(pattern));
    assert.ok(card.group.sides.some((side) => side.sourceId === card.sourceId));
  }
});

// Task 8: one of Riley's fills says how much and for how many days, so the
// staff page's fill hint can be seen. The other fills say nothing of it.
test("Riley's metformin fill suggests 2 a day, staff only", async () => {
  const { suggestNote } = await import("../js/claims.js");
  const { split } = signedIn("brownbag-recon-riley");
  const metformin = only(split, /^metformin hydrochloride 500 MG Oral/);
  assert.deepEqual(metformin.fills.suggests, { perDay: 2, quantity: 60, days: 30 });
  assert.equal(suggestNote(metformin.fills), "Fill suggests about 2 a day (60 for 30 days)");
  assert.equal(cards(split).filter((card) => card.fills && card.fills.suggests).length, 1);
  const claim = definitions(writtenOn(clinicFile("brownbag-recon-riley"))).find((p) => p.id === "brownbag-recon-riley").sandbox.find((r) => r.id === "brownbag-recon-riley-fill-5");
  assert.equal(claim.supportingInfo[0].category.coding[0].system, "http://hl7.org/fhir/us/carin-bb/CodeSystem/C4BBSupportingInfoType");
});
