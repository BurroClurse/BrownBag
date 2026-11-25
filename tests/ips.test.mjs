// The file staff save for a hospital system: an International Patient Summary
// (IPS 2.0.1). If these fail, a system can be given a contradiction, half a list
// that looks whole, or something a made-up link put there.
import test from "node:test";
import assert from "node:assert/strict";
import { patientSummary, summaryFileName, whyNotSaved } from "../js/ips.js";
import { buildShareBundle } from "../js/share.js";
import { fromMedicationRequest } from "../js/meds.js";
import { localDate, makeAddition } from "../js/view.js";

const NOW = new Date("2026-11-24T12:00:00Z"), SAVED = new Date("2026-11-25T09:00:00Z");
const RX = "http://www.nlm.nih.gov/research/umls/rxnorm", SNOMED = "http://snomed.info/sct", ABSENT = "http://hl7.org/fhir/StructureDefinition/data-absent-reason";
const med = (name, o) => fromMedicationRequest(Object.assign({ resourceType: "MedicationRequest", status: "active", authoredOn: "2026-09-01", requester: { display: "Dr. Patel" }, medicationCodeableConcept: { text: name, coding: [{ system: RX, code: "314076", display: "lisinopril 10 MG Oral Tablet" }] }, dosageInstruction: [{ route: { text: "Oral" }, timing: { repeat: { frequency: 2, period: 1, periodUnit: "d" } }, doseAndRate: [{ doseQuantity: { value: 1, unit: "tablet", system: "http://unitsofmeasure.org", code: "{tbl}" } }] }] }, o), "SMART sandbox");
const CARD = { key: "k", otherKeys: [], name: "Mold", codes: [{ system: SNOMED, code: "84489001" }], clinical: "active", reactions: [{ text: "Hives", severity: "severe", codes: [{ system: SNOMED, code: "126485001" }] }], source: "SMART sandbox", origin: "records", mine: null };
const LATEX = { key: "l", otherKeys: [], name: "Latex", codes: [], reactions: [], source: null, origin: "added", mine: { ids: ["o"], keys: [], reaction: "Itching", addedAt: "2026-11-23" } };
const ALLERGIES = { cards: [CARD, LATEX], statements: [], saidNone: null, unspecified: 0 };
const FINE = { recordsUpdatedAt: "2026-11-24T11:00:00.000Z", claims: "loaded", allergies: { status: "loaded", savedAt: null, updatedAt: "2026-11-24T11:00:00.000Z" } };
const bundle = (o = {}, warnings = {}) => JSON.parse(JSON.stringify(buildShareBundle(Object.assign({ patient: { name: "Avery Brownbag", birthDate: "1950-03-14" }, current: [med("lisinopril 10 MG")], additions: [makeAddition({ name: "Vitamin D", dose: "1 capsule", quantity: { value: 1, unit: "capsule" }, frequency: "At bedtime", schedule: { frequency: 1, period: 1, periodUnit: "d", when: ["HS"] } }, NOW)], stopped: [Object.assign(med("warfarin 5 MG"), { stoppedAt: "2026-10-01" })], allergies: ALLERGIES }, o), NOW, Object.assign({}, FINE, warnings), 2)));
let n = 0; const uuid = () => "00000000-0000-4000-8000-" + String(n += 1).padStart(12, "0");
const save = (b) => patientSummary(b, { now: SAVED, uuid });
const of = (doc, type) => doc.entry.map((e) => e.resource).filter((r) => r.resourceType === type);
const section = (doc, code) => doc.entry[0].resource.section.filter((s) => s.code.coding[0].code === code)[0];
const none = { cards: [], statements: [], saidNone: "2026-11-24", unspecified: 0 };

