// The test records the home server can add as a second source. If these fail,
// the published app could load them, they could join someone else's list, or
// a second source could go missing from the list without a word.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demoSourceUrl, demoSource, loadDemoSource } from "../js/demo-source.js";
import { personOf, samePerson, reconcile, sideWords } from "../js/reconcile.js";
import { fromMedicationRequest, usableRecord, isPlaceholderDrug, dedupe, groupByIngredient, splitByStatus } from "../js/meds.js";
import { arrangeList, sourceNotices } from "../js/view.js";
import { demoAnswer } from "../tools/serve.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const DEMO = read("./fixtures/reconcile/demo-clinic.json");
const SIGNED_IN = { name: [{ text: "Loria Jenkins" }], birthDate: "1971-05-01" };
// Loria Jenkins as the sandbox has her, saved from the open FHIR server.
const LORIA = read("./fixtures/e7de504a-311d-49be-b2bc-566a328bcc72-requests.json").entry.map((entry) => entry.resource);
const LORIA_PATIENT = { resourceType: "Patient", name: [{ use: "official", family: "Jenkins", given: ["Loria"], prefix: ["Mrs."] }, { use: "maiden", family: "Crooks", given: ["Loria"] }], birthDate: "1937-07-15" };

// The way loadMedicines in app.js builds the sandbox's split.
function sandbox(requests) {
  const items = requests.filter((r) => r.resourceType === "MedicationRequest" && usableRecord(r))
    .map((r) => fromMedicationRequest(r, "SMART sandbox")).filter((item) => !isPlaceholderDrug(item));
  const split = Object.assign(splitByStatus(groupByIngredient(dedupe(items), new Map())), { failed: false, heldBack: false, placeholders: 0 });
  return { id: "smart-sandbox", name: "SMART sandbox", kind: "records", refreshes: true, patient: LORIA_PATIENT, split };
}
const cards = (split) => split.current.concat(split.older);
const only = (split, pattern) => {
  const found = cards(split).filter((card) => pattern.test(card.name));
  assert.equal(found.length, 1, String(pattern));
  return found[0];
};

test("the test source is only for the home server", () => {
  assert.equal(demoSourceUrl({ port: "8443" }, "e7de504a-311d-49be-b2bc-566a328bcc72"), "./_home/demo-source/e7de504a-311d-49be-b2bc-566a328bcc72.json");
  assert.equal(demoSourceUrl({ port: "" }, "e7de504a-311d-49be-b2bc-566a328bcc72"), null);
  assert.equal(demoSourceUrl({ port: "443" }, "e7de504a-311d-49be-b2bc-566a328bcc72"), null);
  assert.equal(demoSourceUrl(null, "e7de504a-311d-49be-b2bc-566a328bcc72"), null);
});

test("the test clinic follows the signed-in patient", () => {
  assert.equal(demoSourceUrl({ port: "8443" }, "brownbag-recon-riley"), "./_home/demo-source/brownbag-recon-riley.json");
  assert.equal(demoSourceUrl({ port: "" }, "brownbag-recon-riley"), null);
  // No patient, no file to ask for.
  assert.equal(demoSourceUrl({ port: "8443" }), null);
  assert.equal(demoSourceUrl({ port: "8443" }, ""), null);
  // An id is one part of the address, whatever it holds.
  assert.equal(demoSourceUrl({ port: "8443" }, "../a b"), "./_home/demo-source/..%2Fa%20b.json");
});

test("a clinic file that held records back says so", () => {
  assert.equal(demoSource(DEMO, SIGNED_IN, "").split.heldBack, false);
  assert.equal(demoSource(Object.assign({}, DEMO, { heldBack: true }), SIGNED_IN, "").split.heldBack, true);
  assert.equal(demoSource(Object.assign({}, DEMO, { heldBack: "yes" }), SIGNED_IN, "").split.heldBack, false);
});

test("no _home folder is published", () => {
  assert.equal(existsSync(new URL("../_home", import.meta.url)), false);
});

test("the test source is the signed-in person", () => {
  const source = demoSource(DEMO, SIGNED_IN, "");
  assert.equal(source.id, "valley-clinic-demo");
  assert.equal(source.name, "Valley Clinic (test records)");
  assert.equal(source.kind, "records");
  assert.ok(samePerson(personOf(source.patient), personOf(SIGNED_IN)));
  assert.ok(cards(source.split).every((card) => card.source === "Valley Clinic (test records)"));
});

test("with ?demo=someone-else the test source is a day off and stays out", () => {
  const source = demoSource(DEMO, SIGNED_IN, "?demo=someone-else");
  assert.equal(source.patient.birthDate, "1971-05-02");
  assert.equal(samePerson(personOf(source.patient), personOf(SIGNED_IN)), false);
  assert.equal(demoSource(DEMO, { name: SIGNED_IN.name, birthDate: "1999-12-31" }, "?demo=someone-else").patient.birthDate, "2000-01-01");
  const out = reconcile([sandbox(LORIA), demoSource(DEMO, LORIA_PATIENT, "?x=1&demo=someone-else")], new Map());
  assert.deepEqual(out.keptOut, [{ id: "valley-clinic-demo", name: "Valley Clinic (test records)", why: "someone-else" }]);
  assert.ok(cards(out).every((card) => !card.group));
});

