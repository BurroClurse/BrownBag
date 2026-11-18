import test from "node:test";
import assert from "node:assert/strict";
import {
  fromMedicationRequest,
  fromMedicationStatement,
  formatDosage,
  dedupe,
  splitByStatus,
  groupByIngredient,
  doseChangeText,
  applyNdcMap
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

const NDC = "http://hl7.org/fhir/sid/ndc";

function ndcRequest(ndc, display, authoredOn, system = NDC) {
  return {
    resourceType: "MedicationRequest",
    status: "active",
    authoredOn: authoredOn,
    medicationCodeableConcept: { coding: [{ system: system, code: ndc, display: display }], text: display }
  };
}

test("an NDC-only record keeps its NDC and is keyed by name", () => {
  const item = fromMedicationRequest(ndcRequest("0071-0156-23", "Lipitor 20mg tab", "2022-01-05"), SOURCE);
  assert.equal(item.ndc, "0071-0156-23");
  assert.equal(item.rxcui, null);
  assert.equal(item.key, "text:lipitor 20mg tab");
});

test("the NDC OID system is read too", () => {
  const item = fromMedicationRequest(ndcRequest("0071-0156-23", "Lipitor", "2022-01-05", "urn:oid:2.16.840.1.113883.6.69"), SOURCE);
  assert.equal(item.ndc, "0071-0156-23");
});

test("a record with RxNorm and NDC keeps both", () => {
  const resource = request("617318", "atorvastatin 20 MG Oral Tablet [Lipitor]", "2023-01-05");
  resource.medicationCodeableConcept.coding.push({ system: NDC, code: "0071-0156-23" });
  const item = fromMedicationRequest(resource, SOURCE);
  assert.equal(item.rxcui, "617318");
  assert.equal(item.ndc, "0071-0156-23");
});

test("records without an NDC have ndc null", () => {
  assert.equal(fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2023-03-02"), SOURCE).ndc, null);
});

test("applyNdcMap gives NDC-only records an RxNorm key so dedupe merges them", () => {
  const items = [
    fromMedicationRequest(request("617318", "atorvastatin 20 MG Oral Tablet [Lipitor]", "2023-01-05"), SOURCE),
    fromMedicationRequest(ndcRequest("0071-0156-23", "Lipitor 20mg tab", "2021-06-01"), SOURCE)
  ];
  const map = new Map([["0071-0156-23", { rxcui: "617318", name: "atorvastatin 20 MG Oral Tablet [Lipitor]" }]]);
  const mapped = applyNdcMap(items, map);
  assert.equal(mapped[1].key, "rx:617318");
  assert.equal(mapped[1].rxcui, "617318");
  assert.equal(mapped[1].name, "Lipitor 20mg tab");
  const merged = dedupe(mapped);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 2);
});

test("applyNdcMap names an unnamed record from RxNorm", () => {
  const resource = ndcRequest("0071-0156-23", undefined, "2021-06-01");
  delete resource.medicationCodeableConcept.text;
  const item = fromMedicationRequest(resource, SOURCE);
  assert.equal(item.name, "Unnamed medicine");
  const [mapped] = applyNdcMap([item], new Map([["0071-0156-23", { rxcui: "617318", name: "atorvastatin 20 MG Oral Tablet [Lipitor]" }]]));
  assert.equal(mapped.name, "atorvastatin 20 MG Oral Tablet [Lipitor]");
});

test("applyNdcMap leaves records with an rxcui or no match alone", () => {
  const coded = fromMedicationRequest(request("314076", "lisinopril 10 MG Oral Tablet", "2023-03-02"), SOURCE);
  coded.ndc = "0071-0156-23";
  const unmatched = fromMedicationRequest(ndcRequest("12345-678-90", "Mystery", "2020-01-01"), SOURCE);
  const map = new Map([["0071-0156-23", { rxcui: "617318", name: "atorvastatin" }]]);
  const out = applyNdcMap([coded, unmatched], map);
  assert.deepEqual(out, [coded, unmatched]);
});
