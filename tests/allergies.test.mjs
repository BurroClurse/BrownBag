import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromAllergyRecords, readAllergies, keepAllergies, arrangeAllergies, reactionLine, detailLines, sameAllergen, ALLERGENS, REACTIONS } from "../js/allergies.js";

const SNOMED = "http://snomed.info/sct";
const rec = (o = {}) => Object.assign({
  resourceType: "AllergyIntolerance",
  id: "1",
  clinicalStatus: { coding: [{ code: "active" }] },
  verificationStatus: { coding: [{ code: "confirmed" }] },
  code: { coding: [{ system: SNOMED, code: "84489001", display: "Mold (organism)" }], text: "Mold (organism)" }
}, o);
const named = (text, o = {}) => rec(Object.assign({ code: { text } }, o));
const coded = (code, display, o = {}) => rec(Object.assign({ code: { coding: [{ system: SNOMED, code, display }] } }, o));
const status = (field, code) => ({ [field]: { coding: [{ code }] } });
const items = (...list) => fromAllergyRecords(list, "SMART sandbox").items;

test("a record becomes one allergy with a plain name and a key from its code", () => {
  assert.deepEqual(items(rec()), [{
    key: "alg:http://snomed.info/sct|84489001", otherKeys: ["alg:name:mold"], name: "Mold",
    code: { system: SNOMED, code: "84489001" }, reactions: [], intolerance: false, unconfirmed: false, highRisk: false, source: "SMART sandbox"
  }]);
  assert.equal(items(named("Latex"))[0].key, "alg:name:latex");
  assert.equal(items(named("Penicillin (class of drug)"))[0].name, "Penicillin (class of drug)");
});

test("mistaken, ruled out and past allergies are left out; a missing status stays in", () => {
  assert.equal(items(rec(status("verificationStatus", "entered-in-error"))).length, 0);
  assert.equal(items(rec(status("verificationStatus", "refuted"))).length, 0);
  assert.equal(items(rec(status("clinicalStatus", "inactive"))).length, 0);
  assert.equal(items(rec(status("clinicalStatus", "resolved"))).length, 0);
  assert.equal(items(rec({ clinicalStatus: undefined, verificationStatus: undefined })).length, 1);
  assert.equal(fromAllergyRecords([{ resourceType: "OperationOutcome" }, null], "S").items.length, 0);
});

test("an allergy with no name is still listed, and two of them stay two", () => {
  const list = items(rec({ id: "a", code: {} }), rec({ id: "b", code: undefined }));
  assert.deepEqual(list.map((i) => i.name), ["Unnamed allergy", "Unnamed allergy"]);
  assert.notEqual(list[0].key, list[1].key);
  assert.equal(items(rec({ code: { coding: [{ system: SNOMED, code: "5" }] } }))[0].name, "Unnamed allergy");
});

test("every reaction is read, with its severity", () => {
  const reaction = [{ manifestation: [{ text: "Hives" }, { coding: [{ display: "Wheezing (finding)" }] }], severity: "severe" }, { description: "Faint" }];
  assert.deepEqual(items(rec({ reaction }))[0].reactions, [{ text: "Hives", severity: "severe" }, { text: "Wheezing", severity: "severe" }, { text: "Faint", severity: null }]);
});

test("records of one allergy join, keeping every reaction and the highest risk", () => {
  const one = items(
    rec({ id: "1", reaction: [{ manifestation: [{ text: "Hives" }] }] }),
    rec({ id: "2", criticality: "high", reaction: [{ manifestation: [{ text: "hives" }] }, { manifestation: [{ text: "Cough" }] }] })
  );
  assert.equal(one.length, 1);
  assert.deepEqual(one[0].reactions.map((r) => r.text), ["Hives", "Cough"]);
  assert.equal(one[0].highRisk, true);
  const byName = items(coded("1", "Peanut"), coded("2", "peanut (substance)"));
  assert.equal(byName.length, 1);
  assert.ok(byName[0].otherKeys.includes("alg:http://snomed.info/sct|2"));
});

test("a joined allergy is unconfirmed only when every record of it is", () => {
  assert.equal(items(rec(status("verificationStatus", "unconfirmed")))[0].unconfirmed, true);
  assert.equal(items(rec(status("verificationStatus", "presumed")))[0].unconfirmed, true);
  assert.equal(items(rec(status("verificationStatus", "unconfirmed")), rec())[0].unconfirmed, false);
  assert.equal(items(rec({ type: "intolerance" }))[0].intolerance, true);
  assert.equal(items(rec({ type: "intolerance" }), rec({ type: "allergy" }))[0].intolerance, false);
});

