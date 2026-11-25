// Puts two made-up patients on the public SMART sandbox (r4.smarthealthit.org)
// whose records disagree, and writes the matching test clinic file for each,
// which the home server hands the app as a second source
// (BROWN_BAG_DEMO=two-clinics node tools/serve.mjs). Run:
//   node tools/reconcile-patients.mjs            (the sandbox and the files)
//   node tools/reconcile-patients.mjs --dry-run  (the files only)
//
// Riley Reconcile has every kind of disagreement the reconciliation design
// names, across the sandbox's records, its pharmacy claims and the clinic
// file. Jordan Partial has the awkward dates: a stop dated by year only, an
// undated record, and a clinic file that says it held records back.
//
// As in tools/demo-patient.mjs: ids are fixed and written with PUT, so
// running it again replaces the same records instead of adding copies.
// Every id starts "brownbag-recon-". Dates are relative to today, so run it
// again after the sandbox's nightly reset (and before a phone pass) to keep
// the two sides in step. Nothing else on the sandbox is touched, and nothing
// is ever deleted.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://r4.smarthealthit.org/";
const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const CATEGORY = "http://terminology.hl7.org/CodeSystem/medicationrequest-category";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLINICS = path.join(ROOT, "tests", "fixtures", "reconcile", "clinics");
const DAY = 24 * 60 * 60 * 1000;

// Each name is RxNorm's own, checked against RxNav before anything is written.
const DRUGS = {
  lisinopril10: { code: "314076", name: "lisinopril 10 MG Oral Tablet" },
  lisinopril20: { code: "314077", name: "lisinopril 20 MG Oral Tablet" },
  lisinoprilHctz: { code: "197886", name: "hydrochlorothiazide 12.5 MG / lisinopril 20 MG Oral Tablet" },
  methotrexate: { code: "105585", name: "methotrexate 2.5 MG Oral Tablet" },
  atorvastatin: { code: "617310", name: "atorvastatin 20 MG Oral Tablet" },
  zoloft: { code: "208161", name: "sertraline 50 MG Oral Tablet [Zoloft]", text: "Sertraline 50 MG Oral Tablet [Zoloft]" },
  sertraline: { code: "312941", name: "sertraline 50 MG Oral Tablet" },
  metformin: { code: "861007", name: "metformin hydrochloride 500 MG Oral Tablet" },
  metforminEr: { code: "860975", name: "24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet" },
  ondansetronIv: { code: "1740467", name: "2 ML ondansetron 2 MG/ML Injection" },
  levothyroxine: { code: "966222", name: "levothyroxine sodium 0.075 MG Oral Tablet" },
  amlodipine: { code: "197361", name: "amlodipine 5 MG Oral Tablet" },
  simvastatin: { code: "312961", name: "simvastatin 20 MG Oral Tablet" }
};

const DAILY = [1, 1, "d"];
const TWICE = [2, 1, "d"];
const WEEKLY = [1, 1, "wk"];
const TABLET = [1, "tablet"];

