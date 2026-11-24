// Unknown is never none. When part of a list couldn't be loaded, these check
// the words on the patient and staff screens. If one fails, a person checking
// medicines could read "didn't load" as "takes nothing".
import test from "node:test";
import assert from "node:assert/strict";
import { buildShareBundle, groupShareBundle } from "../js/share.js";
import { drawShareList } from "../js/share-list.js";
import { medicinesButtonText, medicinesPartial, noticesFor, shareWarnings } from "../js/view.js";
import { heldBack } from "../js/read.js";
import { readClaims, mergeClaims } from "../js/claims.js";

const PATIENT = { name: "Avery Brownbag", birthDate: "1950-03-14" };
const NOW = new Date("2026-11-23T12:00:00Z");
const ITEM = { name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", source: "SMART sandbox" };
const NO_ALLERGIES = { cards: [], statements: [], saidNone: null, unspecified: 0 };

// The parts of a browser page the staff screen's code uses.
class Node {
  constructor(tag) { this.tag = tag; this.kids = []; this.own = ""; }
  set textContent(text) { this.own = text; this.kids = []; }
  get textContent() { return this.own + this.kids.map((kid) => kid.textContent).join(""); }
  set innerHTML(text) { this.own = ""; }
  appendChild(kid) { this.kids.push(kid); return kid; }
  setAttribute() {}
}
globalThis.document = { createElement: (tag) => new Node(tag), createTextNode: (text) => Object.assign(new Node("#text"), { own: text }) };

const state = (o = {}) => Object.assign({ split: { current: [], older: [], failed: false, placeholders: 0, claims: "loaded" }, savedAt: null, dataFailed: false, allergies: { status: "loaded", savedAt: null } }, o);
const split = (o) => ({ split: Object.assign(state().split, o) });

// What staff read, through the real code: warnings, Bundle, staff page.
function staffLines(s, { current = [], additions = [] } = {}) {
  const bundle = buildShareBundle({ patient: PATIENT, current, additions, stopped: [], allergies: NO_ALLERGIES }, NOW, shareWarnings(s));
  const root = new Node("main");
  drawShareList(root, groupShareBundle(JSON.parse(JSON.stringify(bundle))), 1);
  const lines = [];
  (function walk(node) {
    if (["p", "h1", "h2", "h3"].includes(node.tag)) lines.push(node.textContent);
    else node.kids.forEach(walk);
  })(root);
  return lines;
}
const says = (lines, text) => lines.some((line) => line.includes(text));

test("staff see no warnings when everything loaded", () => {
  const lines = staffLines(state(), { current: [ITEM] });
  for (const word of ["couldn't be", "no medicine name", "None loaded"]) assert.ok(!says(lines, word), word);
  assert.ok(says(lines, "Medicines (1)"));
  assert.ok(says(lines, "Nothing added by the patient."));
});

// Without this, a medicine only the insurer knows about is silently missing.
test("staff are told when the insurance fills didn't load", () => {
  for (const claims of ["failed", "refused"]) {
    assert.ok(says(staffLines(state(split({ claims })), { current: [ITEM] }), "Insurance fills couldn't be loaded"), claims);
  }
  for (const claims of ["loaded", "none"]) {
    assert.ok(!says(staffLines(state(split({ claims })), { current: [ITEM] }), "nsurance fills"), claims);
  }
});

// Without this, staff lose the dates that say how old the list is.
test("staff see when the records and the allergies last loaded", () => {
  const at = "2026-11-23T11:00:00.000Z";
  const lines = staffLines(state({ updatedAt: at, allergies: { status: "loaded", savedAt: null, updatedAt: "2026-11-20T11:00:00.000Z" } }), { current: [ITEM] });
  assert.ok(says(lines, "Meds last updated: "));
  assert.ok(says(lines, "Allergies last updated: "));
});

// Without this, staff read "Nothing added by the patient" when the phone
// couldn't open what the patient added, and a stopped medicine looks current.
test("staff are told when the patient's own part couldn't be opened", () => {
  const lines = staffLines(state({ dataFailed: true }), { current: [ITEM] });
  assert.ok(says(lines, "added or marked not taking couldn't be opened"));
  assert.ok(!says(lines, "Nothing added by the patient."));
  assert.ok(!says(lines, "Nothing marked not taking."));
  assert.ok(!says(lines, "Medicines (1)"), "no total");
  assert.ok(says(lines, "Allergies from records couldn't be loaded"));
});

// Without this, an entry with no name is dropped and nobody at the desk knows.
test("staff are told about records with no medicine name", () => {
  const none = staffLines(state(split({ placeholders: 2 })));
  assert.ok(says(none, "The records also have 2 entries with no medicine name"));
  assert.ok(!says(none, "No medicines from records."));
  assert.ok(says(staffLines(state(split({ placeholders: 1 })), { current: [ITEM] }), "The records also have 1 entry with no medicine name"));
});

// The code can be changed by someone else, so a count that isn't one is
// never shown as written.
test("a made-up count in a code isn't repeated to staff", () => {
  const bundle = buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [] }, NOW, shareWarnings(state(split({ placeholders: 2 }))));
  const tag = bundle.meta.tag.filter((t) => t.code === "records-unnamed")[0];
  for (const bad of ["-1", "1e9", "zero", "", undefined]) {
    tag.display = bad;
    assert.equal(groupShareBundle(bundle).unnamed, 1, String(bad));
  }
});

