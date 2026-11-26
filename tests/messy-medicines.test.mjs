// How real sources write medicines (docs/superpowers/research/2026-11-25-
// messy-data-findings.md, "Fixtures to build" 1-32), with the developer's answers:
// the most specific product code, release type and salt are part of the form,
// and IPS "no medication" entries are left out and said. A wrong join (two
// medicines shown as one) is the dangerous failure; a wrong split is safe. If
// a test here starts failing because more join, check nothing different joined.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromMedicationRequest, fromMedicationStatement, strengthOf, strengthsOf, formOf, isPlaceholderDrug, formatDosage } from "../js/meds.js";
import { listFromSearch } from "../js/med-list.js";
import { ingredientsFor, rxcuiForNdc } from "../js/rxnorm.js";
import { matchOf, isWeekly, verdictsFor, reconcile } from "../js/reconcile.js";
import { fillsFromClaims, attachFills, readClaims } from "../js/claims.js";
import { snapshotSource } from "../js/snapshot.js";
import { demoSource } from "../js/demo-source.js";
import { arrangeList, emptyRecordsText, sourceNotices, medicinesPartial } from "../js/view.js";
import { splitToSave, splitFromSaved } from "../js/offline.js";
import { buildShareBundle, groupShareBundle, medicineNotices, emptyPartText, medicinesTitle } from "../js/share.js";
import { patientSummary } from "../js/ips.js";

const fixture = (name) => JSON.parse(readFileSync(new URL("./fixtures/messy/medicines/" + name + ".json", import.meta.url), "utf8"));
const RXNAV = fixture("rxnav");
const CODES = fixture("codes");
const FORMS = fixture("forms");
const DOSES = fixture("doses");
const REFS = fixture("references");
const PLACEHOLDERS = fixture("placeholders");
const NONE = fixture("ips-none");
const CLAIMS = fixture("claims");

const RX = "http://www.nlm.nih.gov/research/umls/rxnorm";
const NOW = new Date("2026-11-25T12:00:00Z");
const PATIENT = { resourceType: "Patient", name: [{ family: "Example", given: ["Pat"] }], birthDate: "1960-01-01" };

// RxNav as it answered (fixtures/messy/medicines/rxnav.json). down: codes
// whose history lookup fails, as on a weak connection.
function rxnav({ down = [] } = {}) {
  const calls = [];
  const answer = (body) => ({ ok: true, json: async () => body });
  const concepts = (pairs, tty) => pairs.map(([rxcui, name]) => ({ rxcui, name, tty }));
  const fn = async (url) => {
    calls.push(url);
    let found = /\/rxcui\/(\d+)\/(related|historystatus)\.json/.exec(url);
    if (found) {
      const code = found[1];
      const known = RXNAV[code];
      if (found[2] === "historystatus" && down.includes(code)) throw new TypeError("Failed to fetch");
      if (!known) return answer(found[2] === "related" ? { relatedGroup: { conceptGroup: [{ tty: "IN" }, { tty: "PIN" }] } } : {});
      if (found[2] === "related") {
        return answer({ relatedGroup: { conceptGroup: [{ tty: "IN", conceptProperties: concepts(known.in, "IN") }, { tty: "PIN", conceptProperties: concepts(known.pin, "PIN") }] } });
      }
      return answer({ rxcuiStatusHistory: {
        metaData: { status: known.status || "Active" },
        attributes: { rxcui: code, name: known.name, tty: known.tty },
        derivedConcepts: known.remapped ? { remappedConcept: known.remapped.map(([c, tty, active]) => ({ remappedRxCui: c, remappedTTY: tty, remappedActive: active })) } : {}
      } });
    }
    found = /ndcstatus\.json\?ndc=([^&]+)/.exec(url);
    if (found) return answer({ ndcStatus: RXNAV.ndc[decodeURIComponent(found[1])] || { status: "UNKNOWN" } });
    throw new Error("no route for " + url);
  };
  fn.calls = calls;
  return fn;
}

const asRequests = (records) => ({ MedicationRequest: records, MedicationStatement: [] });
const asStatements = (records) => ({ MedicationRequest: [], MedicationStatement: records });

async function source(id, name, results, fetchFn = rxnav()) {
  return { id, name, kind: "records", refreshes: true, patient: PATIENT, split: await listFromSearch(results, name, fetchFn) };
}

// Joins sources the way loadFresh does, with every source's codes looked up.
async function joined(sources, fetchFn = rxnav()) {
  const map = new Map();
  sources.forEach((one) => (one.split.ingredientOf || new Map()).forEach((value, code) => map.set(code, value)));
  const missing = sources.flatMap((one) => one.split.current.concat(one.split.older)).map((item) => item.rxcui).filter((code) => code && !map.has(code));
  if (missing.length) (await ingredientsFor(missing, fetchFn)).forEach((value, code) => map.set(code, value));
  return Object.assign(reconcile(sources, map), { ingredientOf: map });
}