// The patients as plain data. A date is days before today, { year: n } for
// only the year n years ago, or null for none. A record is a prescription
// (MedicationRequest) unless it says statement.
export const PATIENTS = [
  {
    id: "brownbag-recon-riley",
    given: "Riley",
    family: "Reconcile",
    name: "Riley Reconcile",
    gender: "female",
    birthDate: "1948-06-02",
    records: [
      { id: "lisinopril", drug: "lisinopril10", status: "active", written: 200, dose: TABLET, often: DAILY },
      { id: "methotrexate", drug: "methotrexate", status: "active", written: 150, dose: [4, "tablet"], often: WEEKLY },
      { id: "atorvastatin", drug: "atorvastatin", status: "active", written: 300, dose: TABLET, often: DAILY },
      { id: "zoloft", drug: "zoloft", status: "active", written: 120, dose: TABLET, often: DAILY },
      { id: "metformin", drug: "metformin", status: "active", written: 400, dose: TABLET, often: TWICE },
      // From a hospital stay: active, but for the stay only.
      { id: "ondansetron-iv", drug: "ondansetronIv", status: "active", written: 10, dose: [4, "mg"], often: [1, 8, "h"], hospital: true },
      // Stopped in the record, but the pharmacy kept filling it (fills below).
      { id: "levothyroxine", drug: "levothyroxine", status: "stopped", written: 240, dose: TABLET, often: DAILY }
    ],
    // [drug, filled days ago, insurer]
    fills: [
      ["levothyroxine", 150, "Test Health Plan"],
      ["levothyroxine", 25, "Test Health Plan"],
      ["lisinopril20", 20, "Test Health Plan"],
      ["atorvastatin", 100, "Test Health Plan"],
      ["metformin", 35, "NO_INSURANCE"]
    ],
    clinic: [
      { id: "lisinopril", drug: "lisinopril20", status: "active", written: 30, dose: TABLET, often: DAILY },
      { id: "methotrexate", drug: "methotrexate", status: "active", written: 40, dose: [4, "tablet"], often: DAILY },
      { id: "atorvastatin", drug: "atorvastatin", statement: true, status: "stopped", from: 700, to: 45, asserted: 45, dose: TABLET, often: DAILY },
      { id: "sertraline", drug: "sertraline", status: "active", written: 60, dose: TABLET, often: DAILY },
      { id: "metformin-er", drug: "metforminEr", status: "active", written: 50, dose: [2, "tablet"], often: DAILY },
      { id: "lisinopril-hctz", drug: "lisinoprilHctz", status: "active", written: 30, dose: TABLET, often: DAILY },
      { id: "amlodipine", drug: "amlodipine", status: "active", written: 20, dose: TABLET, often: DAILY }
    ]
  },
  {
    id: "brownbag-recon-jordan",
    given: "Jordan",
    family: "Partial",
    name: "Jordan Partial",
    gender: "male",
    birthDate: "1955-11-20",
    records: [
      { id: "simvastatin", drug: "simvastatin", status: "active", written: 330, dose: TABLET, often: DAILY },
      { id: "metformin", drug: "metformin", status: "active", written: 90, dose: TABLET, often: TWICE },
      { id: "amlodipine", drug: "amlodipine", status: "active", written: 200, dose: TABLET, often: DAILY }
    ],
    fills: [],
    heldBack: true,
    clinic: [
      { id: "simvastatin", drug: "simvastatin", statement: true, status: "stopped", from: { year: 3 }, to: { year: 0 }, dose: TABLET, often: DAILY },
      { id: "metformin", drug: "metformin", status: "stopped", written: null, dose: TABLET, often: TWICE },
      { id: "amlodipine", drug: "amlodipine", status: "active", written: 60, dose: TABLET, often: DAILY }
    ]
  }
];

function concept(key) {
  const drug = DRUGS[key];
  return { coding: [{ system: RXNORM, code: drug.code, display: drug.name }], text: drug.text || drug.name };
}

// Today as a whole UTC day, so a run any time that day writes the same file.
function dayOf(today) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

function dateOf(when, day) {
  if (when === null || when === undefined) return undefined;
  if (typeof when === "object") return String(day.getUTCFullYear() - when.year);
  return new Date(day.getTime() - when * DAY).toISOString().slice(0, 10);
}

function dosage(row) {
  const [frequency, period, periodUnit] = row.often;
  return [Object.assign({
    timing: { repeat: { frequency, period, periodUnit } },
    doseAndRate: [{ doseQuantity: { value: row.dose[0], unit: row.dose[1] } }]
  }, row.hospital ? { route: { coding: [{ system: "http://snomed.info/sct", code: "47625008", display: "Intravenous route" }], text: "Intravenous" } } : {})];
}

// JSON.stringify leaves out what's undefined, so an undated record has no date at all.
function record(row, prefix, patientId, day, requester) {
  if (row.statement) {
    return {
      resourceType: "MedicationStatement",
      id: prefix + row.id,
      status: row.status,
      medicationCodeableConcept: concept(row.drug),
      subject: { reference: "Patient/" + patientId },
      effectivePeriod: { start: dateOf(row.from, day), end: dateOf(row.to, day) },
      dateAsserted: dateOf(row.asserted, day),
      dosage: dosage(row)
    };
  }
  return {
    resourceType: "MedicationRequest",
    id: prefix + row.id,
    status: row.status,
    intent: "order",
    category: row.hospital ? [{ coding: [{ system: CATEGORY, code: "inpatient", display: "Inpatient" }] }] : undefined,
    medicationCodeableConcept: concept(row.drug),
    subject: { reference: "Patient/" + patientId },
    authoredOn: dateOf(row.written, day),
    requester: requester ? { display: requester } : undefined,
    dosageInstruction: dosage(row)
  };
}

