import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { doseChoices, FREQUENCY_CHOICES } from "../js/add-choices.js";

test("tablets get halves up to four", () => {
  assert.deepEqual(doseChoices("lisinopril 10 MG Oral Tablet").map((c) => c.label), ["½ tablet", "1 tablet", "1½ tablets", "2 tablets", "3 tablets", "4 tablets"]);
  assert.deepEqual(doseChoices("lisinopril 10 MG Oral Tablet")[2].quantity, { value: 1.5, unit: "tablet" });
});

test("capsules, suppositories and lozenges use their own word", () => {
  assert.equal(doseChoices("amoxicillin 500 MG Oral Capsule")[1].label, "1 capsule");
  assert.equal(doseChoices("acetaminophen 650 MG Rectal Suppository")[3].label, "2 suppositories");
  assert.equal(doseChoices("benzocaine 15 MG Oral Lozenge")[1].label, "1 lozenge");
});

test("liquids are in mL with the UCUM unit", () => {
  const c = doseChoices("amoxicillin 250 MG/5ML Oral Suspension");
  assert.deepEqual(c.map((x) => x.label), ["2.5 mL", "5 mL", "7.5 mL", "10 mL", "15 mL", "20 mL"]);
  assert.deepEqual(c[1].quantity, { value: 5, unit: "mL", system: "http://unitsofmeasure.org", code: "mL" });
});

test("inhalers puff, nose sprays spray, eye drops drop, patches stick", () => {
  assert.equal(doseChoices("albuterol 0.09 MG/ACTUAT Metered Dose Inhaler")[1].label, "2 puffs");
  assert.equal(doseChoices("fluticasone 0.05 MG/ACTUAT Nasal Spray")[0].label, "1 spray");
  assert.deepEqual(doseChoices("latanoprost 0.05 MG/ML Ophthalmic Solution").map((x) => x.label), ["1 drop", "2 drops", "3 drops"]);
  assert.deepEqual(doseChoices("nicotine 14 MG/24HR Transdermal System").map((x) => x.label), ["1 patch"]);
});

test("creams get one choice with no amount", () => {
  assert.deepEqual(doseChoices("hydrocortisone 10 MG/ML Topical Cream"), [{ label: "Apply a thin layer", quantity: null }]);
});

test("typed names and other forms get the general list", () => {
  assert.deepEqual(doseChoices(null).map((x) => x.label), ["1 tablet", "1 capsule", "5 mL", "1 scoop"]);
  assert.deepEqual(doseChoices("insulin glargine 100 UNT/ML Injectable Solution").map((x) => x.label), ["1 tablet", "1 capsule", "5 mL", "1 scoop"]);
});

test("how often has the choices in order, as FHIR timing", () => {
  assert.deepEqual(FREQUENCY_CHOICES.map((c) => c.label), ["Once a day", "Twice a day", "3 times a day", "4 times a day", "At bedtime", "Every other day", "Once a week", "As needed"]);
  assert.deepEqual(FREQUENCY_CHOICES[1].schedule, { frequency: 2, period: 1, periodUnit: "d" });
  assert.deepEqual(FREQUENCY_CHOICES[4].schedule, { frequency: 1, period: 1, periodUnit: "d", when: ["HS"] });
  assert.deepEqual(FREQUENCY_CHOICES[5].schedule, { frequency: 1, period: 2, periodUnit: "d" });
  assert.deepEqual(FREQUENCY_CHOICES[6].schedule, { frequency: 1, period: 1, periodUnit: "wk" });
  assert.deepEqual(FREQUENCY_CHOICES[7].schedule, { asNeeded: true });
});

test("the lists are kept for offline use", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/add-choices.js"'));
});