const cardsOf = (split) => split.current.concat(split.older);
const named = (split, words) => cardsOf(split).filter((card) => card.name.toLowerCase().includes(words));
const request = (name, code, more = {}) => fromMedicationRequest(Object.assign({ resourceType: "MedicationRequest", status: "active", authoredOn: "2026-01-01", medicationCodeableConcept: { text: name, coding: code ? [{ system: RX, code }] : [] } }, more), "S");
const typesFor = async (codes) => {
  const types = new Map();
  await ingredientsFor(codes, rxnav(), { types });
  return types;
};

// 1
test("case 1: Epic's Excedrin and a Tylenol in one source stay two lines", async () => {
  const split = await listFromSearch(asRequests(CODES.epicExcedrinAndTylenol), "Epic", rxnav());
  const cards = cardsOf(split);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => card.key).sort(), ["rx:198440", "rx:308297"]);
  assert.ok(cards.every((card) => card.count === 1));
});

// 2
test("case 2: the same Excedrin from two sources joins by its product code, never by acetaminophen", async () => {
  const epic = await source("epic", "Epic", asRequests(CODES.epicExcedrinAndTylenol));
  const pharmacy = await source("pharmacy", "Pharmacy", asRequests(CODES.pharmacyExcedrin.concat(CODES.pharmacyTylenol)));
  const list = await joined([epic, pharmacy]);
  assert.equal(cardsOf(list).length, 2);
  const excedrin = cardsOf(list).find((card) => card.rxcui === "308297");
  assert.deepEqual(excedrin.group.sources, ["Epic", "Pharmacy"]);
  const tylenol = cardsOf(list).find((card) => card.rxcui === "198440");
  assert.deepEqual(tylenol.group.sources, ["Epic", "Pharmacy"]);
});

// 3
test("case 3: the most specific product code is the record's code", async () => {
  const types = await typesFor(["6918", "866412", "866414"]);
  const recordWith = (concept, extra) => fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", medicationCodeableConcept: concept }, "S", new Map(), extra);
  assert.equal(recordWith(CODES.ingredientThenProduct, types).rxcui, "866412");
  const brand = recordWith(CODES.brandThenGeneric, types);
  assert.equal(brand.rxcui, "866412");
  assert.equal(matchOf(brand, recordWith({ coding: [{ system: RX, code: "866412" }] }, types), new Map()), "rxcui");
  // Without RxNav, only a coding whose name reads as a product (a strength
  // and a form) counts; any other is an ingredient's.
  assert.equal(recordWith(CODES.ingredientThenProduct).rxcui, "866412");
  assert.equal(recordWith({ coding: [{ system: RX, code: "29046", display: "Lisinopril" }] }).ingredientOnly, true);
  assert.equal(recordWith({ coding: [{ system: RX, code: "316672", display: "Simvistatin 10 MG" }] }).ingredientOnly, true);
  assert.equal(recordWith({ coding: [{ system: RX, code: "749882", display: "Norinyl 1+50 28 Day Pack" }] }).ingredientOnly, true);
  // The one the prescriber picked wins.
  const picked = { coding: [CODES.brandThenGeneric.coding[0], Object.assign({ userSelected: true }, CODES.brandThenGeneric.coding[1])] };
  assert.equal(recordWith(picked, types).rxcui, "866412");
  const pickedBrand = { coding: [Object.assign({ userSelected: true }, CODES.brandThenGeneric.coding[0]), CODES.brandThenGeneric.coding[1]] };
  assert.equal(recordWith(pickedBrand, types).rxcui, "866414");
  // Only an ingredient: no code to join by, a text key, and at most name-only.
  const onlyIngredient = recordWith({ coding: [CODES.ingredientThenProduct.coding[0]] }, types);
  assert.equal(onlyIngredient.rxcui, null);
  assert.equal(onlyIngredient.ingredientOnly, true);
  assert.equal(onlyIngredient.key, "text:metoprolol|6918");
  assert.equal(matchOf(onlyIngredient, recordWith({ coding: [CODES.ingredientThenProduct.coding[0]] }, types), new Map()), "name-only");
});

test("case 3, offline: an Epic ingredient code with no name never becomes the record's code", () => {
  const offline = (coding, text) => fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", medicationCodeableConcept: { text, coding } }, "S");
  const excedrin = offline([{ system: RX, code: "161" }, { system: RX, code: "308297", display: "acetaminophen 250 MG / aspirin 250 MG / caffeine 65 MG Oral Tablet" }]);
  assert.equal(excedrin.rxcui, "308297");
  const alone = offline([{ system: RX, code: "161" }], "aspirin-acetaminophen-caffeine (EXCEDRIN MIGRAINE) 250-250-65 MG per tablet");
  assert.equal(alone.rxcui, null);
  assert.equal(alone.ingredientOnly, true);
  // So it can't join a Tylenol coded the same way.
  const tylenol = offline([{ system: RX, code: "161" }, { system: RX, code: "198440" }], "acetaminophen (TYLENOL) 500 MG tablet");
  assert.equal(matchOf(alone, tylenol, new Map()), null);
  assert.notEqual(alone.key, tylenol.key);
});

