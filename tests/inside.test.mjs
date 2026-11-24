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
  for (const part of ["fromRecords", "fromClaims", "patientSaysAsNeeded", "addedByPatient", "patientSaysStopped"]) {
    assert.ok(groups[part].length, part);
    for (const row of groups[part]) {
      assert.ok(text.includes(row.name), row.name);
      for (const [label, value] of row.take.concat(row.facts)) { assert.ok(text.includes(label + ": " + value), label + ": " + value); checked += 1; }
      for (const flag of row.flags) assert.ok(text.includes(flag), flag);
    }
  }
  assert.ok(checked > 20);
  for (const row of groups.allergies.fromRecords) { assert.ok(text.includes(row.name)); assert.ok(text.includes(row.detail), row.detail); }
  for (const piece of ["Avery Brownbag", "1950-03-14", "Records last updated: ", "QR code made: ", "Medicines (5)", "RxNorm: 314076"]) assert.ok(text.includes(piece), piece);
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
