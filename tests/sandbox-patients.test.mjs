// The saved list behind Browse all patients (design 2026-11-28), and the tool
// that counts each patient's records for it. Every record counts, errors and
// all (the developer, 2026-11-28).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countsFor } from "../tools/sandbox-patients.mjs";
import { MADE, PATIENTS } from "../js/sandbox-patients.js";
import { isAddedId } from "../js/browse.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const med = (status, code, text) => ({ status, medicationCodeableConcept: { text, coding: code ? [{ system: RXNORM, code }] : [] } });
const claim = (type, items) => ({ type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: type }] }, item: Array.from({ length: items }, () => ({})) });

test("every prescription counts, whatever its status", () => {
  const requests = ["active", "completed", "stopped", "on-hold", "entered-in-error", "cancelled", "draft", "unknown"].map((status) => med(status, "314076", "lisinopril 10 MG"));
  assert.equal(countsFor({ requests, statements: [], allergies: [], claims: [] }).prescriptions, 8);
});

test("different medicines go by RxNorm code, else by name, across prescriptions and statements", () => {
  const counts = countsFor({
    requests: [med("active", "314076", "lisinopril 10 MG"), med("completed", "314076", "Lisinopril 10 mg tablet"), med("entered-in-error", null, "Aspirin 81 MG")],
    statements: [med("active", null, "ASPIRIN 81 mg"), med("unknown", "197361", "amlodipine 5 MG"), { status: "active" }],
    allergies: [], claims: []
  });
  // lisinopril, aspirin (by name, any case), amlodipine, and one record that names nothing.
  assert.equal(counts.different, 4);
  // Active ones: lisinopril, aspirin, and the one that names nothing.
  assert.equal(counts.current, 3);
});

test("fills are the items on pharmacy claims; every allergy counts", () => {
  const counts = countsFor({
    requests: [], statements: [],
    allergies: [{ verificationStatus: { coding: [{ code: "entered-in-error" }] } }, { verificationStatus: { coding: [{ code: "refuted" }] } }, {}],
    claims: [claim("pharmacy", 2), claim("pharmacy", 1), claim("professional", 5), {}]
  });
  assert.equal(counts.fills, 3);
  assert.equal(counts.allergies, 3);
});

test("the saved list: the sandbox's own patients with a medicine record, and 25 who have died", () => {
  assert.match(MADE, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(PATIENTS.length > 400, String(PATIENTS.length));
  assert.equal(new Set(PATIENTS.map((p) => p.id)).size, PATIENTS.length);
  assert.equal(PATIENTS.filter((p) => p.deceased).length, 25);
  for (const p of PATIENTS) {
    assert.ok(p.different > 0 || p.prescriptions > 0, p.id);
    assert.equal(isAddedId(p.id), false, p.id);
    assert.ok(p.name === null || (typeof p.name === "string" && p.name.trim()), p.id);
    assert.ok(p.born === null || /^\d{4}(-\d{2}(-\d{2})?)?$/.test(p.born), p.id);
    for (const key of ["different", "prescriptions", "current", "fills", "allergies"]) assert.ok(Number.isInteger(p[key]) && p[key] >= 0, p.id + " " + key);
  }
});

test("the saved list works with no signal", () => {
  assert.ok(read("sw.js").includes('"./js/sandbox-patients.js"'));
});