// 4
test("case 4: bupropion SR and XL stay apart, each saying it may be the other", async () => {
  const one = await source("a", "Clinic A", asRequests([FORMS.bupropionSr]));
  const two = await source("b", "Clinic B", asRequests([FORMS.bupropionXl]));
  const list = await joined([one, two]);
  assert.equal(cardsOf(list).length, 2);
  assert.ok(named(list, "12 hr")[0].group.notes.includes("Possible duplicate of " + FORMS.bupropionXl.medicationCodeableConcept.coding[0].display));
  assert.ok(named(list, "24 hr")[0].group.notes.includes("Possible duplicate of " + FORMS.bupropionSr.medicationCodeableConcept.coding[0].display));
});

// 5
test("case 5: diltiazem 12 HR and 24 HR capsules stay apart with a note", async () => {
  const list = await joined([await source("a", "Clinic A", asRequests([FORMS.diltiazem12])), await source("b", "Clinic B", asRequests([FORMS.diltiazem24]))]);
  assert.equal(cardsOf(list).length, 2);
  assert.ok(cardsOf(list).every((card) => card.group && card.group.notes.some((note) => note.indexOf("Possible duplicate of") === 0)));
});

// 6
test("case 6: eye drops and tablets of one ingredient, with no form in the name, stay apart", async () => {
  const list = await joined([await source("a", "Clinic A", asRequests([FORMS.dexamethasoneEye])), await source("b", "Clinic B", asRequests([FORMS.dexamethasoneOral]))]);
  assert.equal(cardsOf(list).length, 2);
  assert.equal(matchOf(named(list, "ophthalmic")[0], named(list, "oral")[0], list.ingredientOf), "form");
});

// 7
test("case 7: Epic's XL before the strength keeps succinate apart from tartrate", async () => {
  assert.notEqual(formOf("metoprolol tartrate (LOPRESSOR) 25 MG tablet"), formOf("metoprolol succinate XL (TOPROL-XL) 25 MG tablet"));
  const list = await joined([await source("a", "Clinic A", asRequests([FORMS.lopressorEpic])), await source("b", "Clinic B", asRequests([FORMS.toprolEpic]))]);
  assert.equal(cardsOf(list).length, 2);
  assert.equal(matchOf(named(list, "tartrate")[0], named(list, "succinate")[0], list.ingredientOf), "form");
});

// 8
test("case 8: Cerner's ingredient-only lisinopril at two strengths stays two lines", async () => {
  const split = await listFromSearch(asRequests(CODES.cernerLisinopril), "Cerner", rxnav());
  assert.equal(split.current.length, 2);
  assert.deepEqual(split.current.map((card) => card.dose).sort(), ["40 mg", "5 mg"]);
  assert.ok(split.current.every((card) => card.ingredientOnly && card.rxcui === null));
  // Never joined by code to another source's lisinopril, only noted.
  const other = await source("b", "Clinic B", asRequests([{ resourceType: "MedicationRequest", id: "l10", status: "active", authoredOn: "2026-01-01", medicationCodeableConcept: { coding: [{ system: RX, code: "314076", display: "lisinopril 10 MG Oral Tablet" }] } }]));
  const list = await joined([{ id: "cerner", name: "Cerner", kind: "records", refreshes: true, patient: PATIENT, split }, other]);
  assert.equal(cardsOf(list).length, 3);
  assert.ok(named(list, "10 mg")[0].group.notes.every((note) => note.indexOf("May be the same medicine as") === 0));
});

// 9
test("case 9: text-only names join on the same words, but tartrate and succinate stay apart", () => {
  const [plain, mixed, tartrate, succinate] = FORMS.faers;
  assert.equal(matchOf(request(plain), request(mixed), new Map()), "name");
  assert.equal(matchOf(request(tartrate), request(succinate), new Map()), "name-only");
});

// 10
test("case 10: FAERS's trailing dot still gets a note", () => {
  assert.equal(matchOf(request(FORMS.faers[4]), request(FORMS.faers[0]), new Map()), "name-only");
});

// 11
test("case 11: a succinate fill doesn't bring back a finished tartrate prescription", async () => {
  const split = await listFromSearch(asRequests([CLAIMS.tartrateRecord]), "Clinic", rxnav());
  const fill = { rxcui: CLAIMS.succinateFill.code, name: CLAIMS.succinateFill.display, date: CLAIMS.succinateFill.date, insurer: "Test Health Plan", cash: false };
  const map = new Map(split.ingredientOf);
  (await ingredientsFor([fill.rxcui], rxnav())).forEach((value, code) => map.set(code, value));
  const out = attachFills(split, [fill], map, NOW);
  assert.equal(out.older.length, 1);
  assert.equal(out.older[0].rxcui, "866924");
  assert.equal(out.older[0].fills.count, 0);
  assert.equal(out.current.length, 1);
  assert.equal(out.current[0].origin, "claims");
});