test("the document has what IPS requires", () => {
  const doc = save(bundle());
  assert.equal(doc.resourceType + doc.type, "Bundledocument");
  assert.match(doc.identifier.value, /^urn:uuid:/);
  assert.equal(doc.timestamp, SAVED.toISOString());
  const comp = doc.entry[0].resource;
  assert.equal(comp.resourceType, "Composition");
  assert.equal(comp.status, "preliminary");
  assert.equal(comp.type.coding[0].code, "60591-5");
  assert.equal(comp.date, NOW.toISOString());
  assert.equal(comp.title, "Patient summary from Brown Bag");
  assert.deepEqual(comp.section.map((s) => s.code.coding[0].code), ["10160-0", "48765-2", "11450-4"]);
  for (const s of comp.section) {
    assert.ok(s.title);
    assert.equal(s.text.status, "generated");
    assert.match(s.text.div, /^<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml">.+<\/div>$/s);
    assert.ok(Boolean(s.entry && s.entry.length) !== Boolean(s.emptyReason), s.title);
  }
  const urls = doc.entry.map((e) => e.fullUrl);
  assert.equal(new Set(urls).size, urls.length);
  for (const url of urls) assert.match(url, /^urn:uuid:[0-9a-f-]{36}$/);
  const refs = []; JSON.stringify(doc, (key, value) => { if (key === "reference") refs.push(value); return value; });
  assert.ok(refs.length > 8);
  for (const ref of refs) assert.ok(urls.includes(ref), ref);
  assert.equal(of(doc, "Patient").length, 1);
  assert.equal(of(doc, "Device")[0].deviceName[0].name, "Brown Bag");
  assert.equal(comp.author.length, 2);
});

test("every medicine is there, with its codes and words, and no made-up dates", () => {
  const meds = of(save(bundle()), "MedicationStatement");
  assert.deepEqual(meds.map((m) => [m.medicationCodeableConcept.text, m.status]), [["lisinopril 10 MG", "active"], ["Vitamin D", "active"], ["warfarin 5 MG", "stopped"]]);
  for (const m of meds) {
    assert.deepEqual(m._effectiveDateTime, { extension: [{ url: ABSENT, valueCode: "unknown" }] });
    assert.equal(m.effectivePeriod, undefined);
  }
  assert.equal(meds[2].dateAsserted, "2026-10-01");
  assert.deepEqual(meds[0].dosage[0].timing, { repeat: { frequency: 2, period: 1, periodUnit: "d" } });
  assert.equal(meds[0].dosage[0].text, "1 tablet · Oral · 2 times a day");
  assert.equal(meds[0].dosage[0].doseAndRate[0].doseQuantity.code, "{tbl}");
  assert.ok(meds[0].note.some((x) => x.text === "From records: SMART sandbox"));
  assert.ok(meds[1].informationSource.reference);
  // Words only, when that's all there is.
  const words = save(bundle({ current: [med("x", { dosageInstruction: [{ timing: { code: { text: "Twice daily" } } }] })] }));
  assert.deepEqual(of(words, "MedicationStatement")[0].dosage[0].timing, { code: { text: "Twice daily" } });
});

test("allergies keep who said it, codes and reactions", () => {
  const all = of(save(bundle()), "AllergyIntolerance");
  assert.deepEqual(all.map((a) => a.code.text), ["Mold", "Latex"]);
  assert.deepEqual(all[0].reaction, [{ manifestation: [{ text: "Hives", coding: [{ system: SNOMED, code: "126485001" }] }], severity: "severe" }]);
  assert.ok(all[1].asserter.reference);
  assert.equal(all[1].verificationStatus.coding[0].code, "unconfirmed");
});

test("no known allergies is coded only when nothing is in doubt", () => {
  const coded = (o, w) => of(save(bundle({ allergies: Object.assign({}, none, o) }, w)), "AllergyIntolerance").filter((a) => (a.code.coding || []).some((c) => c.code === "716186003" || c.code === "409137002"));
  assert.equal(coded().length, 1);
  assert.equal(coded({ unspecified: 1 }).length, 0);
  assert.equal(coded({}, { allergies: { status: "loaded", savedAt: "2026-11-01T00:00:00Z" } }).length, 0);
  assert.equal(coded({ saidNone: null, statements: ["No known allergy"], cards: [LATEX] }).length, 0);
  assert.equal(coded({ saidNone: null, statements: ["No known drug allergy"] }).length, 1);
  const held = section(save(bundle({ allergies: none }, { allergies: { status: "loaded", savedAt: "2026-11-01T00:00:00Z" } })), "48765-2");
  assert.equal(held.emptyReason.coding[0].code, "unavailable");
  assert.match(held.text.div, /Patient says: no known allergies\./);
  assert.match(held.text.div, /copy saved on/);
});

test("an empty section is never a doctor's none", () => {
  const doc = save(bundle({ current: [], additions: [], stopped: [], allergies: { cards: [], statements: [], saidNone: null, unspecified: 0 } }));
  for (const code of ["10160-0", "48765-2", "11450-4"]) assert.equal(section(doc, code).emptyReason.coding[0].code, "unavailable", code);
  assert.match(section(doc, "48765-2").text.div, /None in the records\. The patient hasn&#39;t said\./);
  assert.match(section(doc, "11450-4").text.div, /Brown Bag doesn&#39;t read health problems\./);
});

test("an incomplete list can't be saved", () => {
  assert.equal(whyNotSaved(bundle()), null);
  for (const w of [{ incomplete: true }, { ownMissing: true }, { allergies: { status: "failed", savedAt: null } }, { allergies: { status: "not-loaded", savedAt: null } }]) assert.equal(whyNotSaved(bundle({}, w)), "incomplete", JSON.stringify(w));
  assert.equal(whyNotSaved(bundle({ allergies: null })), "incomplete");
  assert.throws(() => save(bundle({}, { incomplete: true })));
});

test("a saved copy and missing insurance fills are in the title and a note, not only the words", () => {
  const s = section(save(bundle({}, { recordsSavedAt: "2026-11-20T10:00:00.000Z", recordsUpdatedAt: null, claims: "failed" })), "10160-0");
  assert.match(s.title, /saved copy/);
  assert.match(s.title, /insurance fills not loaded/);
  assert.equal(s.extension[0].url, "http://hl7.org/fhir/StructureDefinition/note");
  assert.match(s.extension[0].valueAnnotation.text, /copy saved on/);
  assert.match(s.text.div, /copy saved on/);
  assert.equal(section(save(bundle()), "10160-0").title, "Medicines");
  assert.equal(section(save(bundle()), "10160-0").extension, undefined);
});

test("records with no medicine name are entries of their own", () => {
  const doc = save(bundle({}, { unnamed: 2 }));
  const unnamed = of(doc, "MedicationStatement").filter((m) => m.medicationCodeableConcept.coding && m.medicationCodeableConcept.coding[0].code === "unknown");
  assert.equal(unnamed.length, 2);
  assert.equal(unnamed[0].status, "unknown");
  assert.equal(section(doc, "10160-0").entry.length, 5);
});

test("a patient with no name or birth date has none, not words", () => {
  const p = of(save(bundle({ patient: { name: "Name not recorded", birthDate: undefined } })), "Patient")[0];
  assert.deepEqual(p, { resourceType: "Patient", name: [{ _text: { extension: [{ url: ABSENT, valueCode: "unknown" }] } }], _birthDate: { extension: [{ url: ABSENT, valueCode: "unknown" }] } });
  assert.deepEqual(of(save(bundle()), "Patient")[0], { resourceType: "Patient", name: [{ text: "Avery Brownbag" }], birthDate: "1950-03-14" });
});

test("names are text, never markup", () => {
  const doc = save(bundle({ current: [med('<img src=x onerror="1">&')] }));
  assert.match(section(doc, "10160-0").text.div, /&lt;img src=x onerror=&quot;1&quot;&gt;&amp;/);
  assert.doesNotMatch(section(doc, "10160-0").text.div, /<img/);
});

// Anyone can make a valid link. What isn't expected is refused, not copied.
test("anything unexpected means no file", () => {
  const odd = (change) => { const b = bundle(); change(b); return whyNotSaved(b); };
  const cases = [
    (b) => b.entry.push({ resource: { resourceType: "Condition" } }), (b) => b.entry.push({ resource: { resourceType: "Patient", name: [{ text: "Two" }] } }), (b) => b.entry.shift(), (b) => { b.type = "transaction"; }, (b) => { b.timestamp = "soon"; },
    (b) => { b.entry[1].resource.status = "fine"; }, (b) => { b.entry[1].resource.medicationCodeableConcept.text = 5; }, (b) => { b.entry[1].resource.medicationCodeableConcept = null; }, (b) => { b.entry[1].resource.medicationCodeableConcept.text = "x".repeat(20001); },
    (b) => { b.entry[1].resource.dosage = [{}, {}]; }, (b) => { b.entry[1].resource.dosage[0].doseAndRate[0].doseQuantity.value = "1"; }, (b) => { b.entry[1].resource.dosage[0].timing.repeat.count = 3; },
    (b) => { b.entry[1].resource.modifierExtension = [{}]; }, (b) => { b.entry[1].resource.dosage[0].maxDosePerPeriod = {}; }, (b) => { b.entry[1].resource.effectivePeriod = { end: "2026-01-01" }; }, (b) => { b.entry[2].resource.informationSource = { reference: "Patient/9" }; }, (b) => { b.timestamp = "2026-02-31T00:00:00Z"; }, (b) => { b.meta.tag.push({ system: "https://burroclurse.github.io/BrownBag/tags", code: "allergies-saved-on", display: "junk" }); },
    (b) => { b.entry[4].resource.clinicalStatus.coding[0].code = "odd"; }, (b) => { b.entry[4].resource.criticality = "odd"; }, (b) => { b.entry[4].resource.reaction = [{}]; }, (b) => { b.entry = null; }, (b) => { b.entry[2] = null; }
  ];
  cases.forEach((change, i) => assert.equal(odd(change), "odd", "case " + i));
  for (const b of [null, 5, {}, []]) assert.equal(whyNotSaved(b), "odd");
});

test("unknown extra fields are left behind", () => {
  const b = bundle(); b.entry[1].resource.extension = [{ url: "http://x", valueString: "secret" }]; b.entry[0].resource.telecom = [{ value: "secret" }]; b.entry[1].resource.meta = { tag: [{ code: "secret" }] };
  assert.doesNotMatch(JSON.stringify(save(b)), /secret/);
  assert.doesNotMatch(JSON.stringify(save(bundle())), /burroclurse/);
});

test("the file's name has the code's date and nobody's name", () => {
  assert.equal(summaryFileName(bundle()), "patient-summary-" + localDate(NOW) + ".json");
});

// Every complete list the app can make can be saved. One odd code in a record
// drops that code, never the file.
test("odd values in a real record don't stop the file", () => {
  const ok = (change) => { const b = bundle(); change(b); assert.equal(whyNotSaved(b), null, String(change)); return save(b); };
  const allergy = (b) => b.entry[4].resource, m = (b) => b.entry[1].resource;
  assert.deepEqual(of(ok((b) => { allergy(b).code.coding = [{ system: "2.16.840.1", code: "x" }, { system: "local", code: "y" }, { system: SNOMED + " ", code: "84489001 " }, { system: SNOMED, code: 5 }]; }), "AllergyIntolerance")[0].code, { coding: [{ system: SNOMED, code: "84489001" }], text: "Mold" });
  assert.deepEqual(of(ok((b) => { m(b).dosage[0].doseAndRate[0].doseQuantity = { value: 1, unit: " ", system: "UCUM", code: "tab " }; }), "MedicationStatement")[0].dosage[0].doseAndRate[0].doseQuantity, { value: 1 });
  ok((b) => { m(b).dosage[0].route.text = " "; m(b).dosage[0].text = " "; });
  ok((b) => { m(b).dosage[0].text = "x".repeat(6000); });
  assert.equal(of(ok((b) => { m(b).medicationCodeableConcept.coding[0].system = "javascript:1"; }), "MedicationStatement")[0].medicationCodeableConcept.coding, undefined);
  assert.deepEqual(of(ok((b) => { b.entry[0].resource.name[0].text = " "; b.entry[0].resource.birthDate = "1950-01-01T00:00:00Z"; }), "Patient")[0].birthDate, "1950-01-01");
  for (const date of ["1950-02-31", "soon"]) assert.ok(of(ok((b) => { b.entry[0].resource.birthDate = date; }), "Patient")[0]._birthDate);
  assert.equal(of(ok((b) => { allergy(b).recordedDate = "2020-13-45"; }), "AllergyIntolerance")[0].recordedDate, undefined);
  assert.equal(of(ok((b) => { m(b).medicationCodeableConcept.text = ""; }), "MedicationStatement")[0].medicationCodeableConcept.text, "Unnamed medicine");
  assert.equal(of(ok((b) => { m(b).medicationCodeableConcept.text = "a\u0000b\fc"; }), "MedicationStatement")[0].medicationCodeableConcept.text, "abc");
});

test("a fill with no name can be saved", () => {
  const doc = save(bundle({ current: [{ name: "", rxcui: "312941", origin: "claims", source: "Aetna claims", fills: { count: 1, last: "2026-10-22", insurers: ["Aetna"], cash: false } }] }));
  assert.equal(of(doc, "MedicationStatement")[0].medicationCodeableConcept.coding[0].code, "312941");
});

test("a medicine the patient takes as needed has no schedule, and says who said so", () => {
  const d = of(save(bundle({ current: [Object.assign(med("x"), { asNeededAt: "2026-11-20" })] })), "MedicationStatement")[0].dosage[0];
  assert.equal(d.timing, undefined);
  assert.equal(d.asNeededBoolean, true);
  assert.match(d.text, /2 times a day\. Patient says: takes only when needed$/);
});

// Task 9: when the records disagree, the file says so in its own words, and
// every side is in it as its own statement with its notes. IPS 2.0.1 allows
// only medicine records in the Medications section, so there's no
// DetectedIssue. If these fail, a hospital system could take one source's
// dose as the only one, be told of a disagreement the patient settled, or
// reject the file.
const SIDES = [
  { sourceId: "smart-sandbox", sourceName: "SMART sandbox", kind: "records", asOf: "2026-03-02", name: "lisinopril 10 MG Oral Tablet", dose: "10 mg", route: null, frequency: "once a day", status: "current", recordStatus: "active", key: "rx:314076" },
  { sourceId: "valley-clinic-demo", sourceName: "Valley Clinic (test records)", kind: "records", asOf: "2026-10-05", name: "lisinopril 20 MG Oral Tablet", dose: "20 mg", route: null, frequency: "once a day", status: "current", recordStatus: "active", key: "rx:314077" }
];
const grouped = (group) => ({
  key: "rx:314077", rxcui: "314077", name: "lisinopril 20 MG Oral Tablet", dose: "20 mg", route: null, frequency: "once a day", start: "2026-10-05", end: null, prescriber: "Dr. Patel",
  source: "Valley Clinic (test records)", status: "current", origin: "records", lastDate: "2026-10-05", count: 1,
  group: Object.assign({ id: "29046", sources: ["SMART sandbox", "Valley Clinic (test records)"], verdicts: ["dose"], sides: SIDES, fingerprint: "fp", notes: [] }, group)
});
const ANSWER = (choice) => ({ groupId: "29046", fingerprint: "fp", sides: SIDES, choice, answeredAt: "2026-11-25T15:00:00.000Z" });
async function disagreeing(cards, data, warnings) {
  const { arrangeList, shareListFrom } = await import("../js/view.js");
  const list = Object.assign(shareListFrom({ name: "Avery Brownbag", birthDate: "1950-03-14" }, arrangeList({ current: cards, older: [] }, data || {}), []), { allergies: ALLERGIES });
  return save(JSON.parse(JSON.stringify(buildShareBundle(list, NOW, Object.assign({}, FINE, warnings), 2))));
}
const fullUrlOf = (doc, resource) => doc.entry.filter((e) => e.resource === resource)[0].fullUrl;
const notesOf = (doc) => of(doc, "MedicationStatement").map((m) => [m.status, m.medicationCodeableConcept.text].concat((m.note || []).map((x) => x.text)));
const noIssue = (doc) => assert.deepEqual(doc.entry.map((e) => e.resource.resourceType).filter((type) => type === "DetectedIssue"), []);

test("a disagreement is in the file as both sides, with no DetectedIssue", async () => {
  const doc = await disagreeing([grouped()]);
  noIssue(doc);
  const meds = of(doc, "MedicationStatement");
  assert.deepEqual(meds.map((m) => m.medicationCodeableConcept.text), ["lisinopril 10 MG Oral Tablet", "lisinopril 20 MG Oral Tablet"]);
  const s = section(doc, "10160-0");
  // Only medicine records in the Medications section.
  assert.deepEqual(s.entry.map((e) => e.reference), meds.map((m) => fullUrlOf(doc, m)));
  assert.match(s.text.div, /<p><strong>Records disagree on 1 medicine\. Ask the patient\.<\/strong><\/p>/);
  // The same sides staff see, together, under their source and date.
  assert.match(s.text.div, /<p>Records disagree: ask the patient<\/p><ul><li>SMART sandbox, Mar 2026: lisinopril 10 MG Oral Tablet\. Dose: 10 mg\. How often: once a day\. Valley Clinic \(test records\), Oct 2026: lisinopril 20 MG Oral Tablet\. Dose: 20 mg\. How often: once a day\. Prescribed by: Dr\. Patel<\/li><\/ul>/);
  const urls = doc.entry.map((e) => e.fullUrl);
  const refs = []; JSON.stringify(doc, (key, value) => { if (key === "reference") refs.push(value); return value; });
  for (const ref of refs) assert.ok(urls.includes(ref), ref);
});

test("every side of a disagreement is in the file with its notes", async () => {
  assert.deepEqual(notesOf(await disagreeing([grouped()])), [
    ["active", "lisinopril 10 MG Oral Tablet", "From records: SMART sandbox", "Records disagree", "Record date: 2026-03"],
    ["active", "lisinopril 20 MG Oral Tablet", "From records: Valley Clinic (test records)", "Records disagree", "Record date: 2026-10", "Prescribed by Dr. Patel"]
  ]);
  // Whether it's still taken: which side lists it current, which stopped.
  const stopped = Object.assign({}, SIDES[0], { dose: "20 mg", status: "not-current", recordStatus: "stopped" });
  assert.deepEqual(notesOf(await disagreeing([grouped({ verdicts: ["status"], sides: [stopped, SIDES[1]] })])), [
    ["completed", "lisinopril 10 MG Oral Tablet", "From records: SMART sandbox", "Records disagree", "Records say: stopped", "Record date: 2026-03"],
    ["active", "lisinopril 20 MG Oral Tablet", "From records: Valley Clinic (test records)", "Records disagree", "Records say: current", "Record date: 2026-10", "Prescribed by Dr. Patel"]
  ]);
  // Not sure: every side stays, and says so.
  const unsure = await disagreeing([grouped()], { answers: [ANSWER("not-sure")] });
  noIssue(unsure);
  assert.deepEqual(notesOf(unsure).map((m) => m.slice(3, 5)), [["Records disagree", "Patient isn't sure"], ["Records disagree", "Patient isn't sure"]]);
  assert.match(section(unsure, "10160-0").text.div, /<p><strong>Records disagree on 1 medicine\. Ask the patient\.<\/strong><\/p>/);
  assert.match(section(unsure, "10160-0").text.div, /<li>Patient isn&#39;t sure\. SMART sandbox, Mar 2026: /);
  // A Not taking mark against the record: the record and the mark.
  const card = Object.assign(grouped(), { group: null, key: "rx:314076", rxcui: "314076", lastDate: "2026-10-02" });
  const marked = await disagreeing([card], { stopped: { "rx:314076": "2026-03-03" } });
  noIssue(marked);
  assert.deepEqual(notesOf(marked).map((m) => m.slice(0, 4)), [["active", "lisinopril 20 MG Oral Tablet", "From records: Valley Clinic (test records)", "Records disagree"], ["stopped", "lisinopril 20 MG Oral Tablet"]]);
});

test("an answer settles it in the file", async () => {
  const chosen = await disagreeing([grouped()], { answers: [ANSWER("valley-clinic-demo")] });
  noIssue(chosen);
  assert.deepEqual(notesOf(chosen), [
    ["active", "lisinopril 20 MG Oral Tablet", "From records: Valley Clinic (test records)", "Prescribed by Dr. Patel", "Patient confirmed this, 2026-11-25", "Other record: SMART sandbox, 10 mg, once a day, 2026-03"]
  ]);
  const s = section(chosen, "10160-0");
  assert.equal(s.title, "Medicines");
  assert.equal(s.extension, undefined);
  assert.doesNotMatch(s.text.div, /Records disagree on/);
});

test("the caution says 1 medicine, or N medicines", async () => {
  const one = section(await disagreeing([grouped()]), "10160-0");
  assert.equal(one.title, "Medicines (records disagree on 1 medicine)");
  assert.equal(one.extension[0].valueAnnotation.text, "Records disagree on 1 medicine. Ask the patient.");
  const other = Object.assign(grouped({ id: "6809", sides: [Object.assign({}, SIDES[0], { name: "metformin 500 MG", key: "rx:861007", dose: "20 mg", frequency: "twice a day" }), Object.assign({}, SIDES[1], { name: "metformin 500 MG", key: "rx:861007" })], verdicts: ["schedule"] }), { key: "rx:861007", rxcui: "861007", name: "metformin 500 MG" });
  const doc = await disagreeing([grouped(), other]);
  noIssue(doc);
  assert.equal(of(doc, "MedicationStatement").length, 4);
  const two = section(doc, "10160-0");
  assert.equal(two.title, "Medicines (records disagree on 2 medicines)");
  assert.equal(two.extension[0].valueAnnotation.text, "Records disagree on 2 medicines. Ask the patient.");
  assert.match(two.text.div, /<p><strong>Records disagree on 2 medicines\. Ask the patient\.<\/strong><\/p>/);
  // After the saved copy's caution, which comes first as it always has.
  const saved = section(await disagreeing([grouped()], {}, { recordsSavedAt: "2026-11-20T10:00:00.000Z", recordsUpdatedAt: null }), "10160-0");
  assert.equal(saved.title, "Medicines (saved copy, records disagree on 1 medicine)");
});

// IPS 2.0.1 removed its code list for "no known medicines", so a source's
// word is in the readable text only, as staff see it (Tyler, 2026-11-25).
test("a source with no medicines says so in the text, with no coded entry", () => {
  const said = { noMedicines: [{ source: "Valley Clinic", kind: "no-info" }, { source: "Summary", kind: "none-known" }] };
  const empty = save(bundle({ current: [], additions: [], stopped: [] }, said));
  assert.deepEqual(of(empty, "MedicationStatement"), []);
  const s = section(empty, "10160-0");
  assert.equal(s.entry, undefined);
  assert.equal(s.emptyReason.coding[0].code, "unavailable");
  assert.match(s.text.div, /<p><strong>Valley Clinic: no information about medicines<\/strong><\/p><p><strong>Summary: no medicines known<\/strong><\/p>/);
  assert.doesNotMatch(JSON.stringify(empty), /absent-unknown|no-known-medications|no-medication-info/);
  // Beside what the patient added: only the patient's medicine is coded.
  const added = save(bundle({ current: [], stopped: [] }, said));
  assert.deepEqual(of(added, "MedicationStatement").map((m) => m.medicationCodeableConcept.text), ["Vitamin D"]);
  assert.match(section(added, "10160-0").text.div, /Valley Clinic: no information about medicines/);
});

// Every file made before this change is made the same way now.
test("no disagreement, the file is made as before", async () => {
  const { readFileSync } = await import("node:fs");
  const { timeText } = await import("../js/share.js");
  const today = JSON.parse(readFileSync(new URL("./fixtures/ips/today.json", import.meta.url), "utf8"));
  const fresh = (b) => {
    let k = 0;
    let text = JSON.stringify(patientSummary(b, { now: SAVED, uuid: () => "00000000-0000-4000-8000-" + String(k += 1).padStart(12, "0") }));
    // The fixture holds times as <ISO>, so it reads the same in any time zone.
    [NOW.toISOString(), FINE.recordsUpdatedAt, "2026-11-20T10:00:00.000Z"].forEach((t) => { text = text.split(timeText(t)).join("<" + t + ">"); });
    return JSON.parse(text);
  };
  const made = {
    plain: fresh(bundle()),
    savedCopy: fresh(bundle({}, { recordsSavedAt: "2026-11-20T10:00:00.000Z", recordsUpdatedAt: null, claims: "failed" })),
    unnamed: fresh(bundle({}, { unnamed: 2 })),
    empty: fresh(bundle({ current: [], additions: [], stopped: [], allergies: { cards: [], statements: [], saidNone: null, unspecified: 0 } }))
  };
  for (const name of Object.keys(today)) {
    assert.deepEqual(made[name], today[name], name);
    assert.deepEqual(of(made[name], "DetectedIssue"), [], name);
  }
});

test("the QR code still can't carry a DetectedIssue", () => {
  const b = bundle(); b.entry.push({ resource: { resourceType: "DetectedIssue", status: "preliminary" } });
  assert.equal(whyNotSaved(b), "odd");
});