// Her real records against the test clinic's: one of each kind.
test("the demo clinic against Loria's own records", () => {
  const out = reconcile([sandbox(LORIA), demoSource(DEMO, LORIA_PATIENT, "")], new Map());
  const metoprolol = only(out, /metoprolol/);
  assert.deepEqual(metoprolol.group.verdicts, ["dose"]);
  assert.deepEqual(metoprolol.group.sides.map((side) => side.sourceName + ": " + sideWords(side)), [
    "SMART sandbox: 100 MG, 1, once a day",
    "Valley Clinic (test records): 100 MG, 2, once a day"
  ]);
  const simvastatin = only(out, /Simvistatin/);
  assert.deepEqual(simvastatin.group.verdicts, ["status"]);
  assert.equal(simvastatin.status, "current");
  const lasix = only(out, /Lasix/);
  assert.deepEqual(lasix.group.verdicts, []);
  assert.deepEqual(lasix.group.sources, ["SMART sandbox", "Valley Clinic (test records)"]);
  const lisinopril = only(out, /lisinopril/);
  assert.equal(lisinopril.group, undefined);
  assert.equal(lisinopril.source, "Valley Clinic (test records)");
  assert.equal(LORIA.some((r) => /lisinopril/i.test(JSON.stringify(r))), false, "she has none of her own");
  const asked = arrangeList(out, {}).toCheck.map((entry) => [entry.name, entry.question.kind]);
  assert.deepEqual(asked, [["24 HR metoprolol succinate 100 MG Extended Release Oral Tablet [Toprol]", "dose"], ["Simvistatin 10 MG", "status"]]);
});

test("only a 200 from the home server adds it", async () => {
  const asked = [];
  const answer = (status, body) => async (url, options) => { asked.push([url, options]); return { ok: status === 200, status, json: async () => body }; };
  const id = "e7de504a-311d-49be-b2bc-566a328bcc72";
  assert.equal(await loadDemoSource({ port: "443", search: "" }, SIGNED_IN, id, answer(200, DEMO)), null);
  assert.deepEqual(asked, [], "never asked anywhere else");
  assert.equal(await loadDemoSource({ port: "8443", search: "" }, SIGNED_IN, id, answer(404, null)), null);
  const source = await loadDemoSource({ port: "8443", search: "" }, SIGNED_IN, id, answer(200, DEMO));
  assert.equal(source.id, "valley-clinic-demo");
  assert.equal(asked[1][0], "./_home/demo-source/" + id + ".json");
  assert.equal(asked[1][1].cache, "no-store");
  assert.equal(await loadDemoSource({ port: "8443", search: "" }, SIGNED_IN, id, async () => { throw new Error("offline"); }), null);
  assert.equal(await loadDemoSource({ port: "8443", search: "" }, SIGNED_IN, id, answer(200, { nonsense: true })), null);
});

test("the home server answers with the demo clinic only when started for it", () => {
  const on = { BROWN_BAG_DEMO: "two-clinics" };
  const file = fileURLToPath(new URL("./fixtures/reconcile/demo-clinic.json", import.meta.url));
  const loria = "/_home/demo-source/e7de504a-311d-49be-b2bc-566a328bcc72.json";
  assert.deepEqual(demoAnswer(loria, on), { status: 200, file });
  assert.deepEqual(demoAnswer(loria, {}), { status: 404 });
  assert.deepEqual(demoAnswer(loria, { BROWN_BAG_DEMO: "yes" }), { status: 404 });
  assert.deepEqual(demoAnswer("/_home/demo-source.json", on), { status: 404 });
  assert.deepEqual(demoAnswer("/_home/other.json", on), { status: 404 });
  assert.equal(demoAnswer("/index.html", on), null);
});

test("a patient with their own clinic file gets it", () => {
  const on = { BROWN_BAG_DEMO: "two-clinics" };
  const riley = fileURLToPath(new URL("./fixtures/reconcile/clinics/brownbag-recon-riley.json", import.meta.url));
  assert.deepEqual(demoAnswer("/_home/demo-source/brownbag-recon-riley.json", on), { status: 200, file: riley });
  assert.deepEqual(demoAnswer("/_home/demo-source/brownbag-recon-riley.json", {}), { status: 404 });
});

test("an id that isn't letters, digits and dashes never reaches the files", () => {
  const on = { BROWN_BAG_DEMO: "two-clinics" };
  for (const bad of ["../../package", "..", "a.b", "a/b", "", "brownbag-recon-riley.json", "a b", "%2e%2e", "clinics\\x"]) {
    assert.deepEqual(demoAnswer("/_home/demo-source/" + bad + ".json", on), { status: 404 }, bad);
  }
  assert.deepEqual(demoAnswer("/_home/demo-source/brownbag-recon-riley", on), { status: 404 });
  assert.deepEqual(demoAnswer("/_home/demo-source/brownbag-recon-riley.json/x", on), { status: 404 });
});

test("a source kept out or not loaded is said, the first one's failure as before", () => {
  assert.deepEqual(sourceNotices({ keptOut: [
    { id: "a", name: "Valley Clinic", why: "someone-else" },
    { id: "b", name: "Mercy Health", why: "no-identity" }
  ], sourceStatus: [
    { id: "smart-sandbox", name: "SMART sandbox", loaded: false, complete: true },
    { id: "c", name: "Lakeside", loaded: false, complete: true },
    { id: "d", name: "Hilltop", loaded: true, complete: true }
  ] }), [
    "Records from Valley Clinic are for someone else, so they aren't on your list.",
    "Mercy Health didn't share a name and birth date, so its records aren't on your list.",
    "Couldn't load medicines from Lakeside."
  ]);
  // A list saved before sources were joined has neither.
  assert.deepEqual(sourceNotices({ current: [], older: [] }), []);
});
