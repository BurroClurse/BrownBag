import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAddition, displayName, lookalikeText } from "../js/add-check.js";

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

const typed = (name, extra = {}) => Object.assign({ key: "t:" + name, name, rxcui: null, dose: null, frequency: null, origin: "added" }, extra);

test("different vitamins are different medicines", () => {
  for (const [a, b] of [["Vitamin D3", "Vitamin B12"], ["vitamin c 500 mg", "Vitamin D 1000 IU"], ["Vitamin B6", "Vitamin B12"], ["Vitamin D3 5,000 IU", "Vitamin B12"], ["Vitamin C 500 mg/day", "Vitamin E"], ["Vitamin B 6", "vitamin B-12"], ["Vitamin E", "vitamin K2"]]) {
    assert.equal(checkAddition(typed(a), [typed(b)], new Map()), null, a + " / " + b);
  }
});

test("one vitamin written several ways is the same medicine", () => {
  for (const [a, b] of [["Vitamin D3", "vitamin D 1000 IU"], ["Vitamin B12", "vitamin b-12"], ["Vitamin B 12", "vitamin B12 500 mcg"], ["Vitamin C", "VITAMIN C 500 MG"], ["Vitamin B complex", "Vitamin B12"], ["vitamin", "Vitamin D"], ["Vitamin D 50 mcg", "Vitamin D3"], ["Vitamin A and D", "Vitamin D"], ["Vitamin A & D", "vitamin D"], ["Vitamin D3 K2", "Vitamin K"], ["Vitamin D3/K2", "Vitamin K"]]) {
    const result = checkAddition(typed(a), [typed(b)], new Map());
    assert.ok(result && result.kind !== "lookalike", a + " / " + b);
  }
});

test("displayName says which vitamin", () => {
  assert.equal(displayName("vitamin d3 1000 IU"), "Vitamin D3");
  assert.equal(displayName("Vitamin B 12"), "Vitamin B12");
  assert.equal(displayName("vitamin D 50 mcg"), "Vitamin D");
  assert.equal(displayName("Vitamin C 500 MG"), "Vitamin C");
  assert.equal(displayName("vitamin"), "Vitamin");
  assert.equal(displayName("Vitamin A and D"), "Vitamin");
});

test("a look-alike on the list comes before a look-alike that's stopped", () => {
  const list = [typed("Hydralazine", { key: "a", stoppedAt: "2026-11-01" }), typed("Hydralazine HCL", { key: "b" })];
  assert.equal(checkAddition(typed("Hydroxyzine"), list, new Map()).match.key, "b");
});

test("lookalikeText says where the look-alike is", () => {
  assert.equal(lookalikeText("Hydroxyzine", { name: "hydralazine 25 MG Oral Tablet" }), "Hydroxyzine looks like Hydralazine, which is already on your list. They're different medicines. Check the bottle.");
  assert.equal(lookalikeText("Hydroxyzine", { name: "hydralazine 25 MG Oral Tablet", stoppedAt: "2026-11-01" }), "Hydroxyzine looks like Hydralazine, which is on your stopped list. They're different medicines. Check the bottle.");
});
