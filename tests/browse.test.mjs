// Browse all patients (design 2026-11-28): sorting, searching and wording the
// saved list of sandbox patients, and picking out patients other people
// added, for the live view.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SORTS, DEFAULT_SORT, PAGE, sortPatients, matchesName, findPatients, rowLines, isAddedId, nameOf, addedFromBundle } from "../js/browse.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const person = (name, born, counts = {}) => Object.assign({ id: "id-" + (name || "none") + "-" + born, name, born, deceased: false, different: 0, prescriptions: 0, current: 0, fills: 0, allergies: 0 }, counts);
const ids = (list) => list.map((p) => p.name);

test("the sorts, in order, with Most different medicines first and 20 to a page", () => {
  assert.deepEqual(SORTS.map((s) => s.id), ["different", "prescriptions", "current", "fills", "allergies", "name", "oldest", "youngest", "added"]);
  assert.deepEqual(SORTS.map((s) => s.label), ["Most different medicines", "Most prescriptions", "Most current medicines", "Most insurance fills", "Most allergies", "Name A to Z", "Oldest first", "Youngest first", "Added by other people"]);
  assert.equal(DEFAULT_SORT, "different");
  assert.equal(PAGE, 20);
});

test("a count sort is highest first, and ties go by name so paging never repeats anyone", () => {
  const list = [person("Zed Young", "1990-01-01", { allergies: 0 }), person("Ann Ábel", "1950-01-01", { allergies: 0 }), person("Bo Most", "1960-01-01", { allergies: 4 }), person("Al Abel", "1970-01-01", { allergies: 0 })];
  assert.deepEqual(ids(sortPatients(list, "allergies")), ["Bo Most", "Al Abel", "Ann Ábel", "Zed Young"]);
  assert.deepEqual(ids(list), ["Zed Young", "Ann Ábel", "Bo Most", "Al Abel"], "the list itself isn't reordered");
  for (const id of ["different", "prescriptions", "current", "fills"]) {
    const counted = [person("A A", "1990-01-01"), person("B B", "1990-01-01")];
    counted[1][id] = 3;
    assert.deepEqual(ids(sortPatients(counted, id)), ["B B", "A A"], id);
  }
});

test("Name A to Z is by family name, then given", () => {
  const list = [person("Zoe Adams", "1990-01-01"), person("Al Zane", "1990-01-01"), person("Amy Adams", "1990-01-01"), person(null, "1990-01-01")];
  assert.deepEqual(ids(sortPatients(list, "name")), ["Amy Adams", "Zoe Adams", "Al Zane", null]);
});

test("oldest and youngest go by birth date, with no birth date last in both", () => {
  const list = [person("Mid Age", "1970-05-01"), person("No Date", null), person("Old One", "1920-02-03"), person("Kid Two", "2015-04-04")];
  assert.deepEqual(ids(sortPatients(list, "oldest")), ["Old One", "Mid Age", "Kid Two", "No Date"]);
  assert.deepEqual(ids(sortPatients(list, "youngest")), ["Kid Two", "Mid Age", "Old One", "No Date"]);
});

test("the name search finds any part of the name, whatever the case and accents", () => {
  const florencia = person("Florencia Meléndez", "1993-03-12");
  for (const query of ["mel", "MEL", "melendez", "Meléndez", " florencia ", "encia mel", ""]) assert.equal(matchesName(florencia, query), true, query);
  assert.equal(matchesName(florencia, "pam"), false);
  const nameless = person(null, null);
  assert.equal(matchesName(nameless, ""), true);
  assert.equal(matchesName(nameless, "no name"), false);
  const list = [person("Pamela Ruiz", "1980-01-01", { different: 2 }), florencia, person("Melvin Ode", "1940-01-01", { different: 9 })];
  assert.deepEqual(ids(findPatients(list, "mel", "different")), ["Melvin Ode", "Pamela Ruiz", "Florencia Meléndez"]);
  assert.deepEqual(ids(findPatients(list, "melv", "different")), ["Melvin Ode"]);
});

test("each row says the name, the birth date and the number it's sorted by", () => {
  const f = person("Florencia Meléndez", "1993-03-12", { different: 12, prescriptions: 1, current: 1, fills: 3, allergies: 1 });
  assert.deepEqual(rowLines(f, "different"), { name: "Florencia Meléndez", detail: "Born Mar 12, 1993. 12 different medicines." });
  assert.equal(rowLines(f, "prescriptions").detail, "Born Mar 12, 1993. 1 prescription.");
  assert.equal(rowLines(f, "current").detail, "Born Mar 12, 1993. 1 current medicine.");
  assert.equal(rowLines(f, "fills").detail, "Born Mar 12, 1993. 3 insurance fills.");
  assert.equal(rowLines(f, "allergies").detail, "Born Mar 12, 1993. 1 allergy.");
  assert.equal(rowLines(Object.assign({}, f, { allergies: 2 }), "allergies").detail, "Born Mar 12, 1993. 2 allergies.");
  assert.equal(rowLines(Object.assign({}, f, { different: 1 }), "different").detail, "Born Mar 12, 1993. 1 different medicine.");
  for (const id of ["name", "oldest", "youngest", "added"]) assert.equal(rowLines(f, id).detail, "Born Mar 12, 1993.", id);
});

