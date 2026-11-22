import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAddition, displayName } from "../js/add-check.js";

const rec = (o) => Object.assign({ key: "rx:314076", name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", dose: "1 tablet", frequency: "1 by mouth once a day", origin: "records" }, o);

test("same code, same dose and schedule is a duplicate, even inside longer record wording", () => {
  assert.equal(checkAddition({ name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", dose: "1 tablet", frequency: "Once a day" }, [rec()], new Map()).kind, "duplicate");
});

test("twice a day matches a record that says 2 times a day", () => {
  assert.equal(checkAddition({ name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", dose: "1 tablet", frequency: "Twice a day" }, [rec({ frequency: "2 times a day" })], new Map()).kind, "duplicate");
});

test("same ingredient, different strength is different", () => {
  const ing = new Map([["314076", { rxcui: "29046" }], ["314077", { rxcui: "29046" }]]);
  assert.equal(checkAddition({ name: "lisinopril 20 MG Oral Tablet", rxcui: "314077", dose: "1 tablet", frequency: "Once a day" }, [rec()], ing).kind, "different");
});

test("same medicine with no dose on either side is different, never a duplicate", () => {
  assert.equal(checkAddition({ name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", dose: null, frequency: null }, [rec()], new Map()).kind, "different");
});

test("a stopped medicine wins over a duplicate", () => {
  const r = checkAddition({ name: "metformin 500 MG", rxcui: "861007", dose: null, frequency: null }, [rec({ key: "rx:861007", name: "metformin 500 MG", rxcui: "861007", stoppedAt: "2026-11-20" })], new Map());
  assert.equal(r.kind, "stopped");
  assert.equal(r.match.stoppedAt, "2026-11-20");
});

test("look-alike names that are different medicines", () => {
  const r = checkAddition({ name: "hydroxyzine 25 MG Oral Tablet", rxcui: "995258", dose: null, frequency: null }, [rec({ key: "rx:1", name: "hydralazine 25 MG Oral Tablet", rxcui: "905199" })], new Map());
  assert.equal(r.kind, "lookalike");
  assert.equal(r.match.name, "hydralazine 25 MG Oral Tablet");
});

test("a hand-typed near miss is a look-alike (Tyler, 2026-11-22)", () => {
  assert.equal(checkAddition({ name: "Lisinoprill", rxcui: null, dose: null, frequency: null }, [rec()], new Map()).kind, "lookalike");
});

test("a hand-typed exact name is the same medicine", () => {
  assert.equal(checkAddition({ name: "Lisinopril", rxcui: null, dose: "1 tablet", frequency: "once a day" }, [rec()], new Map()).kind, "duplicate");
});

test("short names and unrelated names pass", () => {
  assert.equal(checkAddition({ name: "Zinc", rxcui: null, dose: null, frequency: null }, [rec({ name: "Iron", rxcui: null })], new Map()), null);
  assert.equal(checkAddition({ name: "atorvastatin 20 MG", rxcui: "617310", dose: null, frequency: null }, [rec()], new Map()), null);
});

test("the check is kept for offline use", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/add-check.js"'));
});

test("offline, a different code of the same drug name is still the same medicine", () => {
  assert.equal(checkAddition({ name: "lisinopril 20 MG Oral Tablet", rxcui: "314077", dose: "1 tablet", frequency: "Once a day" }, [rec()], new Map()).kind, "different");
});

test("long-acting names skip the leading 24 HR when matching", () => {
  const er = rec({ key: "rx:860975", name: "24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet", rxcui: "860975", dose: "1 tablet", frequency: "once a day" });
  assert.equal(checkAddition({ name: "Metformin", rxcui: null, dose: "1 tablet", frequency: "Once a day" }, [er], new Map()).kind, "duplicate");
});

test("displayName is the drug's first word, capitalized, past any 24 HR", () => {
  assert.equal(displayName("24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet"), "Metformin");
  assert.equal(displayName("lisinopril 10 MG Oral Tablet"), "Lisinopril");
  assert.equal(displayName("Lisinoprill"), "Lisinoprill");
});
