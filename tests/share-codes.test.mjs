// The codes a record gives, in the QR code. If these fail, a hospital system
// can read a direction the record didn't give, or a medicine can be lost to make
// room for codes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dedupe, fromMedicationRequest, fromMedicationStatement } from "../js/meds.js";
import { buildShareBundle, groupShareBundle, packShare, shareBundleFor } from "../js/share.js";
import { makeAddition } from "../js/view.js";

const RX = "http://www.nlm.nih.gov/research/umls/rxnorm", NDC = "http://hl7.org/fhir/sid/ndc", UCUM = "http://unitsofmeasure.org";
const NOW = new Date("2026-11-24T12:00:00Z");
const PATIENT = { name: "Avery Brownbag", birthDate: "1950-03-14" };
const BASE = "https://burroclurse.github.io/BrownBag/";
const DOSAGE = { sequence: 1, route: { text: "Oral", coding: [{ system: "http://snomed.info/sct", code: "26643006" }] }, timing: { repeat: { frequency: 2, period: 1, periodUnit: "d" } }, doseAndRate: [{ type: { text: "ordered" }, doseQuantity: { value: 1, unit: "tablet", system: UCUM, code: "{tbl}" } }] };
const med = (o) => fromMedicationRequest(Object.assign({ resourceType: "MedicationRequest", status: "active", authoredOn: "2026-09-01", medicationCodeableConcept: { text: "lisinopril 10 MG", coding: [{ system: NDC, code: "00093-1111-01" }, { system: RX, code: "314076" }, { system: "http://snomed.info/sct", code: "386873009" }, { code: "none" }] }, dosageInstruction: [DOSAGE] }, o), "SMART sandbox");
const list = (current, o) => Object.assign({ patient: PATIENT, current, additions: [], stopped: [] }, o);
const first = (item, level = 2) => buildShareBundle(list([item]), NOW, {}, level).entry[1].resource;
const directions = (dosage) => { const { text, ...rest } = first(med({ dosageInstruction: [dosage] })).dosage[0]; return rest; };

test("the record's RxNorm and NDC codes travel, RxNorm first, and no others", () => {
  assert.deepEqual(first(med()).medicationCodeableConcept.coding, [{ system: RX, code: "314076" }, { system: NDC, code: "00093-1111-01" }]);
  assert.deepEqual(first(med(), 1).medicationCodeableConcept.coding, [{ system: RX, code: "314076" }]);
  const onlyNdc = med({ medicationCodeableConcept: { text: "x", coding: [{ system: NDC, code: "1" }] } });
  assert.deepEqual(first(onlyNdc).medicationCodeableConcept.coding, [{ system: NDC, code: "1" }]);
  assert.equal(first(onlyNdc, 1).medicationCodeableConcept.coding, undefined);
});

test("coded directions travel beside the same words as before", () => {
  const d = first(med()).dosage[0];
  assert.deepEqual(d.timing.repeat, { frequency: 2, period: 1, periodUnit: "d" });
  assert.deepEqual(d.doseAndRate, [{ doseQuantity: { value: 1, unit: "tablet", system: UCUM, code: "{tbl}" } }]);
  assert.deepEqual(d.route, { text: "Oral" });
  for (const level of [0, 1]) assert.equal(first(med(), level).dosage[0].text, d.text);
  assert.equal(first(med(), 0).dosage[0].timing.repeat, undefined);
  assert.equal(first(med(), 0).dosage[0].doseAndRate, undefined);
  assert.equal(first(med({ dosageInstruction: [{ asNeededBoolean: true, text: "x" }] })).dosage[0].asNeededBoolean, true);
  assert.equal(first(med({ dosageInstruction: [{ asNeededBoolean: false, text: "x" }] })).dosage[0].asNeededBoolean, undefined);
});