// 12
test("case 12: an eye drop fill doesn't bring back finished dexamethasone tablets", async () => {
  const split = await listFromSearch(asRequests([CLAIMS.oralDexamethasone]), "Clinic", rxnav());
  const fill = { rxcui: CLAIMS.eyeDropFill.code, name: CLAIMS.eyeDropFill.display, date: CLAIMS.eyeDropFill.date, insurer: "Test Health Plan", cash: false };
  const map = new Map(split.ingredientOf);
  (await ingredientsFor([fill.rxcui], rxnav())).forEach((value, code) => map.set(code, value));
  const out = attachFills(split, [fill], map, NOW);
  assert.equal(out.older.length, 1);
  assert.equal(out.older[0].fills.count, 0);
  assert.equal(out.current[0].origin, "claims");
});

// 13
test("case 13: weekly in words is weekly, and against daily it's how often", () => {
  DOSES.weekly.forEach((words) => assert.equal(isWeekly({ frequency: words }), true, words));
  DOSES.notWeekly.forEach((words) => assert.equal(isWeekly({ frequency: words }), false, words));
  const daily = { kind: "request", recordStatus: "active", status: "current", name: "methotrexate 2.5 MG Oral Tablet", frequency: "Take 6 tablets once a day" };
  DOSES.weekly.slice(0, 11).forEach((words) => {
    assert.ok(verdictsFor([daily, Object.assign({}, daily, { frequency: words })]).includes("schedule"), words);
  });
});

// 14
test("case 14: .5 mg is half a milligram, not 5", () => {
  const [half, five] = DOSES.lorazepam;
  assert.equal(strengthOf(half), "0.5 MG");
  const side = (name) => ({ kind: "request", recordStatus: "active", status: "current", name });
  assert.deepEqual(verdictsFor([side(half), side(five)]), ["dose"]);
});

// 15
test("case 15: 1,000 mg is a thousand", () => {
  assert.equal(strengthOf(DOSES.metformin), "1000 MG");
  assert.deepEqual(strengthsOf(DOSES.metformin), ["1000 MG"]);
});

// 16
test("case 16: micrograms however they're spelled", () => {
  const side = (name) => ({ kind: "request", recordStatus: "active", status: "current", name });
  DOSES.micrograms.forEach((name) => {
    assert.equal(strengthOf(name).replace(/\s+/g, ""), "88MCG", name);
    assert.deepEqual(verdictsFor([side(name), side(DOSES.microgramsAgainst.same)]), [], name);
    assert.deepEqual(verdictsFor([side(name), side(DOSES.microgramsAgainst.different)]), ["dose"], name);
  });
});

// 17
test("case 17: units however they're spelled are one unit", () => {
  DOSES.units.forEach(([name, strength]) => assert.equal(strengthOf(name).replace(/\s+/g, ""), strength.replace(/\s+/g, ""), name));
});

// 18
test("case 18: a coded dose in ug is the same as one tablet of 0.088 MG", () => {
  const coded = (dosage) => fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", medicationCodeableConcept: { text: DOSES.codedMicrograms.name }, dosageInstruction: [dosage] }, "S");
  assert.deepEqual(verdictsFor([coded(DOSES.codedMicrograms.inMicrograms), coded(DOSES.codedMicrograms.inTablets)]), []);
});

// 19
test("case 19: a coded mg/kg beside words that say mg isn't shown as the dose", () => {
  const dosage = formatDosage([DOSES.epicMgPerKg]);
  assert.equal(dosage.dose, null);
  assert.equal(dosage.frequency, DOSES.epicMgPerKg.text);
  // A coded dose the words agree with still shows.
  assert.equal(formatDosage([{ text: "Take 100 mg by mouth daily", doseAndRate: [{ doseQuantity: { value: 100, unit: "mg" } }] }]).dose, "100 mg");
});

// 20
test("case 20: 250-250-65 MG is three strengths, the same as RxNorm's", () => {
  const [epic, rxnorm] = DOSES.combination;
  assert.deepEqual(strengthsOf(epic), ["250 MG", "250 MG", "65 MG"]);
  const side = (name) => ({ kind: "request", recordStatus: "active", status: "current", name });
  assert.deepEqual(verdictsFor([side(epic), side(rxnorm)]), []);
});

// 21
test("case 21: a contained Medication names the record", async () => {
  const split = await listFromSearch(asRequests(REFS.contained), "Clinic", rxnav());
  assert.equal(split.placeholders, 0);
  assert.equal(split.current[0].name, "lisinopril 10 MG Oral Tablet");
  assert.equal(split.current[0].rxcui, "314076");
});

