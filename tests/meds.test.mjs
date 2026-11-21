import test from "node:test";
import assert from "node:assert/strict";
import {
  fromMedicationRequest,
  fromMedicationStatement,
  formatDosage,
  dedupe,
  splitByStatus,
  groupByIngredient,
  doseChangeText
} from "../js/meds.js";

const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const SOURCE = "SMART sandbox";

function request(code, display, authoredOn, status = "active", extra = {}) {
  return {
    resourceType: "MedicationRequest",
    status: status,
    authoredOn: authoredOn,
    medicationCodeableConcept: code
      ? { coding: [{ system: RXNORM, code: code, display: display }], text: display }
      : (display ? { text: display } : undefined),
    ...extra
  };
}

test("fromMedicationRequest reads name, rxcui, prescriber and dates", () => {
  const item = fromMedicationRequest(
    request("314076", "lisinopril 10 MG Oral Tablet", "2023-03-02", "active", {
      requester: { display: "Dr. Patel" }
    }),
    SOURCE
  );
  assert.equal(item.key, "rx:314076");
  assert.equal(item.rxcui, "314076");
  assert.equal(item.name, "lisinopril 10 MG Oral Tablet");
  assert.equal(item.prescriber, "Dr. Patel");
  assert.equal(item.start, "2023-03-02");
  assert.equal(item.lastDate, "2023-03-02");
  assert.equal(item.status, "current");
  assert.equal(item.source, SOURCE);
  assert.equal(item.origin, "records");
  assert.equal(item.count, 1);
});

test("stopped and completed requests are older", () => {
  assert.equal(fromMedicationRequest(request("1", "a", "2020-01-01", "stopped"), SOURCE).status, "older");
  assert.equal(fromMedicationRequest(request("1", "a", "2020-01-01", "completed"), SOURCE).status, "older");
  assert.equal(fromMedicationRequest(request("1", "a", "2020-01-01", "on-hold"), SOURCE).status, "current");
});

test("medicationReference resolves through the map", () => {
  const medications = new Map([
    ["Medication/m1", {
      resourceType: "Medication",
      id: "m1",
      code: { coding: [{ system: RXNORM, code: "197361", display: "amlodipine 5 MG Oral Tablet" }] }
    }]
  ]);
  const item = fromMedicationRequest(
    { resourceType: "MedicationRequest", status: "active", authoredOn: "2024-01-01", medicationReference: { reference: "Medication/m1" } },
    SOURCE,
    medications
  );
  assert.equal(item.name, "amlodipine 5 MG Oral Tablet");
  assert.equal(item.rxcui, "197361");
});

test("fromMedicationStatement reads status and effective dates", () => {
  const item = fromMedicationStatement({
    resourceType: "MedicationStatement",
    status: "active",
    effectivePeriod: { start: "2022-05-01", end: "2026-05-01" },
    medicationCodeableConcept: { coding: [{ system: RXNORM, code: "314076", display: "lisinopril 10 MG Oral Tablet" }] }
  }, SOURCE);
  assert.equal(item.status, "current");
  assert.equal(item.start, "2022-05-01");
  assert.equal(item.end, "2026-05-01");
  assert.equal(item.lastDate, "2022-05-01");
});

test("formatDosage uses text first", () => {
  assert.equal(formatDosage([{ text: "Take 1 tablet daily" }]).frequency, "Take 1 tablet daily");
});

test("formatDosage builds frequency from timing", () => {
  assert.equal(formatDosage([{ timing: { repeat: { frequency: 1, period: 1, periodUnit: "d" } } }]).frequency, "once a day");
  assert.equal(formatDosage([{ timing: { repeat: { frequency: 2, period: 1, periodUnit: "d" } } }]).frequency, "2 times a day");
  assert.equal(formatDosage([{ timing: { repeat: { frequency: 1, period: 3, periodUnit: "d" } } }]).frequency, "once every 3 days");
  assert.equal(formatDosage([{ timing: { repeat: { frequency: 1, period: 1, periodUnit: "h" } } }]).frequency, "once an hour");
  assert.equal(formatDosage([{ asNeededBoolean: true }]).frequency, "as needed");
  assert.equal(
    formatDosage([{ asNeededBoolean: true, timing: { repeat: { frequency: 1, period: 1, periodUnit: "d" } } }]).frequency,
    "once a day, as needed"
  );
  assert.equal(formatDosage([{ route: { coding: [{ display: "Oral" }] } }]).route, "Oral");
  assert.equal(
    formatDosage([{ doseAndRate: [{ doseQuantity: { value: 1, unit: "tablet" } }] }]).dose,
    "1 tablet"
  );
  assert.deepEqual(formatDosage(undefined), { dose: null, route: null, frequency: null });
});

