// An unnamed allergy can be a second record of one already listed, and nothing let
// the patient take it off (Tyler, 2026-11-24). It leaves the phone's list only:
// staff must still see the record, with what the patient said.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALREADY_LISTED, arrangeAllergies, fromAllergyRecords, keepAllergies, removedUnnamed, removeUnnamedQuestion, unnamedRow } from "../js/allergies.js";
import { allergyNotices, buildShareBundle, groupShareBundle } from "../js/share.js";
import { patientSummary } from "../js/ips.js";

const NOW = new Date("2026-11-24T12:00:00Z");
const rec = (id, code, o = {}) => ({ resourceType: "AllergyIntolerance", id, clinicalStatus: { coding: [{ code: "active" }] }, code, ...o });
const ENV = rec("u1", { text: "Allergic disposition (finding)", coding: [{ system: "http://snomed.info/sct", code: "609328004" }] }, { category: ["environment"], recordedDate: "1979-02-28" });
const MOLD = rec("m1", { text: "Mold" }, { category: ["environment"], recordedDate: "1979-02-28" });
const read = (...r) => keepAllergies({ status: "loaded", ...fromAllergyRecords(r, "SMART sandbox") }, null, NOW);
const data = (o = {}) => ({ allergies: [], allergyReactions: {}, noKnownAllergies: null, unnamedAre: {}, ...o });
const REMOVED = { unnamedAre: { "id:u1": ALREADY_LISTED } };

test("removed: off the phone's list, still with staff and in the file", () => {
  const a = arrangeAllergies(read(MOLD, ENV), data(REMOVED));
  assert.equal(a.open.length, 0);
  assert.deepEqual(a.removedKeys, ["id:u1"]);
  assert.equal(a.unspecified, 1);
  const bundle = JSON.parse(JSON.stringify(buildShareBundle({ patient: { name: "A", birthDate: "1950-01-01" }, current: [], additions: [], stopped: [], allergies: a }, NOW, { claims: "loaded", allergies: { status: "loaded", savedAt: null, updatedAt: NOW.toISOString() } })));
  assert.deepEqual(allergyNotices(groupShareBundle(bundle).allergies), ["Records also have an unnamed allergy: environment, recorded Feb 28, 1979 (same day as Mold), patient thinks it's already listed. Ask the patient."]);
  assert.match(JSON.stringify(patientSummary(bundle, { now: NOW, uuid: () => "00000000-0000-4000-8000-000000000000" })), /patient thinks it's already listed/);
});

test("with no other allergy there is nothing it could repeat: it stays, and comes back", () => {
  const alone = arrangeAllergies(read(ENV), data(REMOVED));
  assert.equal(alone.open.length, 1);
  assert.deepEqual(alone.removedKeys, []);
  assert.equal(alone.open[0].canRemove, false);
  assert.equal(arrangeAllergies(read(MOLD, ENV), data()).open[0].canRemove, true);
});

test("only the one they removed goes; one that can't be told apart can't be removed", () => {
  const u2 = rec("u2", ENV.code, { category: ["food"] });
  const a = arrangeAllergies(read(MOLD, ENV, u2), data(REMOVED));
  assert.deepEqual(a.open.map((e) => e.key), ["id:u2"]);
  const old = { items: read(MOLD).items, statements: [], unspecified: 1, unnamed: ["food"], savedAt: "2026-11-21T10:00:00Z" };
  assert.equal(arrangeAllergies(keepAllergies({ status: "failed" }, old), data()).open[0].canRemove, false);
});

test("the words", () => {
  const a = arrangeAllergies(read(MOLD, ENV), data());
  assert.equal(unnamedRow(a.open[0]).lines[1], "Your records don't say what you're allergic to. Ask your care team, say what it is if you know, or remove it if it's already on your list.");
  assert.deepEqual(removeUnnamedQuestion(a.open[0]), {
    title: "Remove the unnamed allergy?",
    lines: ["Environment, recorded Feb 28, 1979 (same day as Mold).", "Do this only if you think it's already on your list. If you're not sure, keep it and ask your care team.", "Staff still see the record, marked \"patient thinks it's already listed\"."],
    yes: "Yes, remove it"
  });
  assert.deepEqual(removedUnnamed(1), { text: "You removed an unnamed allergy from this list.", again: "Show it again" });
  assert.deepEqual(removedUnnamed(2), { text: "You removed 2 unnamed allergies from this list.", again: "Show them again" });
});

test("the popup starts on No, and there's always a way back", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const body = (name) => app.slice(app.indexOf("function " + name + "(")).split("\n}\n")[0];
  assert.match(body("askRemoveUnnamed"), /keep\.focus\(\)/);
  assert.match(body("drawAllergies"), /arranged\.removedKeys\.length/);
});
