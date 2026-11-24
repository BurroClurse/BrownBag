import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromAllergyRecords, readAllergies, keepAllergies, arrangeAllergies, reactionLine, detailLines, sameAllergen, ALLERGENS, REACTIONS, allergyNotes, allergyDraftStarted, unsavedAllergyText, setMyReaction, removeMine, putBack, saysNone, unspecifiedText, startedDraft, keepDrafts, showsSymbol } from "../js/allergies.js";

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
    codes: [{ system: SNOMED, code: "84489001" }], clinical: "active", reactions: [], intolerance: false, unconfirmed: false, highRisk: false,
    fhir: { verification: "confirmed", type: null, category: [], criticality: null, recordedDate: null }, source: "SMART sandbox"
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

const loaded = (list = [], statements = [], unspecified = 0) => ({ status: "loaded", items: list, statements, unspecified, savedAt: null });
const own = (name, o = {}) => Object.assign({ id: "o1", name, rxcui: null, reaction: "Itching", addedAt: "2026-11-23" }, o);
const data = (o = {}) => Object.assign({ allergies: [], allergyReactions: {}, noKnownAllergies: null }, o);

test("the patient's own and a record of the same thing share one card", () => {
  const out = arrangeAllergies(loaded(items(named("Penicillin"))), data({ allergies: [own("penicillin ")] }));
  assert.equal(out.count, 1);
  assert.equal(out.cards[0].origin, "records");
  assert.equal(out.cards[0].mine.reaction, "Itching");
  assert.deepEqual(out.cards[0].mine.ids, ["o1"]);
  const apart = arrangeAllergies(loaded(items(rec())), data({ allergies: [own("Penicillin")] }));
  assert.deepEqual(apart.cards.map((c) => [c.name, c.origin]), [["Mold", "records"], ["Penicillin", "added"]]);
});

test("the patient's reaction stays when the record's code changes but not its name", () => {
  const d = data();
  setMyReaction(d, arrangeAllergies(loaded(items(rec())), d).cards[0], "Hives or rash", "2026-11-23");
  const mine = (list) => arrangeAllergies(loaded(list), d).cards[0].mine;
  assert.equal(mine(items(rec())).reaction, "Hives or rash");
  assert.equal(mine(items(coded("999", "Mold"))).reaction, "Hives or rash");
  assert.equal(mine(items(named("mold"))).reaction, "Hives or rash");
  // The name changes and the code stays: still theirs.
  assert.equal(mine(items(rec({ code: { coding: [{ system: SNOMED, code: "84489001", display: "Mould" }] } }))).reaction, "Hives or rash");
  // After a change of code, Change and Remove still act on the same entry.
  const changed = arrangeAllergies(loaded(items(coded("999", "Mold"))), d).cards[0];
  setMyReaction(d, changed, "Itching", "2026-11-24");
  assert.equal(Object.keys(d.allergyReactions).length, 1);
  removeMine(d, arrangeAllergies(loaded(items(named("Mold"))), d).cards[0]);
  assert.deepEqual(d.allergyReactions, {});
});

test("a reaction under a broad code goes only to the allergy it was added to", () => {
  const list = items(rec({ id: "1", code: { coding: [{ system: SNOMED, code: "416098002" }], text: "Penicillin" } }), rec({ id: "2", code: { coding: [{ system: SNOMED, code: "416098002" }], text: "Sulfa" } }));
  assert.deepEqual(list.map((i) => i.name), ["Penicillin", "Sulfa"]);
  assert.notEqual(list[0].key, list[1].key);
  const d = data();
  setMyReaction(d, arrangeAllergies(loaded(list), d).cards[1], "Hives or rash", "2026-11-23");
  assert.deepEqual(arrangeAllergies(loaded(list), d).cards.map((c) => c.mine && c.mine.reaction), [null, "Hives or rash"]);
});