test("dedupe keeps the newest and counts", () => {
  const items = [
    fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2019-01-01", "stopped"), SOURCE),
    fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2023-06-01", "stopped"), SOURCE),
    fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2021-01-01", "active"), SOURCE)
  ];
  const result = dedupe(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].lastDate, "2023-06-01");
  assert.equal(result[0].count, 3);
  assert.equal(result[0].status, "current");
});

test("dedupe merges requests and statements with the same rxcui", () => {
  const result = dedupe([
    fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2023-01-01"), SOURCE),
    fromMedicationStatement({
      resourceType: "MedicationStatement",
      status: "active",
      effectiveDateTime: "2024-01-01",
      medicationCodeableConcept: { coding: [{ system: RXNORM, code: "314076", display: "lisinopril 10 MG Oral Tablet" }] }
    }, SOURCE)
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].count, 2);
});

test("records without a code dedupe by name, case and spaces ignored", () => {
  const result = dedupe([
    fromMedicationRequest(request(null, " Fish Oil ", "2023-01-01"), SOURCE),
    fromMedicationRequest(request(null, "fish oil", "2024-01-01"), SOURCE)
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, "text:fish oil");
});

test("a record with no code and no name is kept as Unnamed medicine", () => {
  const result = dedupe([
    fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", authoredOn: "2024-01-01" }, SOURCE)
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Unnamed medicine");
});

test("splitByStatus on an empty list gives two empty lists", () => {
  assert.deepEqual(splitByStatus([]), { current: [], older: [] });
});

test("splitByStatus sorts each group by name", () => {
  const items = dedupe([
    fromMedicationRequest(request("2", "zolpidem 5 MG Oral Tablet", "2024-01-01"), SOURCE),
    fromMedicationRequest(request("1", "amlodipine 5 MG Oral Tablet", "2024-01-01"), SOURCE),
    fromMedicationRequest(request("3", "naproxen 220 MG Oral Tablet", "2019-01-01", "stopped"), SOURCE)
  ]);
  const { current, older } = splitByStatus(items);
  assert.deepEqual(current.map((i) => i.rxcui), ["1", "2"]);
  assert.deepEqual(older.map((i) => i.rxcui), ["3"]);
});

test("groupByIngredient merges two strengths of lisinopril", () => {
  const items = dedupe([
    fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2022-02-01", "stopped"), SOURCE),
    fromMedicationRequest(request("314077", "lisinopril 20 MG Oral Tablet", "2024-05-01"), SOURCE)
  ]);
  const ingredientOf = new Map([
    ["314076", { rxcui: "29046", name: "lisinopril" }],
    ["314077", { rxcui: "29046", name: "lisinopril" }]
  ]);
  const result = groupByIngredient(items, ingredientOf);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "lisinopril 20 MG Oral Tablet");
  assert.equal(result[0].status, "current");
  assert.equal(result[0].count, 2);
  assert.deepEqual(result[0].doseHistory.map((d) => d.date), ["2022-02-01", "2024-05-01"]);
  assert.equal(doseChangeText(result[0]), "dose changed from 10 MG to 20 MG on 2024-05-01");
});

test("groupByIngredient with an empty map changes nothing", () => {
  const items = dedupe([
    fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2022-02-01"), SOURCE),
    fromMedicationRequest(request("314077", "lisinopril 20 MG Oral Tablet", "2024-05-01"), SOURCE)
  ]);
  const result = groupByIngredient(items, new Map());
  assert.equal(result.length, 2);
  assert.equal(doseChangeText(result[0]), null);
});

// Real SMART sandbox records, saved 2026-11-20. Synthetic patients:
// 2a89ee40 has many prescriptions, 4970751 has a few that point to separate
// Medication records, e5408569 has only "what the patient says" records,
// and 2807decf has no medicines at all.
import { readFileSync } from "node:fs";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const FIXTURE_PATIENTS = [
  "2a89ee40-606f-4df2-9e77-80aeb1304f4f",
  "4970751",
  "e5408569-9931-5afe-b62d-4175e6b44784",
  "2807decf-744b-4abe-94ce-08c33ea905df"
];

function loadBundle(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
}

function itemsForPatient(id) {
  const resources = ["requests", "statements"]
    .flatMap((kind) => (loadBundle(id + "-" + kind + ".json").entry || []).map((entry) => entry.resource));
  const medications = new Map(
    resources.filter((r) => r.resourceType === "Medication").map((r) => ["Medication/" + r.id, r])
  );
  return resources.flatMap((r) => {
    if (r.resourceType === "MedicationRequest") return [fromMedicationRequest(r, SOURCE, medications)];
    if (r.resourceType === "MedicationStatement") return [fromMedicationStatement(r, SOURCE, medications)];
    return [];
  });
}

for (const id of FIXTURE_PATIENTS) {
  test("sandbox patient " + id.slice(0, 8) + ": no medicine is dropped", () => {
    const items = itemsForPatient(id);
    const keys = new Set(items.map((item) => item.key));
    const merged = dedupe(items);
    assert.equal(merged.length, keys.size);
    assert.deepEqual(new Set(merged.map((item) => item.key)), keys);
    assert.equal(merged.reduce((sum, item) => sum + item.count, 0), items.length);
  });
}

test("sandbox patient 4970751: prescriptions that point to a Medication get its name", () => {
  const items = itemsForPatient("4970751");
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.name !== "Unnamed medicine"));
});

