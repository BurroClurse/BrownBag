import test from "node:test";
import assert from "node:assert/strict";
import { pickFor, draftFrom, draftChanged, editedAddition, unchanged, unsavedEditText } from "../js/edit.js";
import { doseChoices } from "../js/add-choices.js";
import { logChange, changeAlert } from "../js/view.js";

const TABLET = { id: "a1", rxcui: "314076", name: "lisinopril 10 MG Oral Tablet", dose: "1 tablet", frequency: "Once a day", quantity: { value: 1, unit: "tablet" }, schedule: { frequency: 1, period: 1, periodUnit: "d" }, addedAt: "2026-11-01" };
const TYPED = { id: "a2", rxcui: null, name: "Vitamin D", dose: "2 gummies", frequency: null, quantity: null, schedule: null, addedAt: "2026-11-02" };
const valuesOf = (a) => ({ name: a.name, rxcui: a.rxcui, dose: a.dose, frequency: a.frequency, quantity: a.quantity, schedule: a.schedule });

// The form opens on what was saved. If this broke, saving one small fix would
// blank the answers that didn't show.
test("the form opens filled in with what was saved", () => {
  assert.deepEqual(draftFrom(TABLET), {
    name: TABLET.name, picked: { rxcui: "314076", name: TABLET.name },
    dose: { choice: "1 tablet", other: "" }, often: { choice: "Once a day", other: "" }
  });
  assert.deepEqual(draftFrom(TYPED), {
    name: "Vitamin D", picked: null, dose: { choice: "other", other: "2 gummies" }, often: { choice: "", other: "" }
  });
});

// Correcting a name changes which doses are offered; the dose already given
// must not vanish with them.
test("a dose that isn't in the new list becomes Other, in the same words", () => {
  const tablets = doseChoices(TABLET.name).map((c) => c.label);
  const general = doseChoices(null).map((c) => c.label);
  assert.deepEqual(pickFor("3 tablets", tablets), { choice: "3 tablets", other: "" });
  assert.deepEqual(pickFor("3 tablets", general), { choice: "other", other: "3 tablets" });
  assert.deepEqual(pickFor(null, general), { choice: "", other: "" });
});

test("an edit keeps which medicine it is and when it was added", () => {
  const next = editedAddition(TABLET, Object.assign(valuesOf(TABLET), { dose: "2 tablets", quantity: { value: 2, unit: "tablet" } }));
  assert.equal(next.id, "a1");
  assert.equal(next.addedAt, "2026-11-01");
  assert.equal(next.dose, "2 tablets");
  assert.deepEqual(next.quantity, { value: 2, unit: "tablet" });
  assert.equal(TABLET.dose, "1 tablet", "the saved one isn't touched until Save");
});

// A code left over from the old name would tell staff the wrong medicine.
test("a new name drops the old code; the same name keeps it", () => {
  assert.equal(editedAddition(TABLET, Object.assign(valuesOf(TABLET), { name: "Zinc", rxcui: null })).rxcui, null);
  assert.equal(editedAddition(TABLET, Object.assign(valuesOf(TABLET), { name: " " + TABLET.name, rxcui: null })).rxcui, "314076");
  assert.equal(editedAddition(TABLET, Object.assign(valuesOf(TABLET), { name: "zinc 50 MG Oral Tablet", rxcui: "99" })).rxcui, "99");
});

// Numbers left over from the old words would send staff the wrong dose.
test("the numbers for the QR code go with the words", () => {
  const same = editedAddition(TABLET, Object.assign(valuesOf(TABLET), { quantity: null, schedule: null }));
  assert.deepEqual([same.quantity, same.schedule], [TABLET.quantity, TABLET.schedule]);
  const other = editedAddition(TABLET, Object.assign(valuesOf(TABLET), { dose: "a half", quantity: null, frequency: "with food", schedule: null }));
  assert.deepEqual([other.quantity, other.schedule], [null, null]);
  const blank = editedAddition(TABLET, Object.assign(valuesOf(TABLET), { dose: "", quantity: null }));
  assert.deepEqual([blank.dose, blank.quantity], [null, null]);
});

test("a name is still needed", () => {
  assert.throws(() => editedAddition(TABLET, Object.assign(valuesOf(TABLET), { name: "  " })));
});

test("saving with nothing changed is not a change", () => {
  assert.ok(unchanged(TABLET, editedAddition(TABLET, valuesOf(TABLET))));
  assert.ok(!unchanged(TABLET, editedAddition(TABLET, Object.assign(valuesOf(TABLET), { frequency: "Twice a day" }))));
});

// Home warns about an edit that isn't saved, but not about one only looked at.
test("only a changed form counts as unsaved", () => {
  assert.equal(draftChanged(draftFrom(TYPED), TYPED), false);
  assert.equal(draftChanged(Object.assign(draftFrom(TYPED), { name: "Vitamin D3" }), TYPED), true);
  assert.equal(draftChanged(Object.assign(draftFrom(TYPED), { often: { choice: "Once a day", other: "" } }), TYPED), true);
  // "Other…" words left behind when another choice was picked don't count.
  assert.equal(draftChanged(Object.assign(draftFrom(TABLET), { dose: { choice: "1 tablet", other: "typed, then changed back" } }), TABLET), false);
  assert.equal(unsavedEditText("Vitamin D"), "Your changes to Vitamin D aren't saved yet. Open My medicines to finish.");
});

// The QR screen lists what changed while the list was a saved copy.
test("the log says Changed, once, and cancels like the others", () => {
  const log = (...kinds) => kinds.reduce((list, kind) => logChange(list, kind, "Vitamin D"), []).map((c) => c.kind);
  assert.deepEqual(log("edited"), ["edited"]);
  assert.deepEqual(log("edited", "edited"), ["edited"]);
  assert.deepEqual(log("added", "edited"), ["added"]);
  assert.deepEqual(log("edited", "removed"), ["removed"]);
  assert.deepEqual(log("edited", "removed", "added"), ["edited"]);
  assert.deepEqual(log("added", "edited", "removed"), []);
  assert.deepEqual(changeAlert([{ kind: "edited", name: "Vitamin D" }], { medicines: "2026-11-20T10:00:00.000Z", allergies: null }, new Date("2026-11-23T10:00:00.000Z")).lines, ["Changed Vitamin D"]);
});
