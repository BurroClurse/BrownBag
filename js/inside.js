// See what's inside: everything in the QR code as one short text, with no
// boxes or extra words (Tyler, 2026-11-23). It reads what comes out of the
// code, the same as the staff page does.

import { allergyDateLine, allergyEmptyText, allergyNotices, allergyParts, dateLines, emptyPartText, medicineNotices, medicinesTitle, recordsPartial, savedCopyText, timeText } from "./share.js";

// Draws into parent, starting with the patient's name. Returns that heading.
// made: what was made, when it isn't a QR code.
export function drawInside(parent, groups, made) {
  var patient = groups.patient || {};
  var title = add(parent, "h1", patient.name || "Shared medicine list");
  var top = patient.birthDate ? ["Born " + patient.birthDate] : [];
  lines(parent, top.concat(dateLines(groups, timeText, made)));
  if (groups.recordsSavedAt) warn(parent, savedCopyText(groups));
  drawAllergies(parent, groups);
  add(parent, "h2", medicinesTitle(groups));
  medicineNotices(groups).forEach(function (text) { warn(parent, text); });
  if (groups.claimsNotLoaded) warn(parent, "Insurance fills couldn't be loaded.");
  if (groups.fromRecords.length) items(parent, "From records", groups.fromRecords);
  else if (emptyPartText(groups, "records")) lines(parent, [(recordsPartial(groups) ? "From records: " : "") + emptyPartText(groups, "records")]);
  items(parent, "Filled, not in the health record", groups.fromClaims);
  items(parent, "As needed", groups.asNeeded);
  items(parent, "Added by patient", groups.addedByPatient);
  items(parent, "Not taking", groups.patientSaysStopped);
  return title;
}

function drawAllergies(parent, groups) {
  var allergies = groups.allergies;
  add(parent, "h2", "Allergies");
  allergyNotices(allergies).forEach(function (text) { warn(parent, text); });
  var dated = allergyDateLine(groups, timeText);
  var empty = allergyEmptyText(allergies);
  var said = allergies ? allergies.statements.map(function (text) { return "Records say: " + text + "."; }) : [];
  lines(parent, [dated, empty].filter(Boolean).concat(said));
  if (!allergies) return;
  allergyParts(allergies).forEach(function (one) { items(parent, one.title, one.rows); });
}

// One bullet each: the name, then its lines.
function items(parent, text, rows) {
  if (!rows || !rows.length) return;
  add(parent, "h3", text);
  var list = add(parent, "ul");
  rows.forEach(function (row) {
    var item = add(list, "li");
    add(item, "strong", row.name);
    (row.take ? [joined(row.take)].concat(row.flags, joined(row.facts.concat(row.rxnorm ? [["RxNorm", row.rxnorm]] : []))) : row.lines)
      .filter(Boolean)
      .forEach(function (line) { add(item, "div", line); });
  });
}

function joined(rows) {
  return rows.map(function (row) { return row[0] + ": " + row[1].trim(); }).join(" · ");
}

function lines(parent, texts) {
  texts.forEach(function (text) { add(parent, "p", text); });
}

function warn(parent, text) {
  add(parent, "p", text, "inside-warning");
}

function add(parent, tag, text, className) {
  var element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}