// Part of a direction can mean something else, so it's all or nothing.
test("anything else in the direction means no coded directions", () => {
  const rep = (o) => Object.assign({}, DOSAGE, { timing: { repeat: Object.assign({}, DOSAGE.timing.repeat, o) } });
  const odd = [rep({ frequencyMax: 3 }), rep({ periodMax: 2 }), rep({ count: 2 }), rep({ boundsPeriod: { start: "2026-01-01" } }), rep({ dayOfWeek: ["mon"] }), rep({ timeOfDay: ["09:00:00"] }), rep({ offset: 5 }), rep({ extension: [{}] }),
    Object.assign({}, DOSAGE, { patientInstruction: "Skip on dialysis days" }), Object.assign({}, DOSAGE, { timing: { repeat: DOSAGE.timing.repeat, code: { text: "Except Sunday" } } }), Object.assign({}, DOSAGE, { timing: { repeat: DOSAGE.timing.repeat, code: { coding: [{ code: "QD" }] } } }),
    Object.assign({}, DOSAGE, { asNeededCodeableConcept: { text: "pain" } }), Object.assign({}, DOSAGE, { maxDosePerPeriod: {} }), Object.assign({}, DOSAGE, { modifierExtension: [{}] }), Object.assign({}, DOSAGE, { method: { text: "Inject" } }), Object.assign({}, DOSAGE, { additionalInstruction: [{ text: "with food" }] }),
    Object.assign({}, DOSAGE, { doseAndRate: [{ doseQuantity: { value: 1 } }, { doseQuantity: { value: 2 } }] }), Object.assign({}, DOSAGE, { doseAndRate: [{ doseRange: { low: { value: 1 } } }] }), Object.assign({}, DOSAGE, { doseAndRate: [{ doseQuantity: { value: 1, comparator: "<" } }] }), Object.assign({}, DOSAGE, { doseAndRate: [{ doseQuantity: { value: "1" } }] }),
    Object.assign({}, DOSAGE, { timing: { event: ["2026-01-01"] } }), rep({ frequency: "2" }), rep({ period: 0 }), rep({ periodUnit: "x" }), rep({ when: ["XX"] })];
  for (const dosage of odd) {
    const d = directions(dosage);
    assert.equal(d.doseAndRate, undefined, JSON.stringify(dosage));
    assert.equal(d.timing && d.timing.repeat, undefined, JSON.stringify(dosage));
  }
  // A code that says the same is fine.
  assert.ok(directions(Object.assign({}, DOSAGE, { timing: { repeat: DOSAGE.timing.repeat, code: { coding: [{ code: "BID" }] } } })).timing.repeat);
  const two = first(med({ dosageInstruction: [DOSAGE, DOSAGE] })).dosage[0];
  assert.equal(two.doseAndRate, undefined);
  assert.equal(two.timing && two.timing.repeat, undefined);
});

test("only the shown record's codes travel, never two records' mixed", () => {
  const one = dedupe([med(), med({ authoredOn: "2026-10-01", medicationCodeableConcept: { text: "lisinopril 10 MG", coding: [{ system: RX, code: "314076" }, { system: NDC, code: "newer" }] }, dosageInstruction: [{ text: "1 daily" }] })])[0];
  const resource = first(one);
  assert.deepEqual(resource.medicationCodeableConcept.coding.map((c) => c.code), ["314076", "newer"]);
  assert.equal(resource.dosage[0].timing && resource.dosage[0].timing.repeat, undefined);
});

test("a medicine the patient takes as needed keeps no schedule in codes", () => {
  const d = first(Object.assign(med(), { asNeededAt: "2026-11-20" })).dosage[0];
  assert.equal(d.asNeededBoolean, true);
  assert.equal(d.timing && d.timing.repeat, undefined);
});

test("the record's own status travels when it isn't plainly active", () => {
  const statement = (status) => fromMedicationStatement({ resourceType: "MedicationStatement", status, medicationCodeableConcept: { text: "x" } }, "S");
  assert.equal(first(statement("intended")).status, "intended");
  assert.equal(first(statement("unknown")).status, "unknown");
  assert.equal(first(statement("active")).status, "active");
  assert.equal(first(Object.assign(med({ status: "completed" }), { completedButFilled: "2026-10-01" })).status, "unknown");
  assert.equal(first({ name: "sertraline", rxcui: "312941", origin: "claims", source: "Aetna claims", fills: { count: 1, last: "2026-10-22", insurers: ["Aetna"], cash: false } }).status, "unknown");
});