test("no known allergy records are statements, not allergies", () => {
  const all = fromAllergyRecords([coded("716186003", "No known allergy (situation)"), coded("409137002", "x"), coded("429625007", "x"), coded("428607008", "x"), named("No Known Allergies")], "S");
  assert.equal(all.items.length, 0);
  assert.deepEqual(all.statements, ["No known allergy", "No known drug allergy", "No known food allergy", "No known environmental allergy"]);
});

const card = (o) => Object.assign({ origin: "records", reactions: [], mine: null, source: "SMART sandbox" }, o);
test("reactionLine never leaves a blank", () => {
  assert.equal(reactionLine(card()), "Reaction not in your records");
  assert.equal(reactionLine(card({ reactions: [{ text: "Hives", severity: "severe" }] })), "Reaction: Hives (severe)");
  assert.equal(reactionLine(card({ mine: { reaction: "Itching" } })), "Reaction: Itching (added by me)");
  assert.equal(reactionLine(card({ reactions: [{ text: "Hives" }], mine: { reaction: "Itching" } })), "Reaction: Hives · Itching (added by me)");
  assert.equal(reactionLine(card({ mine: { reaction: "Not sure" } })), "Reaction not known (added by me)");
  assert.equal(reactionLine(card({ origin: "added", mine: { reaction: "Not sure" } })), "Reaction not known");
  assert.equal(reactionLine(card({ origin: "added", mine: { reaction: "Itching" } })), "Reaction: Itching");
});

test("detailLines shows only what the record says", () => {
  assert.deepEqual(detailLines(card()), ["SMART sandbox"]);
  assert.deepEqual(detailLines(card({ intolerance: true, unconfirmed: true, highRisk: true })), ["Marked high risk", "Intolerance", "Not confirmed", "SMART sandbox"]);
  assert.deepEqual(detailLines(card({ origin: "added", mine: { addedAt: "2026-11-23" } })), ["Added by me · Nov 23, 2026"]);
});

const loaded = (list = [], statements = []) => ({ status: "loaded", items: list, statements, savedAt: null });
const own = (name, o = {}) => Object.assign({ id: "o1", name, rxcui: null, reaction: "Itching", addedAt: "2026-11-23" }, o);
const data = (o = {}) => Object.assign({ allergies: [], allergyReactions: {}, noKnownAllergies: null }, o);

test("the patient's own and a record of the same thing share one card", () => {
  const out = arrangeAllergies(loaded(items(named("Penicillin"))), data({ allergies: [own("penicillin ")] }));
  assert.equal(out.count, 1);
  assert.equal(out.cards[0].origin, "records");
  assert.equal(out.cards[0].mine.reaction, "Itching");
  assert.equal(out.cards[0].mine.id, "o1");
  const apart = arrangeAllergies(loaded(items(rec())), data({ allergies: [own("Penicillin")] }));
  assert.deepEqual(apart.cards.map((c) => [c.name, c.origin]), [["Mold", "records"], ["Penicillin", "added"]]);
});

test("the patient's reaction stays when the record's code changes but not its name", () => {
  const out = arrangeAllergies(loaded(items(rec())), data({ allergyReactions: { "alg:name:mold": { reaction: "Hives or rash", addedAt: "2026-11-23" } } }));
  assert.equal(out.cards[0].mine.reaction, "Hives or rash");
  assert.equal(out.cards[0].mineKey, "alg:name:mold");
});

test("no known allergies counts only while nothing is listed", () => {
  const said = data({ noKnownAllergies: "2026-11-23" });
  assert.equal(arrangeAllergies(loaded(), said).saidNone, "2026-11-23");
  assert.equal(arrangeAllergies(loaded(items(rec())), said).saidNone, null);
  assert.equal(arrangeAllergies(loaded(), data({ noKnownAllergies: "2026-11-23", allergies: [own("Latex")] })).saidNone, null);
});

