import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { personOf, samePerson, matchOf, plainName, GROUPS, verdictsFor, dailyAmount, isWeekly, reconcile, sideWords } from "../js/reconcile.js";
import { snapshotSource } from "../js/snapshot.js";
import { fromMedicationRequest, fromMedicationStatement, usableRecord, isPlaceholderDrug, dedupe, groupByIngredient, splitByStatus } from "../js/meds.js";

function item(name, rxcui) {
  return { name: name, rxcui: rxcui || null, key: rxcui ? "rx:" + rxcui : "text:" + name.toLowerCase() };
}
function map(pairs) {
  var m = new Map();
  pairs.forEach(function (p) { m.set(p[0], { rxcui: p[1], name: p[2] || "x" }); });
  return m;
}

test("samePerson ignores case, accents and endings", () => {
  var a = { family: "Núñez Jr.", given: "Ana", birthDate: "1950-02-03" };
  assert.equal(samePerson(a, { family: "nunez", given: "ANA", birthDate: "1950-02-03" }), true);
  assert.equal(samePerson(a, { family: "nunez", given: "ANA", birthDate: "1950-02-04" }), false);
  assert.equal(samePerson(a, null), false);
});

test("samePerson strips endings only at the end of a name part", () => {
  var born = "1950-02-03";
  assert.equal(samePerson({ family: "Smith III", given: "Al", birthDate: born }, { family: "smith", given: "al", birthDate: born }), true);
  assert.equal(samePerson({ family: "Smith, Sr.", given: "Al", birthDate: born }, { family: "Smith", given: "Al", birthDate: born }), true);
  assert.equal(samePerson({ family: "Van Iv Berg", given: "Al", birthDate: born }, { family: "Van Berg", given: "Al", birthDate: born }), false);
  assert.equal(samePerson({ family: "Jr Smith", given: "Al", birthDate: born }, { family: "Smith", given: "Al", birthDate: born }), false);
});

test("samePerson needs a full birth date on both sides", () => {
  var a = { family: "Smith", given: "Al" };
  assert.equal(samePerson(Object.assign({ birthDate: "1950" }, a), Object.assign({ birthDate: "1950" }, a)), false);
  assert.equal(samePerson(Object.assign({ birthDate: "1950-02" }, a), Object.assign({ birthDate: "1950-02" }, a)), false);
  assert.equal(samePerson(Object.assign({ birthDate: "1950-02-03" }, a), Object.assign({ birthDate: "1950-02-03" }, a)), true);
  assert.equal(samePerson(a, a), false);
});

test("the accent range is written as escapes", () => {
  var source = readFileSync(new URL("../js/reconcile.js", import.meta.url), "utf8");
  assert.equal(/[\u0300-\u036f]/.test(source), false);
});

test("personOf reads a name written as text", () => {
  assert.deepEqual(personOf({ name: [{ text: "Loria Jenkins" }], birthDate: "1971-05-01" }),
    { family: "Jenkins", given: "Loria", birthDate: "1971-05-01" });
  assert.equal(personOf({ name: [{ text: "Loria Jenkins" }] }), null);
  assert.deepEqual(personOf({ name: [{ family: "Ng", given: ["Al", "B"] }], birthDate: "2000-01-01" }),
    { family: "Ng", given: "Al", birthDate: "2000-01-01" });
  assert.equal(personOf(null), null);
});

test("matchOf levels", () => {
  var ing = map([["29046", "29046"], ["208161", "36437"], ["312940", "36437"], ["6809", "6809"],
    ["860975", "6809"], ["1", "29046+5487"], ["2", "29046"], ["3", "29046"], ["4", "29046"]]);
  assert.equal(matchOf(item("Sertraline 50 MG Oral Tablet [Zoloft]", "208161"), item("sertraline 50 MG Oral Tablet", "312940"), ing), "name");
  assert.equal(matchOf(item("lisinopril 10 MG Oral Tablet", "2"), item("lisinopril 20 MG Oral Tablet", "3"), ing), "ingredients");
  assert.equal(matchOf(item("metformin hydrochloride 500 MG Oral Tablet", "6809"), item("24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet", "860975"), ing), "form");
  assert.equal(matchOf(item("lisinopril / hydrochlorothiazide", "1"), item("lisinopril", "29046"), ing), "combo");
  assert.equal(matchOf(item("Lisinopril"), item("lisinopril 10 MG Oral Tablet", "2"), ing), "name-only");
  assert.equal(matchOf(item("Hydroxyzine"), item("Hydralazine"), ing), null);
  assert.equal(matchOf(item("a", "5"), item("b", "5"), ing), "rxcui");
});

test("with no ingredient map only rxcui, name and name-only are possible", () => {
  assert.equal(matchOf(item("lisinopril 10 MG Oral Tablet", "2"), item("lisinopril 20 MG Oral Tablet", "3"), new Map()), "name-only");
  assert.equal(matchOf(item("lisinopril 10 MG Oral Tablet", "2"), item("lisinopril 20 MG Oral Tablet", "3")), "name-only");
});