// 22
test("case 22: an IPS's urn:uuid Medications name its statements", () => {
  const snapshot = snapshotSource(REFS.ipsStatements, "Summary");
  assert.equal(snapshot.split.placeholders, 0);
  assert.deepEqual(cardsOf(snapshot.split).map((card) => card.name).sort(), ["Cimicifuga", "anastrozole"]);
});

// 23
test("case 23: an IPS whose medicines are prescriptions lists them", () => {
  const snapshot = snapshotSource(REFS.ipsRequests, "Summary");
  assert.deepEqual(cardsOf(snapshot.split).map((card) => card.name).sort(), ["atorvastatin 20 MG Oral Tablet", "lisinopril 10 MG Oral Tablet"]);
  // An undated one is as old as the summary.
  assert.equal(named(snapshot.split, "atorvastatin")[0].start, "2026-10-01T10:00:00Z");
});

// 24
test("case 24: absolute and relative references both find their Medication", async () => {
  const split = await listFromSearch(asRequests(REFS.absolute), "Clinic", rxnav());
  assert.deepEqual(split.current.map((card) => card.rxcui).sort(), ["197361", "312961"]);
  assert.equal(split.placeholders, 0);
});

// 25
test("case 25: placeholder words aren't medicines", () => {
  PLACEHOLDERS.placeholders.forEach((name) => assert.equal(isPlaceholderDrug(request(name)), true, name));
  PLACEHOLDERS.realNames.forEach((name) => assert.equal(isPlaceholderDrug(request(name)), false, name));
});

// 26
test("case 26: a remapped code joins the code it became; without the lookup, a note stays", async () => {
  const old = () => asStatements(CODES.amantadineOld);
  const list = await joined([await source("a", "Old clinic", old()), await source("b", "New clinic", asRequests(CODES.amantadineNew))]);
  assert.equal(cardsOf(list).length, 1);
  assert.deepEqual(cardsOf(list)[0].group.sources, ["Old clinic", "New clinic"]);
  const offline = rxnav({ down: ["105048"] });
  const apart = await joined([await source("a", "Old clinic", old(), offline), await source("b", "New clinic", asRequests(CODES.amantadineNew), offline)], offline);
  assert.equal(cardsOf(apart).length, 2);
  assert.ok(cardsOf(apart).every((card) => card.group.notes.some((note) => /^(May be the same medicine as|Possible duplicate of) /.test(note))));
});

// 27
test("case 27: a repackager's NDC is looked up in RxNav, not guessed", async () => {
  const fetchFn = rxnav();
  assert.equal(await rxcuiForNdc(CLAIMS.repackagerNdc, "2026-10-01", fetchFn), "866427");
  assert.ok(fetchFn.calls[0].indexOf("https://rxnav.nlm.nih.gov/REST/ndcstatus.json?ndc=") === 0);
});

// 28
test("case 28: an NDC means the code it had on the fill's date", async () => {
  assert.equal(await rxcuiForNdc(CLAIMS.changedNdc, "2010-03-15", rxnav()), "308416");
  assert.equal(await rxcuiForNdc(CLAIMS.changedNdc, "2012-06-01", rxnav()), "243670");
});

// 29
test("case 29: CARIN's package sentence is cut to the product, so two packages are one card", () => {
  const eob = (display) => Object.assign({}, CLAIMS.carinEob, { item: [Object.assign({}, CLAIMS.carinEob.item[0], { productOrService: { coding: [{ system: "http://hl7.org/fhir/sid/ndc", code: display.match(/\(([\d-]+)\)/)[1], display }] } })] });
  const fills = fillsFromClaims(CLAIMS.carinPackages.map(eob));
  assert.deepEqual(fills.map((fill) => fill.name), ["Prozac", "Prozac"]);
  const out = attachFills({ current: [], older: [] }, fills, new Map(), new Date("2019-12-01T12:00:00Z"));
  assert.equal(out.current.length, 1);
  assert.equal(out.current[0].fills.count, 2);
});

test("case 29: an NDC-only fill gets its RxNorm code from RxNav by its date", async () => {
  const bundle = { resourceType: "Bundle", entry: [{ resource: CLAIMS.carinEob }] };
  const fetchFn = rxnav();
  const result = await readClaims(async () => bundle, "p", (codes) => ingredientsFor(codes, fetchFn), 2000, (ndc, date) => rxcuiForNdc(ndc, date, fetchFn));
  assert.equal(result.status, "loaded");
  assert.equal(result.fills[0].rxcui, "104849");
  assert.equal(result.fills[0].name, "Prozac");
});

// 30
test("case 30: a CARIN fill is dated by when it was filled, not billed", () => {
  assert.equal(fillsFromClaims([CLAIMS.carinEob])[0].date, "2019-07-02");
});

