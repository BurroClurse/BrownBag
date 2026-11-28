// Makes js/sandbox-patients.js, the saved list behind Browse all patients
// (design docs/superpowers/specs/2026-11-28-browse-all-patients-design.md).
// Run:
//   node tools/sandbox-patients.mjs
//
// It finds every patient on the public SMART sandbox with a MedicationRequest
// or a MedicationStatement in any status, leaves out patients other people
// added through its API (the sandbox deletes them every night), reads each
// one's medicines, allergies and insurance claims, and counts them. Every
// record counts, "entered in error" and the rest included (the developer,
// 2026-11-28). It keeps every living patient and the 25 deceased ones with
// the most different medicines. It only reads: nothing on the sandbox
// changes. It asks one thing at a time, slowly, because the sandbox answers
// 503 when asked quickly; a run takes several minutes.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAddedId, nameOf, sortPatients } from "../js/browse.js";

const BASE = "https://launch.smarthealthit.org/v/r4/fhir/";
const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const CLAIM_TYPE = "http://terminology.hl7.org/CodeSystem/claim-type";
const REQUEST_STATUSES = "active,on-hold,cancelled,completed,entered-in-error,stopped,draft,unknown";
const STATEMENT_STATUSES = "active,completed,entered-in-error,intended,stopped,on-hold,unknown,not-taken";
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

async function get(url) {
  for (let attempt = 0; ; attempt += 1) {
    await wait(PAUSE_MS);
    try {
      const response = await fetch(url, { headers: { Accept: "application/fhir+json" }, signal: AbortSignal.timeout(30000) });
      if (response.ok) return await response.json();
      if (attempt >= 4 || (response.status !== 503 && response.status !== 502 && response.status !== 429)) {
        throw new Error(response.status + " " + url);
      }
    } catch (error) {
      if (attempt >= 4) throw error;
    }
    await wait(5000 * (attempt + 1));
  }
}

// Every resource a search finds, a page at a time by _offset, in _id order.
// The sandbox's own next links fail after about ten pages; offsets don't.
async function all(query) {
  const size = Number((/[?&]_count=(\d+)/.exec(query) || [])[1]) || 20;
  const found = [];
  for (let offset = 0; ; offset += size) {
    const bundle = await get(BASE + query + "&_sort=_id&_offset=" + offset);
    const page = (bundle.entry || []).map((entry) => entry.resource).filter(Boolean);
    found.push(...page);
    if (process.env.VERBOSE) console.log(found.length + " " + query.slice(0, 70));
    if (page.length < size) return found;
  }
}

async function main() {
  const ids = new Set();
  for (const query of [
    "Patient?_has:MedicationRequest:patient:status=" + REQUEST_STATUSES + "&_count=20&_elements=id",
    "Patient?_has:MedicationStatement:subject:status=" + STATEMENT_STATUSES + "&_count=20&_elements=id"
  ]) {
    for (const patient of await all(query)) if (!isAddedId(patient.id)) ids.add(patient.id);
    console.log(ids.size + " so far");
  }
  console.log(ids.size + " patients with a medicine record");
  const patients = [];
  let done = 0;
  for (const id of ids) {
    const patient = await get(BASE + "Patient/" + encodeURIComponent(id));
    const q = "?patient=" + encodeURIComponent(id) + "&_count=100";
    const counts = countsFor({
      requests: await all("MedicationRequest" + q + "&_elements=status,medicationCodeableConcept,medicationReference"),
      statements: await all("MedicationStatement" + q + "&_elements=status,medicationCodeableConcept,medicationReference"),
      allergies: await all("AllergyIntolerance" + q + "&_elements=id"),
      claims: await all("ExplanationOfBenefit" + q + "&_elements=type,item")
    });
    const born = typeof patient.birthDate === "string" && patient.birthDate ? patient.birthDate : null;
    const deceased = patient.deceasedBoolean === true || Boolean(patient.deceasedDateTime);
    patients.push(Object.assign({ id, name: nameOf(patient), born, deceased }, counts));
    done += 1;
    if (done % 25 === 0) console.log(done + " of " + ids.size);
  }
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
    "export var PATIENTS = [\n" + lines + "\n];\n");
  console.log("Wrote " + kept.length + " patients (" + living.length + " living, " + deceased.length + " deceased) to js/sandbox-patients.js");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
