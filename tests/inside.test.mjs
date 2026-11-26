// See what's inside is the code as one short text. If these fail, something in
// the code (a medicine, an allergy, a warning) isn't in what the patient hands
// over, and whoever reads it decides from less than the staff page shows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildShareBundle, groupShareBundle } from "../js/share.js";
import { drawShareList } from "../js/share-list.js";
import { drawInside } from "../js/inside.js";

class Node {
  constructor(tag) { this.tag = tag; this.kids = []; this.own = ""; }
  set textContent(text) { this.own = text; this.kids = []; }
  get textContent() { return this.own + this.kids.map((kid) => kid.textContent).join(""); }
  set innerHTML(text) { if (!text.startsWith("<svg")) throw new Error("raw HTML"); }
  appendChild(kid) { this.kids.push(kid); return kid; }
  setAttribute() {}
}
globalThis.document = { createElement: (tag) => new Node(tag), createTextNode: (text) => Object.assign(new Node("#text"), { own: text }) };

const PATIENT = { name: "Avery Brownbag", birthDate: "1950-03-14" };
const NOW = new Date("2026-11-23T12:00:00Z");
const ITEM = { key: "rx:314076", name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", dose: "1 tablet", route: "Oral", frequency: "once a day", prescriber: "Dr. Patel", source: "SMART sandbox", origin: "records", fills: { count: 2, last: "2026-10-21", insurers: ["Aetna"], cash: false } };
const item = (o) => Object.assign({}, ITEM, o);
const ALLERGY = { key: "k", otherKeys: [], name: "Mold", code: null, reactions: [{ text: "Hives", severity: "severe" }], intolerance: false, unconfirmed: false, highRisk: true, source: "SMART sandbox", origin: "records", mine: null };
const LIST = {
  patient: PATIENT,
  current: [ITEM, item({ name: "metformin", rxcui: "861007", completedButFilled: "2026-09-22", recordStatus: "completed" }), item({ name: "oxycodone", rxcui: "1049621", asNeededAt: "2026-11-20" }), { name: "sertraline", rxcui: "312941", origin: "claims", source: "Aetna claims", fills: { count: 1, last: "2026-10-22", insurers: ["Aetna"], cash: false } }],
  additions: [{ id: "1", name: "Vitamin D", rxcui: null, dose: "1 capsule", frequency: "daily", addedAt: "2026-11-20" }],
  stopped: [item({ name: "warfarin", rxcui: "855332", stoppedAt: "2026-10-01" })],
  allergies: { cards: [ALLERGY], statements: [], saidNone: null, unspecified: 1 }
};
const FINE = { recordsUpdatedAt: "2026-11-23T11:00:00.000Z", claims: "loaded", allergies: { status: "loaded", savedAt: null, updatedAt: "2026-11-23T11:00:00.000Z" } };
const groupsOf = (list, warnings) => groupShareBundle(JSON.parse(JSON.stringify(buildShareBundle(list, NOW, warnings))));
const draw = (fn, groups, ...rest) => { const root = new Node("main"); fn(root, groups, ...rest); return root; };
const all = (node, tag) => node.kids.flatMap((kid) => (kid.tag === tag ? [kid] : []).concat(all(kid, tag)));
const inside = (list, warnings, made) => draw(drawInside, groupsOf(list, warnings), made);

test("everything the staff page says about each medicine and allergy is there", () => {
  const groups = groupsOf(LIST, FINE);
  const text = draw(drawInside, groups).textContent;
  let checked = 0;
  for (const part of ["fromRecords", "fromClaims", "asNeeded", "addedByPatient", "patientSaysStopped"]) {
    assert.ok(groups[part].length, part);
    for (const row of groups[part]) {
      assert.ok(text.includes(row.name), row.name);
      for (const [label, value] of row.take.concat(row.facts)) { assert.ok(text.includes(label + ": " + value), label + ": " + value); checked += 1; }
      for (const flag of row.flags) assert.ok(text.includes(flag), flag);
    }
  }
  assert.ok(checked > 20);
  for (const row of groups.allergies.fromRecords) { assert.ok(text.includes(row.name)); for (const line of row.lines) assert.ok(text.includes(line), line); }
  // Allergies read the same in both places, word for word.
  const heads = (root) => all(root, "h3").map((h) => h.textContent).filter((t) => t.startsWith("From records (SMART"));
  assert.deepEqual(heads(draw(drawInside, groups)), ["From records (SMART sandbox)"]);
  assert.deepEqual(heads(draw(drawShareList, groups, 1)), ["From records (SMART sandbox)"]);
  assert.ok(text.includes("Reaction: Hives, severe (records)"));
  assert.ok(!text.includes("From records: "));
  for (const piece of ["Avery Brownbag", "Born Mar 14, 1950", "Meds last updated: ", "QR code made: ", "Medicines (5)", "RxNorm: 314076"]) assert.ok(text.includes(piece), piece);
});

test("every warning the staff page gives is there", () => {
  const bad = { recordsSavedAt: "2026-11-01T14:00:00.000Z", claims: "loaded", incomplete: true, ownMissing: true, unnamed: 2, allergies: { status: "failed", savedAt: null } };
  const groups = groupsOf(Object.assign({}, LIST, { current: [], additions: [], stopped: [], allergies: { cards: [], statements: [], saidNone: null, unspecified: 0 } }), bad);
  const staff = draw(drawShareList, groups, 1);
  const text = draw(drawInside, groups).textContent;
  const warnings = all(staff, "p").filter((p) => p.className === "notice").map((p) => p.textContent);
  assert.ok(warnings.length >= 5);
  for (const warning of warnings) assert.ok(text.includes(warning), warning);
  assert.ok(text.includes("None loaded."));
  for (const word of ["Nothing added", "Nothing marked", "(0)"]) assert.ok(!text.includes(word), word);
});

test("a missing extra and a code from before allergies are said", () => {
  assert.ok(inside(LIST, Object.assign({}, FINE, { claims: "failed" })).textContent.includes("Insurance fills couldn't be loaded."));
  const old = buildShareBundle(Object.assign({}, LIST, { allergies: null }), NOW);
  assert.ok(draw(drawInside, groupShareBundle(old)).textContent.includes("This code doesn't include allergies."));
});

test("bare bones: no boxes, no repeated titles, nothing for parts that are empty", () => {
  const root = inside(Object.assign({}, LIST, { additions: [], stopped: [] }), FINE);
  const text = root.textContent;
  for (const fluff of ["What's in your code", "This is what opens", "Your care team", "Nothing added", "Nothing marked", "Note:"]) assert.ok(!text.includes(fluff), fluff);
  assert.equal(all(root, "dl").length + all(root, "svg").length, 0);
  assert.ok(inside(LIST, FINE, "List made").textContent.includes("List made: "));
});

test("names from the records stay text", () => {
  const root = inside({ patient: PATIENT, current: [item({ name: "<b>Aspirin</b>" })], additions: [], stopped: [] }, FINE);
  assert.ok(root.textContent.includes("<b>Aspirin</b>"));
});

test("it's read from the code itself, and opens with no signal", () => {
  const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
  assert.match(read("js/app.js"), /unpackShare\(packed\./);
  assert.match(read("js/app.js"), /drawInside\(page, groups/);
  for (const file of ["inside", "share-list"]) assert.ok(read("sw.js").includes('"./js/' + file + '.js"'), file);
});

// A disagreement's sides aren't under From records, so nothing may hide them.
test("both sides of a disagreement are on the staff page, in See what's inside and in the file's text", async () => {
  const { patientSummary } = await import("../js/ips.js");
  const side = (id, name, dose, key) => ({ sourceId: id, sourceName: name, kind: "records", asOf: "2026-03-02", name: "lisinopril " + dose + " Oral Tablet", dose, route: null, frequency: "once a day", status: "current", recordStatus: "active", key });
  const asked = item({ question: { kind: "dose", why: null, groupId: "1", fingerprint: "fp" }, group: { id: "1", sources: ["SMART sandbox", "Valley Clinic"], verdicts: ["dose"], fingerprint: "fp", notes: [], sides: [side("a", "SMART sandbox", "10 MG", "rx:314076"), side("b", "Valley Clinic", "20 MG", "rx:314077")] } });
  const list = Object.assign({}, LIST, { current: [asked] });
  const groups = groupsOf(list, FINE);
  assert.equal(groups.disagree[0].sides.length, 2);
  for (const root of [draw(drawInside, groups), draw(drawShareList, groups, 1)]) {
    const text = root.textContent;
    assert.ok(text.includes("Records disagree: ask the patient"), text);
    assert.ok(text.includes("lisinopril 10 MG Oral Tablet") && text.includes("lisinopril 20 MG Oral Tablet"));
    assert.ok(text.includes("Valley Clinic") && text.includes("SMART sandbox"));
    assert.ok(!text.includes("No medicines from records."), "not said to be none");
  }
  const file = JSON.stringify(patientSummary(JSON.parse(JSON.stringify(buildShareBundle(list, NOW, FINE))), { now: NOW, uuid: () => "00000000-0000-4000-8000-000000000001" }));
  assert.ok(file.includes("Records disagree: ask the patient") && file.includes("lisinopril 10 MG Oral Tablet") && file.includes("lisinopril 20 MG Oral Tablet"));
});

// Task 8: the part staff ask the patient about comes first, one card per
// medicine, and See what's inside says every word of it.
const side = (id, name, dose, key, asOf) => ({ sourceId: id, sourceName: name, kind: "records", asOf, name: "lisinopril " + dose + " Oral Tablet", dose, route: null, frequency: "once a day", status: "current", recordStatus: "active", key });
const DISAGREEING = item({ question: { kind: "dose", why: null, groupId: "1", fingerprint: "fp" }, group: { id: "1", sources: ["SMART sandbox", "Valley Clinic"], verdicts: ["dose"], fingerprint: "fp", notes: [], sides: [side("a", "SMART sandbox", "10 MG", "rx:314076", "2026-03-02"), side("b", "Valley Clinic", "20 MG", "rx:314077", "2026-10-05")] } });

test("the disagree part comes first on the staff page and in See what's inside", async () => {
  const { disagreeParts } = await import("../js/share.js");
  const list = Object.assign({}, LIST, { current: [DISAGREEING].concat(LIST.current.slice(1)) });
  const groups = groupsOf(list, FINE);
  const text = draw(drawInside, groups).textContent;
  const medicines = text.indexOf("Medicines (");
  assert.ok(medicines !== -1 && text.indexOf("Records disagree: ask the patient") > medicines);
  assert.ok(text.indexOf("Records disagree: ask the patient") < text.indexOf("From records", medicines), text);
  const staff = draw(drawShareList, groups, 1);
  const titles = all(staff, "h3").map((h) => h.textContent);
  assert.deepEqual(titles.slice(titles.indexOf("Records disagree: ask the patient (1)"), titles.indexOf("Records disagree: ask the patient (1)") + 2), ["Records disagree: ask the patient (1)", "From records (1)"]);
  // One card holds both sides, each under its source and date.
  const part = all(staff, "section").find((s) => s.kids[0].textContent === "Records disagree: ask the patient (1)");
  const cards = all(part, "li");
  assert.equal(cards.length, 1);
  assert.deepEqual(all(cards[0], "p").filter((p) => p.className === "side-label").map((p) => p.textContent), ["SMART sandbox, Mar 2026", "Valley Clinic, Oct 2026"]);
  assert.ok(cards[0].textContent.includes("lisinopril 10 MG Oral Tablet") && cards[0].textContent.includes("lisinopril 20 MG Oral Tablet"));
  // Nothing staff see on it is left out of See what's inside.
  let checked = 0;
  for (const one of disagreeParts(groups)) {
    for (const each of one.sides) {
      assert.ok(text.includes(each.label), each.label);
      assert.ok(text.includes(each.row.name), each.row.name);
      for (const [label, value] of each.row.take.concat(each.row.facts)) { assert.ok(text.includes(label + ": " + value), label + ": " + value); checked += 1; }
      for (const flag of each.row.flags) assert.ok(text.includes(flag), flag);
    }
  }
  assert.ok(checked >= 4);
});

test("the patient's answer comes first, in both places", () => {
  const unsure = item({ answer: { groupId: "1", fingerprint: "fp", sides: DISAGREEING.group.sides, choice: "not-sure", answeredAt: "2026-11-25T15:00:00.000Z" }, group: DISAGREEING.group });
  const groups = groupsOf(Object.assign({}, LIST, { current: [unsure] }), FINE);
  const staff = draw(drawShareList, groups, 1);
  const part = all(staff, "section").find((s) => s.kids[0].textContent.startsWith("Records disagree: ask the patient"));
  const card = all(part, "li")[0];
  assert.equal(card.kids[0].textContent, "Patient isn't sure");
  assert.equal(card.textContent.split("Patient isn't sure").length, 2, "said once");
  const inside = all(draw(drawInside, groups), "li").find((li) => li.textContent.includes("Patient isn't sure"));
  assert.equal(inside.kids[0].textContent, "Patient isn't sure");
});

test("a source that didn't load is said on the staff page, in See what's inside and in the file", async () => {
  const { patientSummary } = await import("../js/ips.js");
  const warnings = Object.assign({}, FINE, { sourceStatus: [{ id: "smart-sandbox", name: "SMART sandbox", loaded: true, complete: true }, { id: "valley", name: "Valley Clinic", loaded: false, complete: true }] });
  const groups = groupsOf(LIST, warnings);
  const staff = all(draw(drawShareList, groups, 1), "p").filter((p) => p.className === "notice").map((p) => p.textContent);
  assert.ok(staff.includes("Valley Clinic didn't load."), JSON.stringify(staff));
  assert.ok(draw(drawInside, groups).textContent.includes("Valley Clinic didn't load."));
  const file = JSON.stringify(patientSummary(JSON.parse(JSON.stringify(buildShareBundle(LIST, NOW, warnings))), { now: NOW, uuid: () => "00000000-0000-4000-8000-000000000001" }));
  assert.ok(file.includes("Valley Clinic didn&#39;t load."), "in the file's text, as XHTML writes it");
});
