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