test("plainName and GROUPS", () => {
  assert.equal(plainName("Sertraline 50 MG  Oral Tablet [Zoloft]"), "sertraline 50 mg oral tablet");
  assert.deepEqual(GROUPS, ["rxcui", "name", "ingredients"]);
});

// Reconciling. The first source is built here, the second is a fixture.
const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const PATIENT = { resourceType: "Patient", id: "loria", name: [{ family: "Jenkins", given: ["Loria"] }], birthDate: "1937-07-15" };
const MAP = map([["314076", "29046", "lisinopril"], ["314077", "29046", "lisinopril"], ["197884", "29046", "lisinopril"],
  ["197886", "5487+29046", "hydrochlorothiazide / lisinopril"], ["861007", "6809", "metformin"], ["617310", "83367", "atorvastatin"],
  ["208161", "36437", "sertraline"], ["312940", "36437", "sertraline"], ["105585", "6851", "methotrexate"],
  ["314231", "36567", "simvastatin"], ["312961", "36567", "simvastatin"], ["197361", "17767", "amlodipine"],
  ["312086", "26225", "ondansetron"], ["1740467", "26225", "ondansetron"]]);

function coded(value, unit, repeat) {
  return [{ doseAndRate: [{ doseQuantity: { value: value, unit: unit } }], timing: { repeat: repeat || { frequency: 1, period: 1, periodUnit: "d" } } }];
}
function words(text) {
  return [{ text: text }];
}
function request(id, rxcui, display, authoredOn, dosage, extra) {
  return Object.assign({ resourceType: "MedicationRequest", id: id, status: "active", intent: "order",
    medicationCodeableConcept: { coding: [{ system: RXNORM, code: rxcui, display: display }] },
    authoredOn: authoredOn, dosageInstruction: dosage }, extra || {});
}

const SANDBOX_REQUESTS = [
  request("a-lisinopril", "314076", "lisinopril 10 MG Oral Tablet", "2026-03-02", coded(10, "mg")),
  request("a-metformin", "861007", "metformin hydrochloride 500 MG Oral Tablet", "2025-11-01", words("Take 1 tablet twice a day with meals")),
  request("a-atorvastatin", "617310", "atorvastatin 20 MG Oral Tablet", "2026-01-10", words("Take 1 tablet at night")),
  request("a-sertraline", "208161", "Sertraline 50 MG Oral Tablet [Zoloft]", "2026-02-14", words("Take 1 tablet once a day")),
  request("a-methotrexate", "105585", "methotrexate 2.5 MG Oral Tablet", "2026-04-04", coded(4, "tablet", { frequency: 1, period: 1, periodUnit: "wk" })),
  request("a-simvastatin", "314231", "simvastatin 10 MG Oral Tablet", "2026-01-20", coded(2, "tablet")),
  request("a-amlodipine", "197361", "amlodipine 5 MG Oral Tablet", "2026-02-02", words("Take 1 tablet by mouth every morning")),
  request("a-ondansetron", "312086", "ondansetron 4 MG Oral Tablet", "2026-05-05", words("Take 1 tablet every 8 hours as needed for nausea"))
];

// The way loadMedicines in app.js builds a source's split.
function splitOf(requests, statements, sourceName) {
  var items = [];
  var placeholders = 0;
  [[requests, fromMedicationRequest], [statements, fromMedicationStatement]].forEach(function (pair) {
    pair[0].filter(usableRecord).forEach(function (resource) {
      var item = pair[1](resource, sourceName);
      if (isPlaceholderDrug(item)) placeholders += 1;
      else items.push(item);
    });
  });
  var split = splitByStatus(groupByIngredient(dedupe(items), MAP));
  split.failed = false;
  split.heldBack = false;
  split.placeholders = placeholders;
  split.ingredientOf = MAP;
  return split;
}
function fixture(name) {
  return JSON.parse(readFileSync(new URL("./fixtures/reconcile/" + name + ".json", import.meta.url), "utf8"));
}
function bundled(file) {
  var bundle = JSON.parse(readFileSync(new URL("./fixtures/" + file, import.meta.url), "utf8"));
  return (bundle.entry || []).map(function (entry) { return entry.resource; });
}
function sandbox(requests) {
  return { id: "smart-sandbox", name: "SMART sandbox", kind: "records", refreshes: true, patient: PATIENT, split: splitOf(requests || SANDBOX_REQUESTS, [], "SMART sandbox") };
}
function valley(file, change) {
  var data = typeof file === "string" ? fixture(file) : file;
  if (change) change(data);
  return { id: "clinic-b", name: "Valley Clinic", kind: "records", refreshes: true, patient: data.patient, split: splitOf(data.requests, data.statements, "Valley Clinic") };
}
function cards(split) {
  return split.current.concat(split.older);
}
function named(split, pattern) {
  return cards(split).filter(function (card) { return pattern.test(card.name); });
}
function only(split, pattern) {
  var found = named(split, pattern);
  assert.equal(found.length, 1, "one card for " + pattern);
  return found[0];
}