test("a missing name or birth date is said plainly", () => {
  assert.deepEqual(rowLines(person(null, null, { different: 2 }), "different"), { name: "No name in the record", detail: "No birth date. 2 different medicines." });
  assert.equal(rowLines(person("", "1990", {}), "name").name, "No name in the record");
  assert.equal(rowLines(person("Ann Lee", "1990", {}), "name").detail, "Born 1990.");
});

test("the sandbox's own patients have long ids; added ones don't", () => {
  for (const id of ["e7de504a-311d-49be-b2bc-566a328bcc72", "E89AF71D-4AA4-2237-E71D-6FA8E4B5AF09"]) assert.equal(isAddedId(id), false, id);
  for (const id of ["5023633", "brownbag-recon-riley", "smart-1288992", "e7de504a-311d-49be-b2bc-566a328bcc7"]) assert.equal(isAddedId(id), true, id);
  for (const id of ["", null, undefined, "a,b"]) assert.equal(isAddedId(id), false, String(id));
});

test("a name is the official one, else the first, as Given Family", () => {
  assert.equal(nameOf({ name: [{ use: "nickname", given: ["Bill"], family: "Lee" }, { use: "official", given: ["William", "J"], family: "Lee" }] }), "William J Lee");
  assert.equal(nameOf({ name: [{ given: ["Ann"], family: "Ode" }] }), "Ann Ode");
  assert.equal(nameOf({ name: [{ text: "Maria Ruiz" }] }), "Maria Ruiz");
  assert.equal(nameOf({ name: [{ family: "Ode" }] }), "Ode");
  for (const patient of [{}, { name: [] }, { name: [{}] }, { name: [{ given: [""], family: " " }] }, null]) assert.equal(nameOf(patient), null, JSON.stringify(patient));
});

test("the live view keeps only patients other people added", () => {
  const bundle = { resourceType: "Bundle", type: "searchset", entry: [
    { resource: { resourceType: "Patient", id: "5023633", name: [{ given: ["Tess"], family: "Ng" }], birthDate: "1980-02-02" } },
    { resource: { resourceType: "Patient", id: "e7de504a-311d-49be-b2bc-566a328bcc72", name: [{ given: ["Loria"], family: "Jenkins" }] } },
    { resource: { resourceType: "Patient", id: "5023644" } },
    { fullUrl: "x" },
    { resource: { resourceType: "OperationOutcome", id: "9" } }
  ] };
  assert.deepEqual(addedFromBundle(bundle), [{ id: "5023633", name: "Tess Ng", born: "1980-02-02" }, { id: "5023644", name: null, born: null }]);
  for (const odd of [null, {}, { entry: null }, { entry: "x" }]) assert.deepEqual(addedFromBundle(odd), []);
});

test("Browse works with no signal", () => {
  assert.ok(read("sw.js").includes('"./js/browse.js"'));
});

// Final review fixes (2026-11-28).
test("Brown Bag's own test patients aren't shown as added by other people", () => {
  const bundle = { entry: [{ resource: { resourceType: "Patient", id: "brownbag-recon-riley", name: [{ text: "Riley Reconcile" }] } }, { resource: { resourceType: "Patient", id: "5023633" } }] };
  assert.deepEqual(addedFromBundle(bundle).map((p) => p.id), ["5023633"]);
});

test("the live view asks both searches once, newest first, each patient once", async () => {
  const { askAdded } = await import("../js/browse.js");
  const asked = [];
  const answers = {
    MedicationRequest: { entry: [{ resource: { resourceType: "Patient", id: "constructor", name: [{ text: "Con Structor" }] } }, { resource: { resourceType: "Patient", id: "5023633" } }] },
    MedicationStatement: { entry: [{ resource: { resourceType: "Patient", id: "5023633" } }, { resource: { resourceType: "Patient", id: "toString" } }] }
  };
  const fetchFn = async (url) => {
    asked.push(url);
    const kind = /_has:(\w+):/.exec(url)[1];
    return { ok: true, json: async () => answers[kind] };
  };
  const found = await askAdded(fetchFn, (promise) => promise);
  assert.deepEqual(found.map((p) => p.id), ["constructor", "5023633", "toString"]);
  assert.equal(asked.length, 2);
  for (const url of asked) assert.match(url, /_sort=-_lastUpdated&_count=20&_elements=name,birthDate$/);
  await assert.rejects(askAdded(async () => ({ ok: false, status: 503 }), (promise) => promise));
});