test("sandbox patient 2807decf has no medicines", () => {
  assert.equal(itemsForPatient("2807decf-744b-4abe-94ce-08c33ea905df").length, 0);
});

test("a statement with status unknown and no end date counts as current", () => {
  const items = itemsForPatient("e5408569-9931-5afe-b62d-4175e6b44784");
  assert.equal(items.length, 12);
  assert.ok(items.every((item) => item.status === "current"));
});

test("a statement with status unknown and an end date in the past is older", () => {
  const item = fromMedicationStatement(
    { resourceType: "MedicationStatement", status: "unknown", medicationCodeableConcept: { text: "Colace" }, effectivePeriod: { end: "2020-01-01" } },
    SOURCE
  );
  assert.equal(item.status, "older");
});

test("doseChangeText shows the date only, not the time", () => {
  const item = { doseHistory: [
    { name: "aspirin 325 MG Oral Tablet", date: "2022-12-03T20:36:37+00:00" },
    { name: "aspirin 81 MG Oral Tablet", date: "2023-09-29T22:39:37+00:00" }
  ] };
  assert.equal(doseChangeText(item), "dose changed from 325 MG to 81 MG on 2023-09-29");
});

test("doseChangeText says nothing when only the form changed, not the amount", () => {
  const item = { doseHistory: [
    { name: "Nitroglycerin 0.4 MG Sublingual Tablet", date: "2022-12-03" },
    { name: "Nitroglycerin 0.4 MG/ACTUAT Mucosal Spray", date: "2023-11-21" }
  ] };
  assert.equal(doseChangeText(item), null);
});

test("a combination pill is not merged into one of its ingredients", () => {
  const items = dedupe([
    fromMedicationRequest(request("313782", "acetaminophen 325 MG Oral Tablet", "2023-01-01"), SOURCE),
    fromMedicationRequest(request("1049221", "acetaminophen 325 MG / oxycodone 5 MG Oral Tablet", "2023-02-01"), SOURCE)
  ]);
  const ingredientOf = new Map([
    ["313782", { rxcui: "161", name: "acetaminophen" }],
    ["1049221", { rxcui: "161+7804", name: "acetaminophen / oxycodone" }]
  ]);
  assert.equal(groupByIngredient(items, ingredientOf).length, 2);
});

test("two current prescriptions of the same ingredient stay as two lines", () => {
  const items = dedupe([
    fromMedicationRequest(request("866514", "metoprolol tartrate 25 MG Oral Tablet", "2022-12-03"), SOURCE),
    fromMedicationRequest(request("866412", "24 HR metoprolol succinate 100 MG Extended Release Oral Tablet", "2023-11-21"), SOURCE)
  ]);
  const ingredientOf = new Map([
    ["866514", { rxcui: "6918", name: "metoprolol" }],
    ["866412", { rxcui: "6918", name: "metoprolol" }]
  ]);
  const result = groupByIngredient(items, ingredientOf);
  assert.equal(result.length, 2);
  assert.ok(result.every((item) => !item.doseHistory));
});

test("a merged group shows the current prescription, not a newer stopped one", () => {
  const items = dedupe([
    fromMedicationRequest(request("314077", "lisinopril 20 MG Oral Tablet", "2023-01-01"), SOURCE),
    fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2024-05-01", "stopped"), SOURCE)
  ]);
  const ingredientOf = new Map([
    ["314076", { rxcui: "29046", name: "lisinopril" }],
    ["314077", { rxcui: "29046", name: "lisinopril" }]
  ]);
  const result = groupByIngredient(items, ingredientOf);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "lisinopril 20 MG Oral Tablet");
  assert.equal(result[0].status, "current");
});

test("two records with no name and no code stay as two lines", () => {
  const items = [
    fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", authoredOn: "2023-01-01", medicationReference: { reference: "Medication/a" } }, SOURCE),
    fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", authoredOn: "2023-02-01", medicationReference: { reference: "Medication/b" } }, SOURCE)
  ];
  const merged = dedupe(items);
  assert.equal(merged.length, 2);
  assert.ok(merged.every((item) => item.name === "Unnamed medicine"));
});

test("a reference's display name is used when the Medication isn't sent", () => {
  const item = fromMedicationRequest(
    { resourceType: "MedicationRequest", status: "active", medicationReference: { reference: "Medication/x", display: "Warfarin 5 MG Oral Tablet" } },
    SOURCE
  );
  assert.equal(item.name, "Warfarin 5 MG Oral Tablet");
});
