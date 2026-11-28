// Makes js/sandbox-patients.js, the saved list behind Browse all patients
// (design docs/superpowers/specs/2026-11-28-browse-all-patients-design.md).
// Run:
//   node tools/sandbox-patients.mjs
//
// It finds every patient on the public SMART sandbox with a MedicationRequest
// or a MedicationStatement in any status, leaves out patients other people
// added through its API (the sandbox deletes them every night), reads every
// medicine, allergy and insurance claim on the sandbox, and counts each
// patient's. Every
// record counts, "entered in error" and the rest included (the developer,
// 2026-11-28). It keeps every living patient and the 25 deceased ones with
// the most different medicines. It only reads: nothing on the sandbox
// changes. It asks one page at a time with a pause, and waits longer after
// each 503, which the sandbox answers now and then; a run takes about 15
// minutes.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAddedId, nameOf, sortPatients } from "../js/browse.js";

const BASE = "https://launch.smarthealthit.org/v/r4/fhir/";
const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const CLAIM_TYPE = "http://terminology.hl7.org/CodeSystem/claim-type";
const DECEASED_KEPT = 25;
const PAUSE_MS = 300;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "js", "sandbox-patients.js");

// One medicine's key: its RxNorm code, else its words, else what it points
// to. A record that names nothing at all is one "unnamed" medicine.
function medicineKey(record) {
  const concept = record && record.medicationCodeableConcept;
  const codings = concept && Array.isArray(concept.coding) ? concept.coding : [];
  const rx = codings.filter((c) => c && c.system === RXNORM && c.code)[0];
  if (rx) return "rx:" + rx.code;
  const words = concept && (concept.text || (codings.filter((c) => c && c.display)[0] || {}).display);
  if (words) return "name:" + String(words).toLowerCase().replace(/\s+/g, " ").trim();
  const ref = record && record.medicationReference && record.medicationReference.reference;
  return ref ? "ref:" + ref : "unnamed";
}

function isPharmacy(claim) {
  const codings = (claim && claim.type && Array.isArray(claim.type.coding)) ? claim.type.coding : [];
  return codings.some((c) => c && c.system === CLAIM_TYPE && c.code === "pharmacy");
}

export function countsFor({ requests, statements, allergies, claims }) {
  const records = requests.concat(statements);
  const distinct = (list) => new Set(list.map(medicineKey)).size;
  return {
    different: distinct(records),
    prescriptions: requests.length,
    current: distinct(records.filter((r) => r && r.status === "active")),
    fills: claims.filter(isPharmacy).reduce((sum, claim) => sum + (Array.isArray(claim.item) ? claim.item.length : 0), 0),
    allergies: allergies.length
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRIES = 8;

async function get(url) {
  for (let attempt = 0; ; attempt += 1) {
    await wait(PAUSE_MS);
    try {
      const response = await fetch(url, { headers: { Accept: "application/fhir+json" }, signal: AbortSignal.timeout(60000) });
      if (response.ok) return await response.json();
      if (attempt >= TRIES || (response.status !== 503 && response.status !== 502 && response.status !== 429)) {
        throw new Error(response.status + " " + url);
      }
    } catch (error) {
      if (attempt >= TRIES) throw error;
    }
    await wait(5000 * (attempt + 1));
  }
}

// Every resource a search finds, 250 to a page (the sandbox's most),
// following its next links. (It ignores _offset.)
async function all(query) {
  const found = [];
  let url = BASE + query + "&_count=250";
  while (url) {
    const bundle = await get(url);
    for (const entry of bundle.entry || []) if (entry.resource) found.push(entry.resource);
    console.log("  " + found.length + " " + query.split("?")[0]);
    url = ((bundle.link || []).filter((l) => l.relation === "next")[0] || {}).url || null;
  }
  return found;
}

// "Patient/abc", or a full address ending in it, to "abc".
function patientOf(reference) {
  const match = /(?:^|\/)Patient\/([^/?#]+)$/.exec(String((reference && reference.reference) || ""));
  return match ? match[1] : null;
}

function byPatient(resources, field) {
  const groups = new Map();
  for (const resource of resources) {
    const id = patientOf(resource[field]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(resource);
  }
  return groups;
}

async function main() {
  // Every kind of record, all at once, grouped by patient: far fewer requests
  // than asking about each patient.
  const people = await all("Patient?_elements=id,name,birthDate,deceasedBoolean,deceasedDateTime");
  const requests = byPatient(await all("MedicationRequest?_elements=subject,status,medicationCodeableConcept,medicationReference"), "subject");
  const statements = byPatient(await all("MedicationStatement?_elements=subject,status,medicationCodeableConcept,medicationReference"), "subject");
  const allergies = byPatient(await all("AllergyIntolerance?_elements=patient"), "patient");
  const claims = byPatient(await all("ExplanationOfBenefit?_elements=patient,type,item"), "patient");
  const own = people.filter((patient) => !isAddedId(patient.id)).length;
  const patients = [];
  for (const patient of people) {
    const id = patient.id;
    if (isAddedId(id) || (!requests.has(id) && !statements.has(id))) continue;
    const counts = countsFor({ requests: requests.get(id) || [], statements: statements.get(id) || [], allergies: allergies.get(id) || [], claims: claims.get(id) || [] });
    const born = typeof patient.birthDate === "string" && patient.birthDate ? patient.birthDate : null;
    const deceased = patient.deceasedBoolean === true || Boolean(patient.deceasedDateTime);
    patients.push(Object.assign({ id, name: nameOf(patient), born, deceased }, counts));
  }
  console.log(people.length + " patients, " + patients.length + " of the sandbox's own with a medicine record");
  const living = patients.filter((p) => !p.deceased);
  const deceased = sortPatients(patients.filter((p) => p.deceased), "different").slice(0, DECEASED_KEPT);
  const kept = sortPatients(living.concat(deceased), "different");
  const made = new Date().toISOString().slice(0, 10);
  const lines = kept.map((p) => "  " + JSON.stringify(p)).join(",\n");
  writeFileSync(OUT, "// The SMART sandbox's own patients with a medicine record, for Browse all\n" +
    "// patients: every living one and the " + DECEASED_KEPT + " deceased ones with the most different\n" +
    "// medicines. Made by tools/sandbox-patients.mjs; run it again to refresh.\n" +
    "// Every record is counted, errors included. No DOM here.\n\n" +
    "export var MADE = " + JSON.stringify(made) + ";\n\n" +
    "// The sandbox's patients that day, and how many were its own (the rest\n" +
    "// were added by other people, and it deletes those every night).\n" +
    "export var SANDBOX_TOTAL = " + people.length + ";\n" +
    "export var SANDBOX_OWN = " + own + ";\n\n" +
    "export var PATIENTS = [\n" + lines + "\n];\n");
  console.log("Wrote " + kept.length + " patients (" + living.length + " living, " + deceased.length + " deceased) to js/sandbox-patients.js");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
