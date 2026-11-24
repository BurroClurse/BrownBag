// The shared list on the staff page: allergies and medicines are two blocks
// (design 2026-11-23). "See what's inside" is the same list as short text
// (js/inside.js); a test checks nothing staff see is left out of it.

import { allergyDateLine, allergyEmptyText, allergyNotices, allergyParts, staffSaysNone, dateLines, emptyPartText, fillsNote, medicineNotices, medicinesTitle, recordsPartial, savedCopyText, timeText } from "./share.js";
import { drawCard } from "./card.js";
import { showsSymbol } from "./allergies.js";

// Draws into parent, starting with the patient's name as heading `level`.
// Returns that heading. No "your care team confirms it" note: staff don't
// need it (the patient reads it on My medicines).
export function drawShareList(parent, groups, level) {
  var title = add(parent, "h" + level, groups.patient ? groups.patient.name : "Shared medicine list", "share-name");
  title.tabIndex = -1;
  if (groups.patient && groups.patient.birthDate) {
    add(parent, "p", "Born " + groups.patient.birthDate, "who");
  }
  dateLines(groups, timeText).forEach(function (text) { add(parent, "p", text, "who"); });
  if (groups.recordsSavedAt) {
    add(parent, "p", savedCopyText(groups), "notice");
  }
  drawAllergies(parent, groups.allergies, level + 1, allergyDateLine(groups, timeText));
  var block = medicinesBlock(parent, medicinesTitle(groups), level + 1).section;
  medicineNotices(groups).forEach(function (text) { add(block, "p", text, "notice"); });
  var fills = fillsNote(groups);
  if (fills) note(block, fills);
  part(block, "From records", groups.fromRecords, emptyPartText(groups, "records"), level + 2, recordsPartial(groups));
  if (groups.fromClaims && groups.fromClaims.length) {
    part(block, "Filled, not in the health record", groups.fromClaims, "", level + 2);
  }
  if (groups.asNeeded && groups.asNeeded.length) {
    part(block, "As needed", groups.asNeeded, "", level + 2);
  }
  part(block, "Added by patient", groups.addedByPatient, emptyPartText(groups, "added"), level + 2, groups.ownMissing);
  part(block, "Patient says not taking", groups.patientSaysStopped, emptyPartText(groups, "stopped"), level + 2, groups.ownMissing);
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
function drawAllergies(parent, allergies, level, dated) {
  var count = allergies ? allergies.fromRecords.length + allergies.fromPatient.length : 0;
  var notices = allergyNotices(allergies);
  var symbol = !allergies || showsSymbol(count, allergies.unspecified, allergies.status);
  var section = allergyBox(parent, count ? "Allergies (" + count + ")" : "Allergies", symbol, level).section;
  if (dated) add(section, "p", dated, "who");
  var saysNone = staffSaysNone(allergies);
  if (saysNone) {
    section.classList.add("allergy-none-known");
    add(section, "p", "No known allergies", "none-known");
    add(section, "p", "The patient says this.");
  }
  notices.forEach(function (text) { add(section, "p", text, "notice"); });
  var empty = saysNone ? null : allergyEmptyText(allergies);
  if (empty) add(section, "p", empty, allergies ? "med-line" : "notice");
  if (!allergies) return;
  allergies.statements.forEach(function (text) { add(section, "p", "Records say: " + text + ".", "med-line"); });
  allergyParts(allergies).forEach(function (one) {
    add(section, "h" + (level + 1), one.title, "part-title");
    rowsInto(section, one.rows);
  });
}

// partial: some of it didn't load, so no number.
function part(parent, text, rows, empty, level, partial) {
  var section = add(parent, "section");
  add(section, "h" + level, partial ? text : text + " (" + rows.length + ")", "part-title");
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
    if (row.take) {
      drawCard(item, row.name, row);
      return;
    }
    // An allergy.
    add(item, "p", row.name, "med-name");
    row.lines.forEach(function (text) { add(item, "p", text, "med-line"); });
  });
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