// 31
test("case 31: IPS no-medication-info is said, never a medicine and never none", async () => {
  const split = await listFromSearch(asStatements([NONE.noInfo]), "Summary", rxnav());
  assert.equal(cardsOf(split).length, 0);
  assert.equal(split.placeholders, 0);
  assert.deepEqual(split.noMedicines, [{ source: "Summary", kind: "no-info" }]);
  assert.ok(sourceNotices(split).includes("Summary has no information about your medicines."));
  const arranged = arrangeList(split, { additions: [], stopped: {} });
  assert.equal(emptyRecordsText(split, arranged), null);
  assert.equal(medicinesPartial({ split, data: { additions: [], stopped: {} } }), true);
  // Saved and opened again.
  assert.deepEqual(splitFromSaved(splitToSave(split)).noMedicines, split.noMedicines);
  // From an IPS file too.
  const snapshot = snapshotSource({ resourceType: "Bundle", type: "collection", timestamp: "2026-10-01T00:00:00Z", entry: [{ resource: NONE.noInfo }] }, "Discharge summary");
  assert.deepEqual(snapshot.split.noMedicines, [{ source: "Discharge summary", kind: "no-info" }]);
  assert.equal(cardsOf(snapshot.split).length, 0);
});

// 32
test("case 32: IPS no-known-medications is a statement, in the QR code as a tag, not a medicine", async () => {
  const split = await listFromSearch(asStatements([NONE.noneKnown, NONE.noneKnownByReference]), "Summary", rxnav());
  assert.equal(cardsOf(split).length, 0);
  assert.deepEqual(split.noMedicines, [{ source: "Summary", kind: "none-known" }]);
  assert.ok(sourceNotices(split).includes("Summary says: no medicines known."));
  const list = { patient: { name: "Pat Example", birthDate: "1960-01-01" }, current: [], additions: [], stopped: [] };
  const bundle = buildShareBundle(list, NOW, { noMedicines: split.noMedicines.concat([{ source: "Clinic", kind: "no-info" }]) });
  assert.ok(!bundle.entry.some((entry) => entry.resource.resourceType === "MedicationStatement"));
  assert.deepEqual(bundle.meta.tag.filter((tag) => tag.code === "no-medicines").map((tag) => tag.display), ["none-known:Summary", "no-info:Clinic"]);
  const groups = groupShareBundle(bundle);
  assert.deepEqual(groups.noMedicines, [{ source: "Summary", kind: "none-known" }, { source: "Clinic", kind: "no-info" }]);
  assert.deepEqual(medicineNotices(groups), ["Summary: no medicines known", "Clinic: no information about medicines"]);
  assert.equal(emptyPartText(groups, "records"), null);
  assert.equal(medicinesTitle(groups), "Medicines");
  // The FHIR file says it in its readable text, and nowhere says "null".
  const saveable = buildShareBundle(Object.assign({}, list, { allergies: { cards: [], statements: [], saidNone: null, unspecified: 0 } }), NOW, {
    claims: "loaded", noMedicines: split.noMedicines, allergies: { status: "loaded", savedAt: null, updatedAt: NOW.toISOString() }
  });
  let n = 0;
  const file = JSON.stringify(patientSummary(JSON.parse(JSON.stringify(saveable)), { now: NOW, uuid: () => "00000000-0000-4000-8000-" + String(n += 1).padStart(12, "0") }));
  assert.ok(file.includes("Summary: no medicines known"));
  assert.ok(!/null<\/p>|>null/.test(file));
});

test("a source that lists a medicine never also says it has none, anywhere", async () => {
  const lisinopril = REFS.contained[0];
  const split = await listFromSearch({ MedicationRequest: [lisinopril], MedicationStatement: [NONE.noInfo, NONE.noneKnown] }, "Summary", rxnav());
  assert.equal(split.current.length, 1);
  assert.deepEqual(split.noMedicines, []);
  assert.ok(!sourceNotices(split).some((line) => /no information|no medicines known/.test(line)));
  // An older one counts too: the source has spoken about the patient's medicines.
  const older = await listFromSearch({ MedicationRequest: [Object.assign({}, lisinopril, { status: "completed" })], MedicationStatement: [NONE.noInfo] }, "Summary", rxnav());
  assert.deepEqual(older.noMedicines, []);
  // Joined with others, in the QR code and on the staff page.
  const other = await source("b", "Clinic", asStatements([NONE.noneKnown]));
  const list = await joined([{ id: "a", name: "Summary", kind: "records", refreshes: true, patient: PATIENT, split }, other]);
  assert.deepEqual(list.noMedicines, [{ source: "Clinic", kind: "none-known" }]);
  const bundle = buildShareBundle({ patient: { name: "Pat Example", birthDate: "1960-01-01" }, current: list.current, additions: [], stopped: [] }, NOW, { noMedicines: list.noMedicines });
  assert.deepEqual(bundle.meta.tag.filter((tag) => tag.code === "no-medicines").map((tag) => tag.display), ["none-known:Clinic"]);
  assert.deepEqual(medicineNotices(groupShareBundle(bundle)), ["Clinic: no medicines known"]);
  // An IPS file and the test clinic follow the same rule.
  const document = { resourceType: "Bundle", type: "collection", timestamp: "2026-10-01T00:00:00Z", entry: [{ resource: NONE.noInfo }, { resource: CODES.pharmacyTylenol[0] }] };
  assert.deepEqual(snapshotSource(document, "Discharge summary").split.noMedicines, []);
  assert.deepEqual(demoSource({ patient: PATIENT, requests: CODES.pharmacyTylenol, statements: [NONE.noInfo] }, PATIENT, "").split.noMedicines, []);
});

