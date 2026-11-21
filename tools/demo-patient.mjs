// Puts the Brown Bag demo patient on the public SMART sandbox
// (r4.smarthealthit.org): a made-up person whose prescriptions and pharmacy
// claims show every case Brown Bag handles. Run: node tools/demo-patient.mjs
//
// Ids are fixed and written with PUT, so running it again replaces the same
// records instead of adding copies. Dates are relative to today. Nothing
// else on the sandbox is touched.

const BASE = "https://r4.smarthealthit.org/";
const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const PATIENT = "brownbag-demo-patient";
const DAY = 24 * 60 * 60 * 1000;
const today = new Date();
const ago = (days) => new Date(today.getTime() - days * DAY).toISOString().slice(0, 10);

const DRUGS = {
  lisinopril: { code: "314076", name: "lisinopril 10 MG Oral Tablet" },
  atorvastatin: { code: "617310", name: "atorvastatin 20 MG Oral Tablet" },
  metformin: { code: "861007", name: "metformin hydrochloride 500 MG Oral Tablet" },
  amoxicillin: { code: "308191", name: "amoxicillin 500 MG Oral Capsule" },
  sertraline: { code: "312941", name: "sertraline 50 MG Oral Tablet" },
  ibuprofen: { code: "197806", name: "ibuprofen 600 MG Oral Tablet" }
};

// [drug, status, written days ago, how often]
const PRESCRIPTIONS = [
  ["lisinopril", "active", 180, "once a day"],
  ["atorvastatin", "active", 90, "once a day"],
  ["metformin", "completed", 3 * 365, "twice a day"],
  ["amoxicillin", "completed", 42, "three times a day"]
];

// [drug, filled days ago, insurer]
const FILLS = [
  ["lisinopril", 120, "Aetna"],
  ["lisinopril", 60, "Aetna"],
  ["metformin", 60, "Aetna"],
  ["amoxicillin", 42, "NO_INSURANCE"],
  ["sertraline", 30, "Aetna"],
  ["ibuprofen", 3 * 365, "Aetna"]
];

const concept = (drug) => ({ coding: [{ system: RXNORM, code: DRUGS[drug].code, display: DRUGS[drug].name }], text: DRUGS[drug].name });
const PER_DAY = { "once a day": 1, "twice a day": 2, "three times a day": 3 };

function patient() {
  return {
    resourceType: "Patient",
    id: PATIENT,
    name: [{ use: "official", given: ["Avery"], family: "Brownbag", text: "Avery Brownbag" }],
    gender: "female",
    birthDate: "1950-03-14"
  };
}

function prescription([drug, status, days, often], index) {
  return {
    resourceType: "MedicationRequest",
    id: "brownbag-demo-rx-" + (index + 1),
    status,
    intent: "order",
    medicationCodeableConcept: concept(drug),
    subject: { reference: "Patient/" + PATIENT },
    authoredOn: ago(days),
    requester: { display: "Dr. Demo Clinician" },
    dosageInstruction: [{
      text: "1 by mouth " + often,
      timing: { repeat: { frequency: PER_DAY[often], period: 1, periodUnit: "d" } },
      doseAndRate: [{ doseQuantity: { value: 1, unit: drug === "amoxicillin" ? "capsule" : "tablet" } }]
    }]
  };
}

function claim([drug, days, insurer], index) {
  const date = ago(days);
  return {
    resourceType: "ExplanationOfBenefit",
    id: "brownbag-demo-fill-" + (index + 1),
    contained: [{
      resourceType: "Coverage",
      id: "coverage",
      status: "active",
      beneficiary: { reference: "Patient/" + PATIENT },
      payor: [{ display: insurer }]
    }],
    status: "active",
    type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "pharmacy" }] },
    use: "claim",
    patient: { reference: "Patient/" + PATIENT },
    billablePeriod: { start: date, end: date },
    created: date,
    insurer: { display: insurer },
    provider: { display: "Brown Bag Demo Pharmacy" },
    outcome: "complete",
    insurance: [{ focal: true, coverage: { reference: "#coverage", display: insurer } }],
    item: [{
      sequence: 1,
      productOrService: concept(drug),
      servicedPeriod: { start: date, end: date }
    }]
  };
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

async function count(type, param) {
  const bundle = await (await fetch(BASE + type + "?" + param + "=" + PATIENT + "&_summary=count", { headers: { accept: "application/fhir+json" } })).json();
  return bundle.total;
}

await checkCodes();
await put(patient());
for (const [i, rx] of PRESCRIPTIONS.entries()) await put(prescription(rx, i));
for (const [i, fill] of FILLS.entries()) await put(claim(fill, i));
console.log("Read back: " + (await count("MedicationRequest", "patient")) + " prescriptions, " + (await count("ExplanationOfBenefit", "patient")) + " claims.");