test("one source comes back as it went in", () => {
  var split = splitOf(bundled("e5408569-9931-5afe-b62d-4175e6b44784-requests.json"), bundled("e5408569-9931-5afe-b62d-4175e6b44784-statements.json"), "SMART sandbox");
  var before = JSON.parse(JSON.stringify(split.current.concat(split.older)));
  var out = reconcile([{ id: "smart-sandbox", name: "SMART sandbox", kind: "records", refreshes: true, patient: PATIENT, split: split }], MAP);
  assert.deepEqual(out.current, split.current);
  assert.deepEqual(out.older, split.older);
  assert.deepEqual(out.keptOut, []);
  assert.deepEqual(out.sourceStatus, [{ id: "smart-sandbox", name: "SMART sandbox", loaded: true, complete: true }]);
  assert.equal(out.failed, false);
  assert.equal(out.heldBack, false);
  assert.equal(out.placeholders, split.placeholders);
  assert.equal(cards(out).some(function (card) { return card.group; }), false);
  assert.deepEqual(JSON.parse(JSON.stringify(split.current.concat(split.older))), before);
});

test("two clinics", () => {
  var out = reconcile([sandbox(), valley("two-clinics")], MAP);
  var lisinopril = only(out, /^lisinopril/);
  assert.deepEqual(lisinopril.group.verdicts, ["dose"]);
  assert.deepEqual(lisinopril.group.sources, ["SMART sandbox", "Valley Clinic"]);
  assert.equal(lisinopril.group.id, "29046");
  assert.deepEqual(lisinopril.group.sides.map(function (side) { return [side.sourceId, side.sourceName, side.kind, side.asOf, side.dose, side.frequency, side.status, side.recordStatus, side.key]; }), [
    ["smart-sandbox", "SMART sandbox", "records", "2026-03-02", "10 mg", "once a day", "current", "active", "rx:314076"],
    ["clinic-b", "Valley Clinic", "records", "2026-10-05", "20 mg", "once a day", "current", "active", "rx:314077"]
  ]);
  // The newest current one is shown.
  assert.equal(lisinopril.name, "lisinopril 20 MG Oral Tablet");
  assert.deepEqual(lisinopril.group.notes, ["Possible duplicate of hydrochlorothiazide 12.5 MG / lisinopril 20 MG Oral Tablet"]);

  var metformin = only(out, /^metformin/);
  assert.deepEqual(metformin.group.verdicts, []);
  assert.deepEqual(metformin.group.sources, ["SMART sandbox", "Valley Clinic"]);

  var atorvastatin = only(out, /^atorvastatin/);
  assert.deepEqual(atorvastatin.group.verdicts, ["status"]);
  assert.equal(atorvastatin.status, "current");
  assert.equal(atorvastatin.source, "SMART sandbox");

  var sertraline = only(out, /^sertraline/i);
  assert.deepEqual(sertraline.group.verdicts, []);
  assert.deepEqual(sertraline.group.sources, ["SMART sandbox", "Valley Clinic"]);

  assert.deepEqual(only(out, /^methotrexate/).group.verdicts, ["schedule"]);

  var combo = only(out, /^hydrochlorothiazide/);
  assert.deepEqual(combo.group.verdicts, []);
  assert.deepEqual(combo.group.sources, ["Valley Clinic"]);
  assert.deepEqual(combo.group.notes, ["Possible duplicate of lisinopril 10 MG Oral Tablet"]);

  assert.deepEqual(only(out, /^simvastatin/).group.verdicts, []);
  var amlodipine = only(out, /^amlodipine/);
  assert.deepEqual(amlodipine.group.verdicts, ["worded"]);

  var iv = only(out, /Injectable/);
  assert.equal(out.older.indexOf(iv) !== -1, true);
  assert.equal(iv.hospital, true);
  assert.equal(iv.group, undefined);
  assert.equal(only(out, /^ondansetron 4/).group, undefined);

  assert.deepEqual(out.keptOut, []);
  assert.deepEqual(out.sourceStatus, [{ id: "smart-sandbox", name: "SMART sandbox", loaded: true, complete: true }, { id: "clinic-b", name: "Valley Clinic", loaded: true, complete: true }]);
  // Still sorted by name, as splitByStatus does.
  var names = out.current.map(function (card) { return card.name; });
  assert.deepEqual(names, names.slice().sort(function (a, b) { return a.localeCompare(b); }));
});

