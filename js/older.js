// Older prescriptions the patient says they still take. No DOM here, so Node's
// test runner can check it.

import { dateText } from "./card.js";
import { STATUS_WORDS } from "./claims.js";

export function olderDate(entry) {
  var date = entry.origin === "claims" ? entry.fills && entry.fills.last : entry.lastDate || entry.start;
  return date ? String(date).slice(0, 10) : null;
}

// What the question says: the medicine, then what's known about it.
export function olderQuestion(entry) {
  var date = olderDate(entry);
  if (entry.origin === "claims") return [entry.name, date ? "Last filled " + dateText(date) + "." : "Filled, with no date."];
  var word = STATUS_WORDS[entry.recordStatus];
  var line = word ? "Your records say " + word + "." : "It isn't current in your records.";
  return [entry.name, line + (date ? " " + (entry.prescriber ? "Prescribed " : "From ") + dateText(date) + "." : "")];
}

// Whether the patient already said they take this one.
export function takenOlder(entry, additions) {
  return additions.some(function (addition) { return Boolean(addition.older) && addition.older.key === entry.key; });
}