test("different allergies that share a placeholder code stay apart", () => {
  const absent = (text) => rec({ code: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/data-absent-reason", code: "unknown" }], text } });
  assert.deepEqual(items(absent("Penicillin"), absent("Latex")).map((i) => i.name), ["Latex", "Penicillin"]);
  assert.equal(items(absent("Penicillin"), rec({ id: "9", code: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/data-absent-reason", code: "unknown" }] } })).length, 2);
  // A nameless record of a real code joins the one that has its name.
  assert.deepEqual(items(rec({ id: "1", code: { coding: [{ system: SNOMED, code: "84489001" }] } }), rec()).map((i) => i.name), ["Mold"]);
});

test("two of the patient's own with one name keep both reactions", () => {
  const d = data({ allergies: [own("Penicillin", { id: "a", reaction: "Severe reaction (anaphylaxis)" }), own("penicillin", { id: "b", reaction: "Itching" })] });
  const out = arrangeAllergies(loaded(), d);
  assert.equal(out.count, 1);
  assert.equal(reactionLine(out.cards[0]), "Reaction: Severe reaction (anaphylaxis) · Itching");
  const removed = removeMine(d, out.cards[0]);
  assert.equal(d.allergies.length, 0);
  putBack(d, removed);
  assert.equal(d.allergies.length, 2);
});

test("the patient's own and their reaction on the record both show", () => {
  const d = data({ allergies: [own("Mold", { reaction: "Itching" })] });
  setMyReaction(data(), arrangeAllergies(loaded(items(rec())), data()).cards[0], "x", "2026-11-23");
  d.allergyReactions = { "alg:name:mold": { name: "Mold", keys: ["alg:name:mold"], reaction: "Hives or rash", addedAt: "2026-11-23" } };
  const card = arrangeAllergies(loaded(items(rec())), d).cards[0];
  assert.equal(reactionLine(card), "Reaction: Hives or rash · Itching (added by me)");
  const removed = removeMine(d, card);
  assert.deepEqual([d.allergies.length, Object.keys(d.allergyReactions).length], [0, 0]);
  putBack(d, removed);
  assert.deepEqual([d.allergies.length, Object.keys(d.allergyReactions).length], [1, 1]);
});

test("the patient's own and a record with the same drug code share one card", () => {
  const RX = "http://www.nlm.nih.gov/research/umls/rxnorm";
  const out = arrangeAllergies(loaded(items(rec({ code: { coding: [{ system: RX, code: "1191" }], text: "acetylsalicylic acid" } }))), data({ allergies: [own("Aspirin", { rxcui: "1191" })] }));
  assert.equal(out.count, 1);
  assert.equal(out.cards[0].mine.reaction, "Itching");
});

test("a reaction with a code but no words is never lost", () => {
  assert.deepEqual(items(rec({ reaction: [{ manifestation: [{ coding: [{ system: SNOMED, code: "39579001" }] }], severity: "severe" }] }))[0].reactions, [{ text: "Unnamed reaction", severity: "severe", codes: [{ system: SNOMED, code: "39579001" }] }]);
  assert.deepEqual(items(rec({ reaction: [{ severity: "moderate" }] }))[0].reactions, [{ text: "Unnamed reaction", severity: "moderate" }]);
});

test("joined records keep the worst severity", () => {
  const r = (severity) => rec({ reaction: [{ manifestation: [{ text: "Hives" }], severity }] });
  for (const order of [["mild", "severe"], ["severe", "mild"], ["severe", undefined], [undefined, "severe"]]) {
    assert.deepEqual(items(r(order[0]), r(order[1]))[0].reactions, [{ text: "Hives", severity: "severe" }], order.join());
  }
});

test("a Bundle that says something was withheld is a failure, not none", async () => {
  const says = async (b) => (await readAllergies(async () => b, "p", "S", 500)).status;
  const outcome = (severity) => ({ resource: { resourceType: "OperationOutcome", issue: [{ severity, code: "forbidden" }] } });
  assert.equal(await says({ resourceType: "Bundle", entry: [outcome("error")] }), "failed");
  assert.equal(await says({ resourceType: "Bundle", entry: [outcome("fatal"), { resource: rec() }] }), "failed");
  assert.equal(await says({ resourceType: "Bundle", total: 3, entry: [] }), "failed");
  assert.equal(await says({ resourceType: "Bundle", total: 0 }), "loaded");
  assert.equal(await says({ resourceType: "Bundle", total: 1, entry: [outcome("warning"), { resource: rec() }] }), "loaded");
});

test("saysNone spots words that mean no allergies", () => {
  for (const text of ["none", "No known allergies", "no allergies", "NKDA", "no known drug allergies", "No known food allergy", "nka"]) assert.equal(saysNone(text), true, text);
  for (const text of ["Nona plant", "Non-steroidals", "Nuts", "no-name cream"]) assert.equal(saysNone(text), false, text);
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
  const saved = { items: items(rec()), statements: ["x"], unspecified: 2, savedAt: "2026-11-21T10:00:00Z" };
  assert.deepEqual(keepAllergies({ status: "failed", items: [], statements: [] }, saved), { status: "failed", items: saved.items, statements: ["x"], unspecified: 2, savedAt: "2026-11-21T10:00:00Z" });
  assert.equal(keepAllergies({ status: "refused", items: [], statements: [] }, saved).items.length, 1);
  assert.deepEqual(keepAllergies({ status: "failed", items: [], statements: [] }, undefined), { status: "failed", items: [], statements: [], unspecified: 0, savedAt: null });
  assert.deepEqual(keepAllergies({ status: "loaded", items: [], statements: [] }, saved, new Date(0)), Object.assign(loaded(), { updatedAt: "1970-01-01T00:00:00.000Z" }));
  assert.equal(keepAllergies(null, undefined).status, "not-loaded");
  assert.deepEqual(keepAllergies(null, saved), { status: "loaded", items: saved.items, statements: ["x"], unspecified: 2, savedAt: saved.savedAt });
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
  assert.deepEqual(stalled, { status: "failed", items: [], statements: [], unspecified: 0 });
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
  assert.deepEqual(REACTIONS.map((a) => a.label), ["Hives", "Rash", "Itching", "Swelling of the face, lips or throat", "Trouble breathing", "Severe reaction (anaphylaxis)", "Nausea", "Vomiting", "Not sure"]);
});

test("the drug ingredients on the list carry their RxNorm code, and nothing else does", () => {
  assert.deepEqual(ALLERGENS.filter((a) => a.rxcui).map((a) => a.label + " " + a.rxcui), ["Amoxicillin 723", "Aspirin 1191", "Ibuprofen 5640", "Codeine 2670", "Bee stings 124427"]);
});

test("the allergies module is kept for offline use", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/allergies.js"'));
});

test("allergyNotes says what didn't load, and when the saved ones are from", () => {
  const now = new Date(2026, 10, 23, 12, 0);
  const at = new Date(2026, 10, 21, 8, 0).toISOString();
  const notes = (status, savedAt) => allergyNotes({ status, savedAt, items: [], statements: [] }, now);
  assert.deepEqual(notes("loaded", null), []);
  assert.deepEqual(notes("loaded", at), [{ text: "These are from Nov 21.", signIn: false }]);
  assert.deepEqual(notes("failed", null), [{ text: "Your allergies couldn't be loaded.", signIn: false }]);
  assert.deepEqual(notes("failed", at), [{ text: "Your allergies couldn't be updated. These are from Nov 21.", signIn: false }]);
  assert.deepEqual(notes("refused", null), [{ text: "Sign in again to add your allergies.", signIn: true }]);
  assert.deepEqual(notes("refused", at), [{ text: "Sign in again to update your allergies. These are from Nov 21.", signIn: true }]);
  assert.deepEqual(notes("not-loaded", null), [{ text: "Your allergies haven't been loaded yet.", signIn: false }]);
});

test("a half-typed allergy counts once anything is chosen, and is named", () => {
  const none = { allergen: { choice: "", other: "" }, reaction: { choice: "", other: "" } };
  assert.equal(allergyDraftStarted(null), false);
  assert.equal(allergyDraftStarted(none), false);
  assert.equal(allergyDraftStarted({ allergen: { choice: "Latex", other: "" }, reaction: none.reaction }), true);
  assert.equal(allergyDraftStarted({ allergen: none.allergen, reaction: { choice: "Itching", other: "" } }), true);
  assert.equal(unsavedAllergyText({ allergen: { choice: "Penicillin", other: "" }, reaction: none.reaction }, null), "Penicillin isn't saved yet. Open My medicines to finish adding it.");
  assert.equal(unsavedAllergyText({ allergen: { choice: "other", other: " Kiwi " }, reaction: none.reaction }, null), "Kiwi isn't saved yet. Open My medicines to finish adding it.");
  assert.equal(unsavedAllergyText({ allergen: none.allergen, reaction: { choice: "Itching" } }, null), "The allergy you were adding isn't saved yet. Open My medicines to finish adding it.");
  assert.equal(unsavedAllergyText({ allergen: none.allergen, reaction: { choice: "Itching" } }, "Mold"), "The reaction to Mold isn't saved yet. Open My medicines to finish adding it.");
});

test("changing the reaction keeps the patient's own entry, so it outlives the record", () => {
  const d = data({ allergies: [own("Penicillin"), own("penicillin", { id: "o2", reaction: "Hives or rash" })] });
  const withRecord = arrangeAllergies(loaded(items(named("Penicillin"))), d).cards[0];
  setMyReaction(d, withRecord, "Trouble breathing", "2026-11-24");
  assert.equal(arrangeAllergies(loaded(items(named("Penicillin"))), d).cards[0].mine.reaction, "Trouble breathing");
  const later = arrangeAllergies(loaded(), d);
  assert.deepEqual(later.cards.map((c) => [c.name, c.origin, reactionLine(c)]), [["Penicillin", "added", "Reaction: Trouble breathing"]]);
});

const tendency = (o = {}) => rec(Object.assign({ id: "t", code: { coding: [{ system: SNOMED, code: "609328004", display: "Allergic disposition (finding)" }], text: "Allergic disposition (finding)" } }, o));
test("an entry that doesn't say what it's to is counted apart, not listed", () => {
  const out = fromAllergyRecords([tendency(), rec()], "S");
  assert.deepEqual(out.items.map((i) => i.name), ["Mold"]);
  assert.equal(out.unspecified, 1);
  assert.equal(fromAllergyRecords([rec({ code: { text: "Allergic disposition" } })], "S").unspecified, 1);
  assert.equal(fromAllergyRecords([tendency({ clinicalStatus: { coding: [{ code: "resolved" }] } })], "S").unspecified, 0);
  // One that has a reaction stays a card, so the reaction isn't lost.
  const kept = fromAllergyRecords([tendency({ reaction: [{ manifestation: [{ text: "Hives" }] }] })], "S");
  assert.deepEqual([kept.items.length, kept.unspecified], [1, 0]);
  assert.equal(arrangeAllergies(loaded([], [], 1), data()).unspecified, 1);
});

test("unspecifiedText says it, and never beside 'none'", () => {
  assert.equal(unspecifiedText(0, 3), null);
  assert.equal(unspecifiedText(1, 1), "Your records also have an allergy entry that doesn't say what it's to. Ask your care team.");
  assert.equal(unspecifiedText(1, 0), "Your records have an allergy entry that doesn't say what it's to. Ask your care team.");
  assert.equal(unspecifiedText(2, 1), "Your records also have 2 allergy entries that don't say what they're to. Ask your care team.");
});

test("every code of a record is kept, and its own clinical status", () => {
  const two = items(rec({ clinicalStatus: { coding: [{ code: "recurrence" }] }, code: { text: "Aspirin", coding: [{ system: "http://local", code: "A1" }, { system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "1191" }] } }))[0];
  assert.deepEqual(two.codes.map((c) => c.code), ["A1", "1191"]);
  assert.equal(two.clinical, "recurrence");
  assert.equal(items(rec({ clinicalStatus: undefined }))[0].clinical, "active");
  assert.deepEqual(items(coded("1", "Peanut"), coded("2", "peanut"))[0].codes.map((c) => c.code), ["1", "2"]);
});

test("a record with no code, name or id keeps its key when the order changes", () => {
  const a = { resourceType: "AllergyIntolerance", recordedDate: "2020-01-01", category: ["food"] };
  const b = { resourceType: "AllergyIntolerance", recordedDate: "2021-01-01", category: ["food"] };
  const keys = (list) => Object.fromEntries(items(...list).map((i, n) => [n, i.key]));
  assert.deepEqual(new Set(Object.values(keys([a, b]))), new Set(Object.values(keys([b, a]))));
  assert.equal(new Set(items(a, b).map((i) => i.key)).size, 2);
  // Two that say exactly the same nothing are one.
  assert.equal(items(a, Object.assign({}, a)).length, 1);
});

test("a half-typed new allergy survives opening a reaction form, and goes when its record does", () => {
  const started = { allergen: { choice: "Latex", other: "" }, reaction: { choice: "", other: "" } };
  const empty = { allergen: { choice: "", other: "" }, reaction: { choice: "", other: "" } };
  const onMold = { allergen: { choice: "", other: "" }, reaction: { choice: "Itching", other: "" } };
  const cards = [{ key: "alg:mold", name: "Mold" }];
  assert.deepEqual(Object.keys(keepDrafts({ new: started, "alg:mold": onMold, "alg:gone": onMold, "alg:x": empty }, cards)), ["new", "alg:mold"]);
  assert.equal(startedDraft({ new: empty }), null);
  assert.equal(startedDraft({ "alg:mold": onMold, new: started }, "new"), "new");
  assert.equal(startedDraft({ "alg:mold": onMold }, "new"), "alg:mold");
});

test("each choice on the list has the FHIR category it belongs to", () => {
  const by = (c) => ALLERGENS.filter((a) => a.category === c).map((a) => a.label);
  assert.deepEqual(by("medication"), ["Penicillin", "Amoxicillin", "Sulfa antibiotics", "Aspirin", "Ibuprofen", "Codeine", "Contrast dye"]);
  assert.deepEqual(by("food"), ["Peanuts", "Tree nuts", "Shellfish", "Eggs", "Milk"]);
  assert.deepEqual(by("environment"), ["Latex", "Bee stings"]);
});

test("the warning symbol shows for an allergy, an unnamed entry, or a load that failed", () => {
  assert.equal(showsSymbol(0, 0, "loaded"), false);
  assert.equal(showsSymbol(1, 0, "loaded"), true);
  assert.equal(showsSymbol(0, 1, "loaded"), true);
  for (const status of ["failed", "refused", "not-loaded", undefined]) assert.equal(showsSymbol(0, 0, status), true, status);
});

// The date staff see for allergies. If this broke, a saved copy could be
// dated as if it had just loaded.
test("allergies that just loaded carry the time, and a saved copy doesn't get a new one", () => {
  const now = new Date("2026-11-23T10:00:00.000Z");
  const result = { status: "loaded", items: [], statements: [] };
  const saved = { items: [], statements: [], savedAt: "2026-11-19T10:00:00.000Z" };
  assert.equal(keepAllergies(result, saved, now).updatedAt, "2026-11-23T10:00:00.000Z");
  assert.equal(keepAllergies({ status: "failed", items: [], statements: [] }, saved, now).updatedAt, undefined);
  assert.equal(keepAllergies(null, saved, now).updatedAt, undefined);
  assert.equal(keepAllergies(null, saved, now).savedAt, "2026-11-19T10:00:00.000Z");
});