test("reconcile gives the same answer every time", () => {
  var once = reconcile([sandbox(), valley("two-clinics")], MAP);
  var again = reconcile([sandbox(), valley("two-clinics")], MAP);
  assert.deepEqual(once, again);
  assert.deepEqual(only(once, /^lisinopril/).group.fingerprint, only(again, /^lisinopril/).group.fingerprint);
});

function stopped(extra) {
  return fromMedicationRequest(Object.assign(request("b-old", "314076", "lisinopril 10 MG Oral Tablet", undefined, words("Take 1 tablet daily")), { status: "stopped" }, extra), "Valley Clinic");
}

test("an older stop is history", () => {
  var active = fromMedicationRequest(request("a", "314076", "lisinopril 10 MG Oral Tablet", "2026-02-01", words("Take 1 tablet daily")), "SMART sandbox");
  var oldStop = fromMedicationStatement({ resourceType: "MedicationStatement", id: "s", status: "stopped",
    medicationCodeableConcept: { coding: [{ system: RXNORM, code: "314076", display: "lisinopril 10 MG Oral Tablet" }] },
    effectivePeriod: { start: "2024-01-01", end: "2025-01-02" }, dosage: words("Take 1 tablet daily") }, "Valley Clinic");
  assert.deepEqual(verdictsFor([active, oldStop]), []);
  assert.deepEqual(verdictsFor([active, stopped({ authoredOn: "2025-01-02", meta: { lastUpdated: "2026-09-01T10:00:00Z" } })]), ["status"]);
  assert.deepEqual(verdictsFor([active, stopped({ authoredOn: "2025-01-02" })]), []);
  assert.deepEqual(verdictsFor([active, stopped()]), ["status"]);
  // A current one with no date can't be put in order, so it's asked.
  var undated = fromMedicationRequest(request("u", "314076", "lisinopril 10 MG Oral Tablet", undefined, words("Take 1 tablet daily")), "SMART sandbox");
  assert.deepEqual(verdictsFor([undated, oldStop]), ["status"]);
  // An unknown status never makes a status verdict.
  assert.deepEqual(verdictsFor([active, stopped({ status: "draft" })]), []);
});

test("dose, schedule and worded rules", () => {
  var make = function (id, rxcui, display, dosage) {
    return fromMedicationRequest(request(id, rxcui, display, "2026-01-01", dosage), "x");
  };
  var ten = make("1", "314076", "lisinopril 10 MG Oral Tablet", coded(1, "tablet"));
  var tenTwo = make("2", "314076", "lisinopril 10 MG Oral Tablet", coded(2, "tablet"));
  var twenty = make("3", "314077", "lisinopril 20 MG Oral Tablet", coded(1, "tablet"));
  var tenWords = make("4", "314076", "lisinopril 10 MG Oral Tablet", words("Take 1 tablet daily"));
  var twentyWords = make("5", "314077", "lisinopril 20 MG Oral Tablet", words("Take 1 tablet daily"));
  assert.deepEqual(verdictsFor([tenTwo, twenty]), []);
  assert.deepEqual(verdictsFor([ten, twenty]), ["dose"]);
  assert.deepEqual(verdictsFor([ten, tenTwo]), ["dose"]);
  assert.deepEqual(verdictsFor([tenWords, twentyWords]), ["dose"]);
  // 10 mg written as the amount is one 10 mg tablet.
  assert.deepEqual(verdictsFor([ten, make("6", "314076", "lisinopril 10 MG Oral Tablet", coded(10, "mg"))]), []);
  var twice = make("7", "314076", "lisinopril 10 MG Oral Tablet", coded(1, "tablet", { frequency: 2, period: 1, periodUnit: "d" }));
  assert.deepEqual(verdictsFor([ten, twice]), ["schedule"]);
  var twelveHours = make("8", "314076", "lisinopril 10 MG Oral Tablet", coded(1, "tablet", { frequency: 1, period: 12, periodUnit: "h" }));
  assert.deepEqual(verdictsFor([twice, twelveHours]), []);
  assert.deepEqual(verdictsFor([tenWords, make("9", "314076", "lisinopril 10 MG Oral Tablet", words("Take 1 tablet every week"))]), ["schedule"]);
  assert.deepEqual(verdictsFor([tenWords, make("10", "314076", "lisinopril 10 MG Oral Tablet", words("Take one tablet each morning"))]), ["worded"]);
  assert.deepEqual(verdictsFor([tenWords, make("11", "314076", "lisinopril 10 MG Oral Tablet", words("take 1 tablets daily"))]), []);
  // Both coded the same: the words come from the codes, so nothing to say.
  assert.deepEqual(verdictsFor([ten, make("12", "314076", "lisinopril 10 MG Oral Tablet", coded(1, "tablet"))]), []);
  // Every verdict, in order.
  var stop = stopped({ authoredOn: "2026-06-01" });
  assert.deepEqual(verdictsFor([ten, twenty, stop]), ["status", "dose"]);
});