test("no known allergies is offered only after the records' allergies loaded", () => {
  assert.equal(arrangeAllergies(loaded(), data()).canSayNone, true);
  assert.equal(arrangeAllergies(loaded([], ["No known drug allergy"]), data()).canSayNone, true);
  assert.equal(arrangeAllergies(loaded(items(rec())), data()).canSayNone, false);
  assert.equal(arrangeAllergies(loaded(), data({ noKnownAllergies: "2026-11-23" })).canSayNone, false);
  for (const s of ["failed", "refused", "not-loaded"]) {
    assert.equal(arrangeAllergies({ status: s, items: [], statements: [], savedAt: null }, data()).canSayNone, false, s);
  }
  assert.equal(arrangeAllergies({ status: "failed", items: [], statements: [], savedAt: "2026-11-21T10:00:00Z" }, data()).canSayNone, true);
});

test("a failed load keeps the saved allergies and their date", () => {
  const saved = { items: items(rec()), statements: ["x"], savedAt: "2026-11-21T10:00:00Z" };
  assert.deepEqual(keepAllergies({ status: "failed", items: [], statements: [] }, saved), { status: "failed", items: saved.items, statements: ["x"], savedAt: "2026-11-21T10:00:00Z" });
  assert.equal(keepAllergies({ status: "refused", items: [], statements: [] }, saved).items.length, 1);
  assert.deepEqual(keepAllergies({ status: "failed", items: [], statements: [] }, undefined), { status: "failed", items: [], statements: [], savedAt: null });
  assert.deepEqual(keepAllergies({ status: "loaded", items: [], statements: [] }, saved), loaded());
  assert.equal(keepAllergies(null, undefined).status, "not-loaded");
  assert.deepEqual(keepAllergies(null, saved), { status: "loaded", items: saved.items, statements: ["x"], savedAt: saved.savedAt });
});

const bundle = (list, next) => ({ resourceType: "Bundle", entry: list.map((resource) => ({ resource })), link: next ? [{ relation: "next", url: next }] : [] });
test("readAllergies joins pages, and says refused or failed instead of throwing", async () => {
  const asked = [];
  const two = await readAllergies(async (url) => { asked.push(url); return asked.length === 1 ? bundle([rec()], "p2") : bundle([named("Latex")]); }, "p/1", "S", 500);
  assert.equal(two.status, "loaded");
  assert.deepEqual(two.items.map((i) => i.name), ["Latex", "Mold"]);
  assert.deepEqual(asked, ["AllergyIntolerance?patient=p%2F1", "p2"]);
  const fails = async (s) => (await readAllergies(async () => { throw Object.assign(new Error("x"), { status: s }); }, "p", "S", 500)).status;
  assert.equal(await fails(403), "refused");
  assert.equal(await fails(401), "refused");
  assert.equal(await fails(500), "failed");
  const start = Date.now();
  const stalled = await readAllergies((url) => url === "p2" ? new Promise(() => {}) : Promise.resolve(bundle([rec()], "p2")), "p", "S", 60);
  assert.deepEqual(stalled, { status: "failed", items: [], statements: [] });
  assert.ok(Date.now() - start < 400);
});

test("an answer that isn't a Bundle is a failure, never an empty list", async () => {
  assert.equal((await readAllergies(async () => ({ resourceType: "OperationOutcome" }), "p", "S", 500)).status, "failed");
  assert.equal((await readAllergies(async () => undefined, "p", "S", 500)).status, "failed");
});

test("sameAllergen ignores case, spacing and the SNOMED ending", () => {
  const cards = arrangeAllergies(loaded(items(rec())), data()).cards;
  assert.equal(sameAllergen("  mold ", cards).name, "Mold");
  assert.equal(sameAllergen("Latex", cards), null);
});

test("the pick lists hold the approved choices", () => {
  assert.deepEqual(ALLERGENS.map((a) => a.label), ["Penicillin", "Amoxicillin", "Sulfa antibiotics", "Aspirin", "Ibuprofen", "Codeine", "Contrast dye", "Latex", "Peanuts", "Tree nuts", "Shellfish", "Eggs", "Milk", "Bee stings"]);
  assert.deepEqual(REACTIONS.map((a) => a.label), ["Hives or rash", "Itching", "Swelling of the face, lips or throat", "Trouble breathing", "Severe reaction (anaphylaxis)", "Nausea or vomiting", "Not sure"]);
});

test("the allergies module is kept for offline use", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/allergies.js"'));
});