test("the home server's test clinic can say it has no medicines too", () => {
  const clinic = demoSource({ patient: PATIENT, requests: [], statements: [NONE.noInfo] }, PATIENT, "");
  assert.deepEqual(clinic.split.noMedicines, [{ source: "Valley Clinic (test records)", kind: "no-info" }]);
  assert.equal(cardsOf(clinic.split).length, 0);
});

test("a second source's no-medicines entry reaches the joined list, and a kept-out one doesn't", async () => {
  const first = await source("a", "Clinic", asRequests(CODES.pharmacyTylenol));
  const second = await source("b", "Summary", asStatements([NONE.noInfo]));
  assert.deepEqual((await joined([first, second])).noMedicines, [{ source: "Summary", kind: "no-info" }]);
  const stranger = Object.assign({}, second, { patient: Object.assign({}, PATIENT, { birthDate: "1961-01-01" }) });
  assert.deepEqual((await joined([first, stranger])).noMedicines, []);
});

test("the list reader is kept for offline use", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/med-list.js"'));
});

test("an ingredient's own code has no salt, even without its term type", async () => {
  const map = await ingredientsFor(["6918", "866924"], rxnav());
  assert.equal(map.get("6918").salt, undefined);
  assert.deepEqual(map.get("866924").salt, { rxcui: "203191", name: "metoprolol tartrate" });
});

test("an RxNav answer that isn't JSON leaves that code out instead of failing the list", async () => {
  const fetchFn = async () => ({ ok: true, json: async () => null });
  assert.equal((await ingredientsFor(["866924"], fetchFn, { types: new Map() })).size, 0);
});

// Review, fix round 2 (2026-11-25).
test("release and salt words alone never make a form: eye drops, injections and tablets stay apart", async () => {
  const types = await typesFor(["1116927", "226343", "892582", "1728800"]);
  const map = await ingredientsFor(["1116927", "226343", "892582", "1728800"], rxnav());
  const record = (resource) => fromMedicationRequest(Object.assign({}, resource, { status: "active" }), "S", new Map(), types);
  assert.equal(matchOf(record(FORMS.dexamethasoneInjection), record(FORMS.dexamethasoneEyeSolution), map), "form");
  assert.equal(matchOf(record(FORMS.morphineTablet), record(FORMS.morphineInjection), map), "form");
  assert.equal(formOf("levothyroxine sodium"), null);
  assert.equal(formOf("potassium chloride 20 mEq ER tablet"), "er tablet");
  assert.equal(formOf("azaTHIOprine (IMURAN) tablet"), "tablet");
  // One source never folds them into one line.
  const split = await listFromSearch(asRequests([FORMS.dexamethasoneInjection, FORMS.dexamethasoneEyeSolution]), "Clinic", rxnav());
  assert.equal(cardsOf(split).length, 2);
  // Nor does an injection fill bring back finished tablets.
  const tablets = await listFromSearch(asRequests([FORMS.morphineTablet]), "Clinic", rxnav());
  const fill = { rxcui: "1728800", name: "morphine sulfate injection", date: "2026-10-01", insurer: "Test Health Plan", cash: false };
  const out = attachFills(tablets, [fill], map, NOW);
  assert.equal(out.older.length, 1);
  assert.equal(out.older[0].fills.count, 0);
});

test("a coded medicine with no name is shown, never dropped as a placeholder", async () => {
  const coded = (concept) => fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", medicationCodeableConcept: concept }, "S");
  const bare = coded({ coding: [{ system: RX, code: "197884" }] });
  assert.equal(isPlaceholderDrug(bare), false);
  assert.equal(bare.name, "Unnamed medicine (RxNorm 197884)");
  assert.equal(isPlaceholderDrug(coded({ coding: [{ system: RX, code: "29046" }] })), false);
  const placeholderText = coded({ text: "Medication", coding: [{ system: RX, code: "197884" }] });
  assert.equal(isPlaceholderDrug(placeholderText), false);
  assert.equal(placeholderText.name, "Unnamed medicine (RxNorm 197884)");
  assert.equal(coded({ text: "Medication", coding: [{ system: RX, code: "197884", display: "lisinopril 40 MG Oral Tablet" }] }).name, "lisinopril 40 MG Oral Tablet");
  // Still on the list, and in the QR code.
  const split = await listFromSearch(asRequests([{ resourceType: "MedicationRequest", status: "active", authoredOn: "2026-01-01", medicationCodeableConcept: { coding: [{ system: RX, code: "29046" }] } }]), "Clinic", rxnav());
  assert.equal(split.placeholders, 0);
  assert.equal(split.current.length, 1);
  const bundle = buildShareBundle({ patient: { name: "Pat Example", birthDate: "1960-01-01" }, current: split.current, additions: [], stopped: [] }, NOW, {});
  assert.equal(bundle.entry.filter((entry) => entry.resource.resourceType === "MedicationStatement").length, 1);
});