test("dailyAmount and isWeekly", () => {
  var make = function (display, dosage) {
    return fromMedicationRequest(request("d", "1", display, "2026-01-01", dosage), "x");
  };
  assert.equal(dailyAmount(make("simvastatin 10 MG Oral Tablet", coded(2, "tablet"))), 20);
  assert.equal(dailyAmount(make("simvastatin 20 MG Oral Tablet", coded(1, "tablet"))), 20);
  assert.equal(dailyAmount(make("methotrexate 2.5 MG Oral Tablet", coded(4, "tablet", { frequency: 1, period: 1, periodUnit: "wk" }))), 10 / 7);
  assert.equal(dailyAmount(make("x 10 MG Oral Tablet", coded(1, "tablet", { frequency: 1, period: 8, periodUnit: "h" }))), 30);
  assert.equal(dailyAmount(make("x 10 MG Oral Tablet", coded(1, "tablet", { frequency: 1, period: 30, periodUnit: "min" }))), null);
  assert.equal(dailyAmount(make("x 10 MG Oral Tablet", words("daily"))), null);
  assert.equal(dailyAmount(make("x Oral Tablet", coded(1, "tablet"))), null);
  assert.equal(isWeekly(make("x 10 MG Oral Tablet", coded(1, "tablet", { frequency: 1, period: 1, periodUnit: "wk" }))), true);
  assert.equal(isWeekly(make("x 10 MG Oral Tablet", coded(1, "tablet", { frequency: 1, period: 7, periodUnit: "d" }))), true);
  assert.equal(isWeekly(make("x 10 MG Oral Tablet", coded(1, "tablet", { frequency: 1, period: 6, periodUnit: "d" }))), false);
  assert.equal(isWeekly(make("x 10 MG Oral Tablet", coded(1, "tablet", { frequency: 1, period: 1, periodUnit: "mo" }))), true);
  assert.equal(isWeekly(make("x 10 MG Oral Tablet", words("Take every 2 weeks"))), true);
  assert.equal(isWeekly(make("x 10 MG Oral Tablet", words("Once a week on Monday"))), true);
  assert.equal(isWeekly(make("x 10 MG Oral Tablet", words("Take daily"))), false);
});

test("someone else is kept out", () => {
  var first = sandbox();
  var out = reconcile([first, valley("someone-else")], MAP);
  assert.deepEqual(out.keptOut, [{ id: "clinic-b", name: "Valley Clinic", why: "someone-else" }]);
  assert.deepEqual(out.current, first.split.current);
  assert.deepEqual(out.older, first.split.older);
  var nobody = valley("two-clinics");
  nobody.patient = null;
  assert.deepEqual(reconcile([first, nobody], MAP).keptOut, [{ id: "clinic-b", name: "Valley Clinic", why: "no-identity" }]);
  var partial = valley("two-clinics");
  partial.patient = Object.assign({}, partial.patient, { birthDate: "1937" });
  assert.deepEqual(reconcile([first, partial], MAP).keptOut, [{ id: "clinic-b", name: "Valley Clinic", why: "no-identity" }]);
});

test("a source that didn't load is named", () => {
  var mercy = { id: "clinic-c", name: "Mercy Health", kind: "records", refreshes: true, patient: PATIENT, split: Object.assign(splitOf([], [], "Mercy Health"), { failed: true }) };
  var out = reconcile([sandbox(), valley("two-clinics"), mercy], MAP);
  var lisinopril = only(out, /^lisinopril/);
  assert.deepEqual(lisinopril.group.sources, ["SMART sandbox", "Valley Clinic"]);
  assert.equal(lisinopril.group.notes.indexOf("Mercy Health didn't load") !== -1, true);
  assert.equal(only(out, /^hydrochlorothiazide/).group.notes.indexOf("Mercy Health didn't load") !== -1, true);
  assert.deepEqual(out.sourceStatus[2], { id: "clinic-c", name: "Mercy Health", loaded: false, complete: true });

  var failed = valley("two-clinics");
  failed.split.failed = true;
  var alone = reconcile([sandbox(), failed], MAP);
  assert.equal(cards(alone).some(function (card) { return card.group; }), false);
  assert.deepEqual(alone.sourceStatus, [{ id: "smart-sandbox", name: "SMART sandbox", loaded: true, complete: true }, { id: "clinic-b", name: "Valley Clinic", loaded: false, complete: true }]);
  assert.equal(alone.failed, false);
  assert.deepEqual(alone.keptOut, []);
});

