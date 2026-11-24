// The shared list on screen: the staff page, and "See what's inside" on the
// patient's own phone. One piece of code draws both, so they can't differ.
// Allergies and medicines are two blocks (design 2026-11-23).

import { allergyEmptyText, allergyNotices, shareMedicineCount } from "./share.js";
import { showsSymbol } from "./allergies.js";

var DISCLAIMER = "This list is what you and your records say. Your care team confirms it.";

// Draws into parent, starting with the patient's name as heading `level`.
// Returns that heading.
export function drawShareList(parent, groups, level) {
  var title = add(parent, "h" + level, groups.patient ? groups.patient.name : "Shared medicine list", "share-name");
  title.tabIndex = -1;
  if (groups.patient && groups.patient.birthDate) {
    add(parent, "p", "Born " + groups.patient.birthDate, "who");
  }
  add(parent, "p", "Made on " + madeOn(groups.madeAt), "who");
  if (groups.recordsSavedAt) {
    add(parent, "p", "The From records part is a copy saved on " + madeOn(groups.recordsSavedAt) + ". It may be out of date.", "notice");
  }
  if (groups.incomplete) {
    add(parent, "p", "Some of the patient's records couldn't be loaded. This list may be missing medicines.", "notice");
  }
  note(parent, DISCLAIMER);
  drawAllergies(parent, groups.allergies, level + 1);
  var block = medicinesBlock(parent, "Medicines (" + shareMedicineCount(groups) + ")", level + 1).section;
  part(block, "From records", groups.fromRecords, "No medicines from records.", level + 2);
  if (groups.fromClaims && groups.fromClaims.length) {
    part(block, "Filled, not in the health record", groups.fromClaims, "", level + 2);
  }
  part(block, "Added by patient", groups.addedByPatient, "Nothing added by the patient.", level + 2);
  part(block, "Patient says stopped", groups.patientSaysStopped, "Nothing marked stopped.", level + 2);
  return title;
}

// The box allergies go in, here and on My medicines. The symbol is
// decoration: the words and the border say it too.
export function allergyBox(parent, text, symbol, level) {
  var section = add(parent, "section", null, "allergy-box");
  var heading = add(section, "h" + level, null, "block-title");
  if (symbol) {
    var sign = add(heading, "span", null, "allergy-sign");
    sign.setAttribute("aria-hidden", "true");
    sign.innerHTML = '<svg viewBox="0 0 24 22" width="24" height="22" focusable="false"><path d="M12 1.5 23 20.5H1Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 8v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.4" fill="currentColor"/></svg>';
  }
  heading.appendChild(document.createTextNode(text));
  return { section: section, heading: heading };
}

export function medicinesBlock(parent, text, level) {
  var section = add(parent, "section", null, "medicines-block");
  return { section: section, heading: add(section, "h" + level, text, "block-title") };
}

// Allergies come first: staff read them before any medicine.
function drawAllergies(parent, allergies, level) {
  var count = allergies ? allergies.fromRecords.length + allergies.fromPatient.length : 0;
  var notices = allergyNotices(allergies);
  var symbol = !allergies || showsSymbol(count, allergies.unspecified, notices);
  var section = allergyBox(parent, count ? "Allergies (" + count + ")" : "Allergies", symbol, level).section;
  notices.forEach(function (text) { add(section, "p", text, "notice"); });
  var empty = allergyEmptyText(allergies);
  if (empty) add(section, "p", empty, allergies ? "med-line" : "notice");
  if (!allergies) return;
  allergies.statements.forEach(function (text) { add(section, "p", "Records say: " + text + ".", "med-line"); });
  [["From records", allergies.fromRecords], ["From patient", allergies.fromPatient]].forEach(function (one) {
    if (!one[1].length) return;
    add(section, "h" + (level + 1), one[0], "part-title");
    rowsInto(section, one[1]);
  });
}

function part(parent, text, rows, empty, level) {
  var section = add(parent, "section");
  add(section, "h" + level, text + " (" + rows.length + ")", "part-title");
  if (!rows.length) {
    add(section, "p", empty, "med-line");
    return;
  }
  rowsInto(section, rows);
}

function rowsInto(section, rows) {
  var list = add(section, "ul", null, "meds");
  rows.forEach(function (row) {
    var item = add(list, "li");
    add(item, "p", row.name, "med-name");
    if (row.detail) add(item, "p", row.detail, "med-line");
  });
}

function madeOn(timestamp) {
  var date = new Date(timestamp);
  if (isNaN(date)) return "an unknown date";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// An explanation, set apart from the instructions and buttons around it:
// "Note:" in bold, in a box with a teal bar down its left side.
function note(parent, text) {
  var p = add(parent, "p", null, "note");
  add(p, "strong", "Note: ", "note-label");
  p.appendChild(document.createTextNode(text));
  return p;
}

function add(parent, tag, text, className) {
  var element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}
