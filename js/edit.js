// Editing a medicine the patient added: the form opens filled in with what
// was saved, and saving keeps which medicine it is and the day it was added.
// No DOM here, so Node's test runner can check it.

import { doseChoices, FREQUENCY_CHOICES } from "./add-choices.js";
import { makeAddition } from "./view.js";

function labels(choices) {
  return choices.map(function (choice) { return choice.label; });
}

// Which answer in a list says these words. Words that aren't in it are
// "Other…", so nothing the patient said is lost.
export function pickFor(words, list) {
  if (!words) return { choice: "", other: "" };
  return list.indexOf(words) === -1 ? { choice: "other", other: words } : { choice: words, other: "" };
}

export function draftFrom(addition) {
  return {
    name: addition.name,
    picked: addition.rxcui ? { rxcui: addition.rxcui, name: addition.name } : null,
    dose: pickFor(addition.dose, labels(doseChoices(addition.rxcui ? addition.name : null))),
    often: pickFor(addition.frequency, labels(FREQUENCY_CHOICES))
  };
}

function said(answer) {
  return answer.choice === "other" ? "other:" + answer.other.trim() : answer.choice;
}

export function draftChanged(draft, addition) {
  var was = draftFrom(addition);
  return draft.name.trim() !== was.name || said(draft.dose) !== said(was.dose) || said(draft.often) !== said(was.often);
}

// The medicine as edited. A code goes with its name, and the numbers for the
// QR code go with their words: neither is left over from the old answer.
export function editedAddition(original, values) {
  var next = makeAddition(values, new Date());
  if (!next.rxcui && next.name === original.name) next.rxcui = original.rxcui;
  if (!next.quantity && next.dose === original.dose) next.quantity = original.quantity || null;
  if (!next.schedule && next.frequency === original.frequency) next.schedule = original.schedule || null;
  next.id = original.id;
  next.addedAt = original.addedAt;
  return next;
}

export function sameName(a, b) {
  return a.name === b.name && (a.rxcui || null) === (b.rxcui || null);
}

export function unchanged(original, next) {
  return sameName(original, next) && (original.dose || null) === next.dose && (original.frequency || null) === next.frequency;
}

export function unsavedEditText(name) {
  return "Your changes to " + name + " aren't saved yet. Open My medicines to finish.";
}