test("the fingerprint ignores record copies", () => {
  var lisinoprilOf = function (change) {
    return only(reconcile([sandbox(), valley("two-clinics", change)], MAP), /^lisinopril/).group;
  };
  var first = lisinoprilOf();
  var copy = lisinoprilOf(function (data) {
    data.requests[0].id = "valley-lisinopril-copy";
    data.requests[0].authoredOn = "2026-11-01";
  });
  assert.equal(copy.fingerprint, first.fingerprint);
  assert.equal(typeof first.fingerprint, "string");
  assert.equal(/2026|valley-lisinopril/.test(first.fingerprint), false);
  var more = lisinoprilOf(function (data) {
    data.requests[0].medicationCodeableConcept.coding[0] = { system: RXNORM, code: "197884", display: "lisinopril 40 MG Oral Tablet" };
    data.requests[0].dosageInstruction[0].doseAndRate[0].doseQuantity.value = 40;
  });
  assert.notEqual(more.fingerprint, first.fingerprint);
  assert.deepEqual(more.verdicts, ["dose"]);
});

test("one source never joins with itself", () => {
  // Two current strengths from one source stay two cards, beside another source.
  var both = SANDBOX_REQUESTS.concat([request("a-lisinopril-20", "314077", "lisinopril 20 MG Oral Tablet", "2026-03-05", coded(20, "mg"))]);
  var out = reconcile([sandbox(both), valley("two-clinics")], MAP);
  var lisinopril = named(out, /^lisinopril/);
  assert.equal(lisinopril.length, 2);
  lisinopril.forEach(function (card) {
    assert.ok(card.group);
    assert.equal(new Set(card.group.sides.map(function (side) { return side.sourceId; })).size, card.group.sides.length);
  });
});

// Fix round 1: what a quick look would call the same.
function med(rxcui, display, dosage, extra) {
  return fromMedicationRequest(Object.assign(request("m" + rxcui, rxcui, display, "2026-05-01", dosage), extra || {}), "x");
}

test("a source that sent only some records is named on its groups", () => {
  var partial = valley("two-clinics");
  partial.split.heldBack = true;
  var out = reconcile([sandbox(), partial], MAP);
  var lisinopril = only(out, /^lisinopril/);
  assert.deepEqual(lisinopril.group.verdicts, ["dose"]);
  assert.equal(lisinopril.group.notes.indexOf("Valley Clinic didn't send some records") !== -1, true);
  assert.equal(only(out, /^metformin/).group.notes.indexOf("Valley Clinic didn't send some records") !== -1, true);
  assert.equal(only(out, /^ondansetron 4/).group, undefined);
  assert.deepEqual(out.sourceStatus, [{ id: "smart-sandbox", name: "SMART sandbox", loaded: true, complete: true }, { id: "clinic-b", name: "Valley Clinic", loaded: true, complete: false }]);
  assert.equal(out.heldBack, true);
});

test("every strength of a combination counts", () => {
  var ten = med("1", "hydrochlorothiazide 12.5 MG / lisinopril 10 MG Oral Tablet", coded(1, "tablet"));
  var twenty = med("2", "hydrochlorothiazide 12.5 MG / lisinopril 20 MG Oral Tablet", coded(1, "tablet"));
  assert.deepEqual(verdictsFor([ten, twenty]), ["dose"]);
  assert.deepEqual(verdictsFor([ten, med("3", "hydrochlorothiazide 12.5 MG / lisinopril 10 MG Oral Tablet", coded(1, "tablet"))]), []);
  var combos = map([["197885", "5487+29046"], ["197886", "5487+29046"]]);
  var source = function (id, name, rxcui, display) {
    var split = splitOf([request(id, rxcui, display, "2026-05-01", coded(1, "tablet"))], [], name);
    split.ingredientOf = combos;
    return { id: id, name: name, kind: "records", refreshes: true, patient: PATIENT, split: split };
  };
  var low = source("smart-sandbox", "SMART sandbox", "197885", "hydrochlorothiazide 12.5 MG / lisinopril 10 MG Oral Tablet");
  var same = reconcile([low, source("clinic-b", "Valley Clinic", "197885", "hydrochlorothiazide 12.5 MG / lisinopril 10 MG Oral Tablet")], combos).current[0].group;
  var more = reconcile([low, source("clinic-b", "Valley Clinic", "197886", "hydrochlorothiazide 12.5 MG / lisinopril 20 MG Oral Tablet")], combos).current[0].group;
  assert.deepEqual(more.verdicts, ["dose"]);
  assert.notEqual(more.fingerprint, same.fingerprint);
});

test("a time of day beside a rate isn't the same schedule", () => {
  var morning = med("1", "lisinopril 10 MG Oral Tablet", [{ doseAndRate: [{ doseQuantity: { value: 1, unit: "tablet" } }], timing: { repeat: { when: ["MORN"] } } }]);
  var twice = med("1", "lisinopril 10 MG Oral Tablet", coded(1, "tablet", { frequency: 2, period: 1, periodUnit: "d" }));
  assert.deepEqual(verdictsFor([morning, twice]), ["worded"]);
  var weekly = med("1", "lisinopril 10 MG Oral Tablet", coded(1, "tablet", { frequency: 1, period: 1, periodUnit: "wk" }));
  assert.deepEqual(verdictsFor([morning, weekly]), ["schedule"]);
});