// Without this, home says "My medicines (0)" when the truth is "not loaded".
test("the home button gives no number when some didn't load", () => {
  assert.equal(medicinesButtonText(3, false), "My medicines (3)");
  assert.equal(medicinesButtonText(0, true), "My medicines");
  assert.equal(medicinesPartial(state()), false);
  assert.equal(medicinesPartial(state(split({ failed: true }))), true);
  assert.equal(medicinesPartial(state(split({ heldBack: true }))), true);
  assert.equal(medicinesPartial(state({ dataFailed: true })), true);
});

// Without this, home says it once and then looks like an ordinary list.
test("home keeps saying the patient's own part couldn't be opened", () => {
  assert.deepEqual(noticesFor({ dataFailed: true, now: NOW }), [{ kind: "failed", text: "What you added couldn't be opened." }]);
});

// Health systems answer "some of this was left out" inside a normal answer.
// Missed, the list looks complete.
const outcome = (severity) => ({ resourceType: "OperationOutcome", issue: [{ severity, code: "suppressed" }] });
test("an answer that says records were held back is noticed", () => {
  assert.equal(heldBack([{ resourceType: "MedicationRequest" }, outcome("error")]), true);
  assert.equal(heldBack([outcome("fatal")]), true);
  assert.equal(heldBack([outcome("warning"), outcome("information")]), false);
  assert.equal(heldBack([{ resourceType: "MedicationRequest" }, null, undefined]), false);
});

test("held-back medicines are said to staff, and stay said once fills join", () => {
  const merged = mergeClaims({ current: [], older: [], failed: false, heldBack: true, placeholders: 0 }, { status: "loaded", fills: [], ingredientOf: new Map() }, NOW);
  const lines = staffLines(state({ split: merged }));
  assert.ok(says(lines, "couldn't be loaded. This list may be missing medicines."));
  assert.ok(says(lines, "None loaded."));
});

// Without this, an odd answer about claims reads as "no pharmacy claims".
test("claims that were held back, or weren't a list, are failed and not none", async () => {
  const answer = (body) => readClaims(async () => body, "p1", async () => new Map(), 1000);
  assert.equal((await answer(outcome("error"))).status, "failed");
  assert.equal((await answer({ resourceType: "Bundle", entry: [{ resource: outcome("error") }] })).status, "failed");
  assert.equal((await answer({ resourceType: "Bundle", entry: [] })).status, "none");
});

// Without this, "Added by patient (0)" sits above "Couldn't be opened."
test("a part that didn't load gets no number on the staff page", () => {
  const headings = (s) => staffLines(s).filter((line) => /^(From records|Added by patient|Patient says not taking)/.test(line));
  assert.deepEqual(headings(state()), ["From records (0)", "Added by patient (0)", "Patient says not taking (0)"]);
  assert.deepEqual(headings(state(split({ failed: true }))), ["From records", "Added by patient (0)", "Patient says not taking (0)"]);
  assert.deepEqual(headings(state({ dataFailed: true })), ["From records", "Added by patient", "Patient says not taking"]);
});

// Without this, "My medicines (0)" and "Medicines (0)" read as "takes
// nothing", when the records have entries nobody can name.
test("no number when every record has no medicine name", () => {
  const fill = Object.assign({}, ITEM, { origin: "claims", source: "Aetna claims" });
  const added = { id: "1", name: "Vitamin D", rxcui: null };
  for (const [current, additions] of [[[], []], [[fill], []], [[], [added]]]) {
    const s = state(split({ placeholders: 2, current }));
    assert.equal(medicinesPartial(s), true);
    const lines = staffLines(s, { current, additions });
    assert.ok(lines.includes("Medicines"), lines.join("|"));
    assert.ok(lines.includes("From records"), lines.join("|"));
    assert.ok(!says(lines, "couldn't be loaded"), "nothing failed to load");
  }
  // Every named one marked stopped: home and staff agree, with no number.
  const stopped = Object.assign(state(split({ placeholders: 2, current: [Object.assign({ key: "rx:314076" }, ITEM)] })), { data: { stopped: { "rx:314076": "2026-11-01" } } });
  assert.equal(medicinesPartial(stopped), true);
  const one = state(split({ placeholders: 2, current: [ITEM] }));
  assert.equal(medicinesPartial(one), false);
  assert.ok(staffLines(one, { current: [ITEM] }).includes("Medicines (1)"));
  assert.equal(medicinesPartial(state()), false);
  assert.ok(staffLines(state()).includes("Medicines (0)"), "really none keeps its 0");
});

// Without this, a named medicine marked As needed (its own group) loses the
// number for staff while home still shows one, and reads as having no name.
test("a named medicine marked As needed still counts, the same for patient and staff", () => {
  const item = Object.assign({ key: "rx:314076" }, ITEM);
  const s = Object.assign(state(split({ placeholders: 2, current: [item] })), { data: { asNeeded: { "rx:314076": "2026-11-01" } } });
  assert.equal(medicinesPartial(s), false);
  const lines = staffLines(s, { current: [Object.assign({ asNeededAt: "2026-11-01" }, item)] });
  assert.ok(lines.includes("Medicines (1)"), lines.join("|"));
  assert.ok(lines.includes("From records"), "still no (0)");
  assert.ok(lines.includes("No others with a medicine name."), lines.join("|"));
  const fill = Object.assign({}, item, { origin: "claims", source: "Aetna claims" });
  assert.equal(medicinesPartial(Object.assign(state(split({ placeholders: 2, current: [fill] })), { data: { asNeeded: { "rx:314076": "2026-11-01" } } })), false);
});