function claim([drug, days, insurer], index, patientId, day) {
  const date = dateOf(days, day);
  return {
    resourceType: "ExplanationOfBenefit",
    id: patientId + "-fill-" + (index + 1),
    contained: [{
      resourceType: "Coverage",
      id: "coverage",
      status: "active",
      beneficiary: { reference: "Patient/" + patientId },
      payor: [{ display: insurer }]
    }],
    status: "active",
    type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "pharmacy" }] },
    use: "claim",
    patient: { reference: "Patient/" + patientId },
    billablePeriod: { start: date, end: date },
    created: date,
    insurer: { display: insurer },
    provider: { display: "Brown Bag Test Pharmacy" },
    outcome: "complete",
    insurance: [{ focal: true, coverage: { reference: "#coverage", display: insurer } }],
    item: [{ sequence: 1, productOrService: concept(drug), servicedPeriod: { start: date, end: date } }]
  };
}

function person(patient, id, meta) {
  return Object.assign({ resourceType: "Patient", id }, meta ? { meta } : {}, {
    name: [{ use: "official", given: [patient.given], family: patient.family, text: patient.name }],
    gender: patient.gender,
    birthDate: patient.birthDate
  });
}

// Undefined fields dropped, the way they'd be sent or saved.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Each patient as FHIR, for a given today: sandbox is what goes to the
// sandbox (Patient first), clinic is the test clinic file
// { patient, requests, statements, heldBack? }. The clinic's Patient says
// the day it was written, so a test can build the sandbox side for that day.
export function definitions(today) {
  const day = dayOf(today);
  return PATIENTS.map((patient) => {
    const clinicId = patient.id + "-clinic";
    const clinic = patient.clinic.map((row) => record(row, clinicId + "-", clinicId, day, null));
    return plain({
      id: patient.id,
      name: patient.name,
      birthDate: patient.birthDate,
      sandbox: [person(patient, patient.id)]
        .concat(patient.records.map((row) => record(row, patient.id + "-", patient.id, day, "Dr. Test Clinician")))
        .concat(patient.fills.map((fill, i) => claim(fill, i, patient.id, day))),
      clinic: Object.assign({
        patient: person(patient, clinicId, { lastUpdated: day.toISOString().slice(0, 10) + "T00:00:00Z" }),
        requests: clinic.filter((r) => r.resourceType === "MedicationRequest"),
        statements: clinic.filter((r) => r.resourceType === "MedicationStatement")
      }, patient.heldBack ? { heldBack: true } : {})
    });
  });
}

// One file per patient, named by its sandbox id, as tools/serve.mjs looks it up.
export function writeClinics(dir, today) {
  mkdirSync(dir, { recursive: true });
  for (const patient of definitions(today)) {
    writeFileSync(path.join(dir, patient.id + ".json"), JSON.stringify(patient.clinic, null, 2) + "\n");
  }
}

async function checkCodes() {
  for (const [key, drug] of Object.entries(DRUGS)) {
    const props = await (await fetch("https://rxnav.nlm.nih.gov/REST/rxcui/" + drug.code + "/properties.json")).json();
    const name = props.properties && props.properties.name;
    if (!name || name.toLowerCase() !== drug.name.toLowerCase()) {
      throw new Error(key + ": RxNorm " + drug.code + " is \"" + name + "\", not \"" + drug.name + "\". Nothing was written.");
    }
  }
  console.log("RxNorm codes checked.");
}

async function put(resource) {
  const response = await fetch(BASE + resource.resourceType + "/" + resource.id, {
    method: "PUT",
    headers: { "content-type": "application/fhir+json", accept: "application/fhir+json" },
    body: JSON.stringify(resource)
  });
  console.log(resource.resourceType + "/" + resource.id + " " + response.status);
  if (!response.ok) {
    throw new Error((await response.text()).slice(0, 600));
  }
}

async function count(type, patientId) {
  const bundle = await (await fetch(BASE + type + "?patient=" + patientId + "&_summary=count", { headers: { accept: "application/fhir+json" } })).json();
  return bundle.total;
}

async function main(args) {
  const today = new Date();
  const dryRun = args.includes("--dry-run");
  if (!dryRun) await checkCodes();
  writeClinics(CLINICS, today);
  console.log("Clinic files written to " + path.relative(ROOT, CLINICS) + "/.");
  if (dryRun) return;
  for (const patient of definitions(today)) {
    for (const resource of patient.sandbox) await put(resource);
    console.log(patient.name + " read back: " + (await count("MedicationRequest", patient.id)) + " prescriptions, " +
      (await count("MedicationStatement", patient.id)) + " statements, " + (await count("ExplanationOfBenefit", patient.id)) + " claims.");
  }
}

// Tests import the definitions without writing anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