test("a stop dated only by year or month can't be put before a start", () => {
  var active = med("1", "lisinopril 10 MG Oral Tablet", words("Take 1 tablet daily"));
  var stoppedIn = function (date) {
    return fromMedicationStatement({ resourceType: "MedicationStatement", id: "s", status: "stopped",
      medicationCodeableConcept: { coding: [{ system: RXNORM, code: "1", display: "lisinopril 10 MG Oral Tablet" }] },
      effectivePeriod: { start: date, end: date }, dosage: words("Take 1 tablet daily") }, "y");
  };
  assert.deepEqual(verdictsFor([active, stoppedIn("2026")]), ["status"]);
  assert.deepEqual(verdictsFor([active, stoppedIn("2026-05")]), ["status"]);
  assert.deepEqual(verdictsFor([active, stoppedIn("2025")]), []);
  assert.deepEqual(verdictsFor([active, stoppedIn("2026-04")]), []);
  assert.deepEqual(verdictsFor([med("1", "lisinopril 10 MG Oral Tablet", words("Take 1 tablet daily"), { authoredOn: "2026" }), stoppedIn("2026-03-01")]), ["status"]);
});

test("monthly and every other week are weekly or longer", () => {
  var daily = med("1", "x 10 MG Oral Tablet", words("Take 1 tablet daily"));
  assert.deepEqual(verdictsFor([daily, med("1", "x 10 MG Oral Tablet", words("Take 1 tablet monthly"))]), ["schedule"]);
  ["once a month", "every month", "every other week", "every other month", "every 3 months", "every 2 weeks", "biweekly", "bimonthly"].forEach(function (text) {
    assert.equal(isWeekly(med("1", "x 10 MG Oral Tablet", words("Take 1 tablet " + text))), true, text);
  });
  assert.equal(isWeekly(med("1", "x 10 MG Oral Tablet", words("Take 1 tablet every morning"))), false);
});

test("strengths are compared in one unit", () => {
  var mg = med("1", "levothyroxine sodium 0.025 MG Oral Tablet", coded(1, "tablet"));
  var mcg = med("2", "levothyroxine sodium 0.025 MCG Oral Tablet", coded(1, "tablet"));
  assert.deepEqual(verdictsFor([mg, mcg]), ["dose"]);
  assert.deepEqual(verdictsFor([mg, med("3", "levothyroxine sodium 25 MCG Oral Tablet", coded(1, "tablet"))]), []);
  // 1 mL of 0.025 MG/ML is 0.025 mg, the same amount.
  assert.deepEqual(verdictsFor([mg, med("4", "levothyroxine sodium 0.025 MG/ML Oral Solution", coded(1, "mL"))]), []);
  assert.deepEqual(verdictsFor([mg, med("5", "levothyroxine sodium 0.025 MG/ML Oral Solution", coded(2, "mL"))]), ["dose"]);
  assert.equal(dailyAmount(med("6", "x 25 MCG Oral Tablet", coded(2, "tablet"))), 0.05);
});

test("a unit named like an object property is just an unknown unit", () => {
  assert.equal(dailyAmount(med("7", "x 25 MCG Oral Tablet", coded(2, "constructor"))), 0.05);
});

// Snapshots: a dated list that was handed over, not signed in.
function stoppedOn(id, rxcui, display, date) {
  return request(id, rxcui, display, date, words("Take 1 tablet at night"), { status: "stopped" });
}

test("an IPS snapshot joins as a dated source", () => {
  var snap = snapshotSource(fixture("ips-snapshot"), "Mercy Health");
  assert.equal(snap.kind, "snapshot");
  assert.equal(snap.refreshes, false);
  assert.equal(snap.id, "snapshot:2026-06-01:Mercy Health");
  assert.deepEqual([snap.split.failed, snap.split.heldBack, snap.split.placeholders], [false, false, 0]);
  var lisinopril = only(snap.split, /^lisinopril/);
  assert.equal(lisinopril.asserted, "2026-06-01");
  var out = reconcile([sandbox(), snap], MAP);
  var joined = only(out, /^lisinopril/);
  assert.deepEqual(joined.group.verdicts, ["dose"]);
  assert.equal(personOf(snap.patient).family, "Jenkins");
});

test("an older snapshot doesn't say stopped", () => {
  var bundle = fixture("ips-snapshot");
  bundle.entry[0].resource.date = "2025-01-01";
  var snap = snapshotSource(bundle, "Mercy Health");
  var stopped = sandbox(SANDBOX_REQUESTS.filter(function (r) { return r.id !== "a-atorvastatin"; })
    .concat([stoppedOn("a-atorvastatin", "617310", "atorvastatin 20 MG Oral Tablet", "2026-02-01")]));
  var statin = only(reconcile([stopped, snap], MAP), /^atorvastatin/);
  assert.deepEqual(statin.group.verdicts, []);
  var side = statin.group.sides.filter(function (s) { return s.kind === "snapshot"; })[0];
  assert.equal(side.asOfNote, "As of Jan 2025, Mercy Health listed this");
  assert.equal(statin.group.sides.filter(function (s) { return s.asOfNote; }).length, 1);
});

