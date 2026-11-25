// What a medicine's card says, piece by piece. If these fail, the dose can run
// into the prescriber again, or a value can sit under the wrong label, for the
// patient on My medicines or for staff on the staff page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dateText, drawCard, fillRows, patientCard, takeRows } from "../js/card.js";
import { buildShareBundle, fitsInQr, groupShareBundle, packShare } from "../js/share.js";
import { drawShareList } from "../js/share-list.js";
import { makeAddition } from "../js/view.js";

const PATIENT = { name: "Avery Brownbag", birthDate: "1950-03-14" };
const NOW = new Date("2026-11-23T12:00:00Z");
const ITEM = { key: "rx:314076", name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", dose: "1 tablet", route: "Oral", frequency: "once a day", start: "2023-03-02T10:00:00Z", end: null, prescriber: "Dr. Patel", source: "SMART sandbox", count: 1, origin: "records" };
const FILLS = { count: 3, last: "2025-07-23", insurers: ["Aetna"], cash: false };
const item = (o) => Object.assign({}, ITEM, o);

test("dose, route and how often are separate, in the order they're read", () => {
  assert.deepEqual(takeRows("1 tablet", "Oral", "once a day"), [["Dose", "1 tablet"], ["How taken", "Oral"], ["How often", "once a day"]]);
  assert.deepEqual(takeRows(null, null, "once a day"), [["How often", "once a day"]]);
  assert.deepEqual(takeRows(null, null, null), []);
});

// A prescriber's whole sentence isn't a "how often".
test("a full instruction is called Directions", () => {
  for (const text of ["Take 1 Cap by mouth 2 times daily., Starting 10/5/2013, Until Sun 10/5/14, Print", "Apply thin layer", "0.92 mg (1 mg/m2 × 0.92 m2 Treatment Plan BSA from Recorded weight), Subcutaneous, Once"]) {
    assert.deepEqual(takeRows(null, null, text), [["Directions", text]]);
  }
  assert.deepEqual(takeRows(null, null, "Take as needed."), [["Directions", "Take as needed."]]);
  for (const text of ["3 times a day", "At bedtime", "As needed", "every 4 to 6 hours"]) assert.equal(takeRows(null, null, text)[0][0], "How often", text);
});

test("dates read as words, only as exact as the record", () => {
  assert.equal(dateText("2023-03-02T10:00:00Z"), "Mar 2, 2023");
  assert.equal(dateText("2026-09"), "Sep 2026");
  assert.equal(dateText("2026"), "2026");
  for (const odd of ["soon", "2026-13-01", "2026-00", ""]) assert.equal(dateText(odd), odd);
});

test("the patient's card keeps how to take it apart from everything else", () => {
  const card = patientCard(item({ count: 6, firstDate: "2019-06-01", end: "2024-05-01", fills: FILLS }), true);
  assert.deepEqual(card.take, [["Dose", "1 tablet"], ["How taken", "Oral"], ["How often", "once a day"]]);
  assert.deepEqual(card.flags, []);
  assert.deepEqual(card.facts, [["Prescribed by", "Dr. Patel"], ["Since", "Mar 2, 2023"], ["Until", "May 1, 2024"], ["Prescribed", "6 times, first in 2019"], ["Filled", "3 times, last Jul 23, 2025"], ["Paid", "Through Aetna"], ["Source", "SMART sandbox"]]);
});

test("what isn't known has no row, and repeats with no date say so plainly", () => {
  assert.deepEqual(patientCard(item({ dose: null, route: null, frequency: null, start: null, prescriber: null, count: 2 }), true), { take: [], flags: [], facts: [["In your records", "2 times"], ["Source", "SMART sandbox"]] });
});

// "No fill found" must never show because the claims couldn't be read.
test("fills show only when the claims loaded", () => {
  const none = item({ fills: { count: 0, last: null, insurers: [], cash: false } });
  assert.ok(patientCard(none, true).facts.some(([label, text]) => label === "Filled" && text === "No fill found in your claims"));
  assert.ok(!patientCard(none, false).facts.some(([label]) => label === "Filled"));
});

test("each kind of fill says how often, when, and who paid", () => {
  const rows = (o) => fillRows(Object.assign({ count: 1, last: "2025-07-23", insurers: ["Aetna"], cash: false }, o));
  assert.deepEqual(rows({}), [["Filled", "Once, Jul 23, 2025"], ["Paid", "Through Aetna"]]);
  assert.deepEqual(rows({ count: 2, insurers: ["Aetna", "Medicare"] }), [["Filled", "2 times, last Jul 23, 2025"], ["Paid", "Through Aetna and Medicare"]]);
  assert.deepEqual(rows({ insurers: [], cash: true }), [["Filled", "Once, Jul 23, 2025"], ["Paid", "Without insurance"]]);
  assert.deepEqual(rows({ count: 2, cash: true }), [["Filled", "2 times, last Jul 23, 2025"], ["Paid", "Through Aetna, some without insurance"]]);
  assert.deepEqual(rows({ last: null }), [["Filled", "Once, date not given"], ["Paid", "Through Aetna"]]);
  assert.deepEqual(rows({ count: 2, last: null }), [["Filled", "2 times, dates not given"], ["Paid", "Through Aetna"]]);
  assert.deepEqual(rows({ last: "2026-09" })[0], ["Filled", "Once, Sep 2026"]);
  assert.deepEqual(fillRows(undefined), []);
});

test("something to check stands out on its own", () => {
  const card = patientCard(item({ completedButFilled: "2026-09-22", recordStatus: "completed" }), true);
  assert.deepEqual(card.flags, ["Marked completed in your records, but filled Sep 22, 2026"]);
  assert.ok(!card.facts.some(([, text]) => /completed/.test(text)));
});

test("a changed strength and the patient's own mark get their own rows", () => {
  const changed = item({ doseHistory: [{ name: "lisinopril 10 MG Oral Tablet", date: "2022-01-01" }, { name: "lisinopril 20 MG Oral Tablet", date: "2024-01-05T09:00:00Z" }] });
  assert.ok(patientCard(changed, true).facts.some(([label, text]) => label === "Dose change" && text === "10 MG to 20 MG, Jan 5, 2024"));
  assert.deepEqual(patientCard(item({ asNeededAt: "2026-11-20" }), true).facts.at(-1), ["You marked", "As needed, Nov 20, 2026"]);
  assert.deepEqual(patientCard(item({ stoppedAt: "2026-11-20" }), true).facts.at(-1), ["You marked", "Not taking, Nov 20, 2026"]);
});

test("a medicine only insurance knows about, and one the patient added", () => {
  assert.deepEqual(patientCard({ name: "sertraline", origin: "claims", source: "Aetna claims", fills: FILLS }, true), { take: [], flags: [], facts: [["Filled", "3 times, last Jul 23, 2025"], ["Paid", "Through Aetna"]] });
  assert.deepEqual(patientCard({ name: "Vitamin D", dose: "1 capsule", frequency: "daily", addedAt: "2026-11-20" }, true), { take: [["Dose", "1 capsule"], ["How often", "daily"]], flags: [], facts: [["Added", "Nov 20, 2026"]] });
});

// Staff see the same labels, through the real code.
const share = (list) => groupShareBundle(JSON.parse(JSON.stringify(buildShareBundle(Object.assign({ patient: PATIENT, current: [], additions: [], stopped: [] }, list), NOW))));
test("staff get the same separate pieces", () => {
  const row = share({ current: [item({ fills: FILLS, completedButFilled: "2026-09-22", recordStatus: "completed" })] }).fromRecords[0];
  assert.deepEqual(row.take, [["Dose", "1 tablet"], ["How taken", "Oral"], ["How often", "once a day"]]);
  assert.deepEqual(row.flags, ["Record marked completed, but filled Sep 22, 2026"]);
  assert.deepEqual(row.facts, [["Prescribed by", "Dr. Patel"], ["Filled", "3 times, last Jul 23, 2025"], ["Paid", "Through Aetna"], ["Source", "SMART sandbox"]]);
});

test("staff get every fill wording as it is on the patient's card", () => {
  for (const fills of [FILLS, { count: 1, last: "2026-09", insurers: [], cash: true }, { count: 2, last: null, insurers: ["Aetna", "Medicare"], cash: true }, { count: 1, last: null, insurers: ["A (B), C"], cash: false }]) {
    assert.deepEqual(share({ current: [item({ fills })] }).fromRecords[0].facts.slice(1, 3), fillRows(fills));
  }
  assert.deepEqual(share({ current: [item({ fills: { count: 0 } })] }).fromRecords[0].facts[1], ["Filled", "No fill found in claims"]);
});

test("staff see the dose of what the patient added, marked As needed or not taking", () => {
  const addition = makeAddition({ name: "Amoxicillin", dose: "5 mL", frequency: "3 times a day" }, NOW);
  assert.deepEqual(share({ additions: [addition] }).addedByPatient[0].take, [["Dose", "5 mL"], ["How often", "3 times a day"]]);
  const onlyOften = makeAddition({ name: "Ibuprofen", frequency: "As needed", schedule: { asNeeded: true } }, NOW);
  assert.deepEqual(share({ additions: [onlyOften] }).asNeeded[0].take, [["How often", "As needed"]]);
  const onlyDose = makeAddition({ name: "Zinc", dose: "1 tablet", quantity: { value: 1, unit: "tablet" } }, NOW);
  assert.deepEqual(share({ additions: [onlyDose] }).addedByPatient[0].take, [["Dose", "1 tablet"]]);
  // Typed, with nothing to say which it is: no guess.
  assert.deepEqual(share({ additions: [makeAddition({ name: "Zinc", dose: "a pinch" }, NOW)] }).addedByPatient[0].take, [["Directions", "a pinch"]]);
  assert.deepEqual(share({ current: [item({ asNeededAt: "2026-11-20" })] }).asNeeded[0].take, [["Dose", "1 tablet"], ["How taken", "Oral"], ["How often", "once a day"]]);
  const stopped = share({ stopped: [item({ stoppedAt: "2026-10-01" })] }).patientSaysStopped[0];
  assert.deepEqual(stopped.take, [["Dose", "1 tablet"], ["How taken", "Oral"], ["How often", "once a day"]]);
  assert.deepEqual(stopped.facts, [["Not taking since", "Oct 1, 2026"]]);
});

// A code made before this has only the joined words, and still opens.
test("an older code's words show whole, never under a guessed label", () => {
  const bundle = buildShareBundle({ patient: PATIENT, current: [ITEM], additions: [], stopped: [] }, NOW);
  const statement = bundle.entry[1].resource;
  statement.dosage = [{ text: "1 tablet · Oral · once a day" }];
  statement.note.push({ text: "Something else" });
  const row = groupShareBundle(bundle).fromRecords[0];
  assert.deepEqual(row.take, [["Directions", "1 tablet · Oral · once a day"]]);
  assert.deepEqual(row.facts.at(-1), ["Note", "Something else"]);
});

// FHIR keeps the whole sentence in text; another system reads it as before.
test("the code still carries the whole dosage in words", () => {
  const dosage = buildShareBundle({ patient: PATIENT, current: [ITEM], additions: [], stopped: [] }, NOW).entry[1].resource.dosage[0];
  assert.equal(dosage.text, "1 tablet · Oral · once a day");
  assert.deepEqual(dosage.route, { text: "Oral" });
  assert.deepEqual(dosage.timing, { code: { text: "once a day" } });
  const long = buildShareBundle({ patient: PATIENT, current: [item({ dose: null, route: null, frequency: "Take 1 by mouth" })], additions: [], stopped: [] }, NOW).entry[1].resource.dosage[0];
  assert.deepEqual(long, { text: "Take 1 by mouth", patientInstruction: "Take 1 by mouth" });
});

// The extra pieces must not push an ordinary list past one code.
test("thirty ordinary medicines still fit in one code", async () => {
  const names = ["lisinopril", "atorvastatin", "metformin", "amlodipine", "omeprazole", "levothyroxine", "gabapentin", "sertraline", "losartan", "albuterol"];
  const current = Array.from({ length: 30 }, (_, i) => item({ name: names[i % 10] + " " + (5 + i) + " MG Oral Tablet", rxcui: String(310000 + i * 37), prescriber: "Dr. " + names[i % 4], fills: FILLS }));
  const packed = await packShare(buildShareBundle({ patient: PATIENT, current, additions: [], stopped: [] }, NOW), "https://burroclurse.github.io/BrownBag/");
  assert.ok(fitsInQr(packed.prefix, packed.digits));
});

class Node {
  constructor(tag) { this.tag = tag; this.kids = []; this.own = ""; }
  set textContent(text) { this.own = text; this.kids = []; }
  get textContent() { return this.own + this.kids.map((kid) => kid.textContent).join(""); }
  set innerHTML(text) { if (!text.startsWith("<svg")) throw new Error("raw HTML"); }
  appendChild(kid) { this.kids.push(kid); return kid; }
  setAttribute() {}
}
globalThis.document = { createElement: (tag) => new Node(tag), createTextNode: (text) => Object.assign(new Node("#text"), { own: text }) };
const all = (node, tag) => node.kids.flatMap((kid) => (kid.tag === tag ? [kid] : []).concat(all(kid, tag)));

test("each label is tied to its value, and how to take it comes first", () => {
  const li = new Node("li");
  drawCard(li, "<b>Aspirin</b>", patientCard(item({ completedButFilled: "2026-09-22", recordStatus: "completed" }), true));
  assert.deepEqual(li.kids.map((kid) => kid.className), ["med-name", "take", "flag", "facts"]);
  assert.equal(li.kids[0].textContent, "<b>Aspirin</b>");
  const pairs = all(li.kids[1], "div").map((div) => div.kids.map((kid) => kid.tag + " " + kid.textContent));
  assert.deepEqual(pairs[0], ["dt Dose", "dd 1 tablet"]);
  const bare = new Node("li");
  drawCard(bare, "x", { take: [], flags: [], facts: [] });
  assert.deepEqual(bare.kids.map((kid) => kid.className), ["med-name"], "no empty boxes");
});

test("the staff page and My medicines draw the same card", () => {
  const root = new Node("main");
  drawShareList(root, share({ current: [ITEM] }), 1);
  assert.deepEqual(all(root, "dt").map((dt) => dt.textContent), ["Dose", "How taken", "How often", "Prescribed by", "Source"]);
  const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
  for (const file of ["js/app.js", "js/share-list.js"]) assert.match(read(file), /import \{[^}]*drawCard[^}]*\} from "\.\/card\.js"/, file);
  assert.ok(read("sw.js").includes('"./js/card.js"'), "opens with no signal");
});

test("a hospital order says so", () => {
  const card = patientCard({ ...item({}), hospital: true }, false);
  assert.equal(card.flags[0], "Hospital order");
  assert.ok(!patientCard(item({}), false).flags.includes("Hospital order"));
});