test("1 GM is a gram, so a tenfold dose is asked about", () => {
  assert.equal(strengthOf("cefazolin 1 GM injection"), "1 G");
  assert.equal(strengthOf("ceftriaxone 2 grams"), "2 G");
  const side = (name) => ({ kind: "request", recordStatus: "active", status: "current", name });
  assert.deepEqual(verdictsFor(FORMS.cefazolin.map(side)), ["dose"]);
});

test("part-level codes never join by code (R26)", async () => {
  const types = new Map([["1", { tty: "SCDF" }], ["2", { tty: "SCDG" }], ["3", { tty: "SBDF" }], ["4", { tty: "SBDG" }], ["5", { tty: "DF" }], ["6", { tty: "SCDGP" }], ["7", { tty: "SCDC" }]]);
  const coded = (code, text) => fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", medicationCodeableConcept: { text, coding: [{ system: RX, code }] } }, "S", new Map(), types);
  ["1", "2", "3", "4", "5", "6", "7"].forEach((code) => assert.equal(coded(code, "metoprolol 25 MG").ingredientOnly, true, code));
  // A strength-only code with words that name the form: the form decides.
  assert.equal(coded("7", "metoprolol tartrate 25 MG tablet").rxcui, "7");
  // Bupropion SR and XL, both coded SCDC "bupropion hydrochloride 150 MG".
  const split = await listFromSearch(asRequests([FORMS.bupropionSrScdc, FORMS.bupropionXlScdc]), "Clinic", rxnav());
  assert.equal(split.current.length, 2);
  const [sr, xl] = [named(split, "sr")[0], named(split, "xl")[0]];
  assert.notEqual(matchOf(sr, xl, split.ingredientOf), "rxcui");
  const across = await joined([await source("a", "Clinic A", asRequests([FORMS.bupropionSrScdc])), await source("b", "Clinic B", asRequests([FORMS.bupropionXlScdc]))]);
  assert.equal(cardsOf(across).length, 2);
  // SCDG "metoprolol Oral Product" doesn't make tartrate and succinate one.
  const metoprolol = await listFromSearch(asRequests([FORMS.metoprololTartrateScdg, FORMS.metoprololSuccinateScdg]), "Clinic", rxnav());
  assert.equal(cardsOf(metoprolol).length, 2);
  assert.ok(cardsOf(metoprolol).every((card) => card.ingredientOnly && card.rxcui === null));
});

test("each code is looked up once, a record stops at its first product, and 30 Epic medicines load in time", async () => {
  // 30 medicines the way Epic codes them: three ingredient codes shared
  // across the list, then SBD, SCD and MIN, with no names on the codes.
  const records = Array.from({ length: 30 }, (unused, i) => ({
    resourceType: "MedicationRequest", id: "m" + i, status: "active", authoredOn: "2026-01-01",
    medicationCodeableConcept: { text: "medicine " + i + " 10 MG tablet", coding: ["9" + (i % 8), "9" + ((i + 1) % 8), "9" + ((i + 2) % 8), "5" + i + "1", "5" + i + "2", "5" + i + "3"].map((code) => ({ system: RX, code })) }
  }));
  const ttyOf = (code) => /^9/.test(code) ? "IN" : code.slice(-1) === "1" ? "SBD" : code.slice(-1) === "2" ? "SCD" : "MIN";
  let requests = 0;
  const DELAY = 200;
  const fetchFn = async (url) => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, DELAY));
    const code = /\/rxcui\/(\d+)\//.exec(url)[1];
    if (url.includes("historystatus")) return { ok: true, json: async () => ({ rxcuiStatusHistory: { metaData: { status: "Active" }, attributes: { rxcui: code, tty: ttyOf(code) } } }) };
    return { ok: true, json: async () => ({ relatedGroup: { conceptGroup: [{ tty: "IN", conceptProperties: [{ rxcui: "9" + (Number(code) % 8), name: "ingredient" }] }] } }) };
  };
  const started = Date.now();
  const split = await listFromSearch(asRequests(records), "Epic", fetchFn);
  const took = Date.now() - started;
  assert.equal(split.current.length, 30);
  assert.ok(split.current.every((card) => /2$/.test(card.rxcui)), "each goes by its SCD");
  // 180 codings, 98 different codes; asked: each record's MIN, then its SCD.
  assert.equal(requests, 120);
  assert.ok(took < 12000, "inside the medicines' 12-second limit: " + took + " ms");
  console.log("# lookup: " + requests + " requests for 30 medicines, " + took + " ms at " + DELAY + " ms each");
});