test("a snapshot's newer stop is a status verdict", () => {
  var bundle = fixture("ips-snapshot");
  bundle.entry[3].resource.status = "stopped";
  var snap = snapshotSource(bundle, "Mercy Health");
  assert.deepEqual(only(reconcile([sandbox(), snap], MAP), /^atorvastatin/).group.verdicts, ["status"]);
  bundle.entry[0].resource.date = "2025-01-01";
  assert.deepEqual(only(reconcile([sandbox(), snapshotSource(bundle, "Mercy Health")], MAP), /^atorvastatin/).group.verdicts, []);
});

test("a re-imported Brown Bag list doesn't duplicate the patient's own", () => {
  var snap = snapshotSource(fixture("own-qr"), "Brown Bag list");
  assert.equal(snap.id, "snapshot:2026-05-21T09:00:00Z:Brown Bag list");
  assert.deepEqual(cards(snap.split).map(function (card) { return card.name; }), ["metformin hydrochloride 500 MG Oral Tablet"]);
  assert.equal(snap.patient.name[0].text, "Loria Jenkins");
  // The same patient statement in a bundle without the tag is somebody's record, and stays.
  var untagged = fixture("own-qr");
  delete untagged.meta;
  assert.equal(cards(snapshotSource(untagged, "x").split).length, 2);
});

test("an IPS file made by Brown Bag drops the patient's own too", () => {
  var bundle = fixture("ips-snapshot");
  var patient = bundle.entry[1].fullUrl;
  bundle.entry[0].resource.author = [{ reference: patient }, { reference: "urn:uuid:device" }];
  bundle.entry.push({ fullUrl: "urn:uuid:device", resource: { resourceType: "Device", deviceName: [{ name: "Brown Bag", type: "user-friendly-name" }] } });
  bundle.entry[2].resource.informationSource = { reference: patient };
  var names = cards(snapshotSource(bundle, "Brown Bag file").split).map(function (card) { return card.name; });
  assert.deepEqual(names, ["atorvastatin 20 MG Oral Tablet"]);
  // A different device is not Brown Bag.
  bundle.entry[bundle.entry.length - 1].resource.deviceName[0].name = "Other App";
  assert.equal(cards(snapshotSource(bundle, "x").split).length, 2);
});

test("an odd bundle is refused", () => {
  var bundle = fixture("ips-snapshot");
  bundle.type = "transaction";
  assert.equal(snapshotSource(bundle, "x"), null);
  assert.equal(snapshotSource(null, "x"), null);
});

test("a newer snapshot that says current asks about a stop", () => {
  var bundle = fixture("ips-snapshot");
  bundle.entry[0].resource.date = "2026-10-01";
  var stopped = sandbox(SANDBOX_REQUESTS.filter(function (r) { return r.id !== "a-atorvastatin"; })
    .concat([stoppedOn("a-atorvastatin", "617310", "atorvastatin 20 MG Oral Tablet", "2026-06-01")]));
  var statin = only(reconcile([stopped, snapshotSource(bundle, "Mercy Health")], MAP), /^atorvastatin/);
  assert.deepEqual(statin.group.verdicts, ["status"]);
});

test("a side reads as its dose and how often, with the strength when the dose doesn't say it", () => {
  assert.equal(sideWords({ name: "Lisinopril 10 MG Oral Tablet", dose: "10 mg", frequency: "once a day" }), "10 mg, once a day");
  assert.equal(sideWords({ name: "Lisinopril 10 MG Oral Tablet", dose: null, frequency: "Take 1 tablet daily" }), "10 MG, Take 1 tablet daily");
  assert.equal(sideWords({ name: "Lisinopril 10 MG Oral Tablet", dose: "1 tablet", frequency: "once a day" }), "10 MG, 1 tablet, once a day");
  assert.equal(sideWords({ name: "Lisinopril 10 MG Oral Tablet", dose: "10mg", frequency: null }), "10mg");
  assert.equal(sideWords({ name: "Lisinopril", dose: "20 mg" }), "20 mg");
  assert.equal(sideWords({ name: "Lisinopril", dose: null, frequency: null }), "See the record");
});

test("two sides with nothing but a strength still read differently", () => {
  assert.equal(sideWords({ name: "lisinopril 10 MG Oral Tablet", dose: null, frequency: null }), "10 MG");
  assert.equal(sideWords({ name: "lisinopril 20 MG Oral Tablet" }), "20 MG");
});