test("units the patient picked carry their UCUM code, saved ones too", () => {
  const unit = (quantity, level = 2) => buildShareBundle(list([], { additions: [makeAddition({ name: "Vitamin D", dose: "1 x", quantity }, NOW)] }), NOW, {}, level).entry[1].resource.dosage[0].doseAndRate[0].doseQuantity;
  for (const [word, code] of [["tablet", "{tbl}"], ["capsule", "{capsule}"], ["drop", "[drp]"], ["puff", "{puff}"], ["spray", "{spray}"], ["patch", "{patch}"], ["suppository", "{suppository}"], ["lozenge", "{lozenge}"], ["scoop", "{scoop}"]]) {
    assert.deepEqual(unit({ value: 1, unit: word }), { value: 1, unit: word, system: UCUM, code });
  }
  assert.deepEqual(unit({ value: 5, unit: "mL", system: UCUM, code: "mL" }), { value: 5, unit: "mL", system: UCUM, code: "mL" });
  assert.deepEqual(unit({ value: 1, unit: "tablet" }, 0), { value: 1, unit: "tablet" });
});

test("staff read the same words at every level, and a list saved before this", () => {
  const before = med(); delete before.fhir;
  const rows = (item, level) => groupShareBundle(JSON.parse(JSON.stringify(buildShareBundle(list([item]), NOW, {}, level)))).fromRecords;
  for (const level of [0, 1, 2]) assert.deepEqual(rows(med(), level), rows(med(), 0));
  assert.deepEqual(rows(before, 2), rows(med(), 0));
});

const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../vendor/qrcode-generator-1.4.4.js", import.meta.url), "utf8") + ";this.make=qrcode", ctx);
async function squares(bundle) {
  const packed = await packShare(bundle, BASE);
  const qr = ctx.make(0, "M"); qr.addData(packed.prefix, "Byte"); qr.addData(packed.digits, "Numeric"); qr.make();
  return qr.getModuleCount();
}
// Names that don't shrink, so each size is reached with few medicines.
function many(count) {
  let seed = 7; const word = () => Array.from({ length: 16 }, () => { seed = (seed * 1103515245 + 12345) % 2147483648; return "abcdefghijklmnopqrstuvwxyz"[seed % 26]; }).join("");
  return Array.from({ length: count }, (_, i) => med({ medicationCodeableConcept: { text: word(), coding: [{ system: RX, code: String(100000 + i * 7919) }, { system: NDC, code: String(10000000000 + i * 7919131) }] } }));
}

test("codes are dropped before the code gets too dense, and a medicine never is", async () => {
  const seen = new Set(), levels = [];
  let widest = 0;
  for (const count of [1, 10, 20, 25, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 44, 50]) {
    const l = list(many(count));
    const bundle = await shareBundleFor(l, NOW, {}, BASE);
    const meds = bundle.entry.filter((e) => e.resource.resourceType === "MedicationStatement").map((e) => e.resource);
    assert.equal(meds.length, count);
    const level = meds.some((m) => (m.medicationCodeableConcept.coding || []).some((c) => c.system === NDC)) ? 2 : meds.some((m) => m.dosage[0].timing.repeat) ? 1 : 0;
    seen.add(level); levels.push(count + ":" + level);
    if (level) {
      const across = await squares(bundle);
      assert.ok(across <= 161, count + " medicines");
      widest = Math.max(widest, across);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(bundle)), JSON.parse(JSON.stringify(buildShareBundle(l, NOW, {}, level))));
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2], levels.join(" "));
  // The limit is 161 itself, not the size under it.
  assert.equal(widest, 161, levels.join(" "));
});
