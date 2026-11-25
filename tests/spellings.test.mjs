// How the same medicine is written in openFDA, DailyMed and RxNorm (looked at
// 2026-11-24; typed in by hand). One code is one card whatever the words. Where
// names alone differ, both show: a medicine twice is safer than one hidden. If a
// test here starts failing because more join, check nothing different joined.
import test from "node:test";
import assert from "node:assert/strict";
import { dedupe, fromMedicationRequest } from "../js/meds.js";
import { checkAddition } from "../js/add-check.js";

const RX = "http://www.nlm.nih.gov/research/umls/rxnorm";
const NDC = "http://hl7.org/fhir/sid/ndc";
// RxNav's word on these codes: products. Without it, a code with no name
// counts only as an ingredient's (Task 6c).
const PRODUCTS = new Map(["197884", "861007", "860975"].map((code) => [code, { tty: "SCD" }]));
const rec = (text, code, system = RX, types = PRODUCTS) => fromMedicationRequest({ resourceType: "MedicationRequest", status: "active", authoredOn: "2026-01-01", medicationCodeableConcept: { text, coding: code ? [{ system, code }] : [] } }, "S", new Map(), types);
const cards = (...records) => dedupe(records).length;
const asks = (typed, listed) => (checkAddition({ name: typed, dose: "", frequency: "" }, [{ name: listed, origin: "records", key: "k" }], new Map()) || { kind: null }).kind;

test("one RxNorm code is one card, however it's spelled", () => {
  assert.equal(cards(rec("lisinopril 40 MG Oral Tablet", "197884"), rec("LISINOPRIL TABLET [REMEDYREPACK INC.]", "197884"), rec("Lisinopril", "197884")), 1);
});

test("capital letters alone never make two cards", () => {
  assert.equal(cards(rec("LISINOPRIL"), rec("Lisinopril")), 1);
});

test("different codes never join, even with the same words", () => {
  assert.equal(cards(rec("Metformin Hydrochloride", "861007"), rec("Metformin Hydrochloride", "860975")), 2);
  // Nor without RxNav, when neither code can be trusted.
  assert.equal(cards(rec("Metformin Hydrochloride", "861007", RX, null), rec("Metformin Hydrochloride", "860975", RX, null)), 2);
});

// docs/LIMITS.md, 16 and 18.
test("names or package numbers alone: both show", () => {
  assert.equal(cards(rec("Lisinopril"), rec("LISINOPRIL TABLET"), rec("lisinopril 40 MG Oral Tablet")), 3);
  assert.equal(cards(rec("Lisinopril", "43063-800-30", NDC), rec("LISINOPRIL 40MG", "43063080030", NDC)), 2);
  assert.equal(cards(rec("Lisinopril", "43063-800-30", NDC), rec("lisinopril 40 MG Oral Tablet", "197884")), 2);
  assert.equal(cards(rec("Tylenol"), rec("Acetaminophen")), 2);
});

test("a name not from the drug list still gets asked about when its first word matches", () => {
  assert.equal(asks("Lisinopril", "LISINOPRIL TABLET"), "different");
  assert.equal(asks("Metformin", "METFORMIN HYDROCHLORIDE"), "different");
  assert.equal(asks("Lisinopril", "Lisinopril and Hydrochlorothiazide"), "different");
  // Known gaps: no shared first word.
  assert.equal(asks("Tylenol", "Acetaminophen"), null);
  assert.equal(asks("Sitagliptin and Metformin Hydrochloride", "Metformin"), null);
  assert.equal(asks("Infants TYLENOL", "Tylenol"), null);
});
