// One medicine's card, piece by piece: the name, how to take it, anything to
// check, then everything else, each with its own label. My medicines and the
// staff page draw it the same way. Only drawCard touches the page.

import { claimsLabel, completedLine } from "./claims.js";
import { doseChange, holdText } from "./meds.js";

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Mar 2, 2023", or only the month or year when that's all the record has.
// Anything else is shown as it came.
export function dateText(date) {
  var parts = /^(\d{4})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01])(?:T.*)?)?)?$/.exec(String(date));
  if (!parts) return String(date);
  if (!parts[2]) return parts[1];
  return MONTHS[Number(parts[2]) - 1] + " " + (parts[3] ? Number(parts[3]) + ", " : "") + parts[1];
}

// A whole instruction ("Take 1 by mouth…") isn't a "how often".
export function isDirections(text) {
  return text.length > 40 || /^Direction 1: /.test(text) || /^(take|use|apply|inject|inhale|place|put|instill|chew|give|insert|dissolve|swallow|spray)\b/i.test(text);
}

export function takeRows(dose, route, often) {
  var rows = [];
  if (dose) rows.push(["Dose", dose]);
  if (route) rows.push(["How taken", route]);
  if (often) rows.push([isDirections(often) ? "Directions" : "How often", often]);
  return rows;
}

export function fillRows(fills) {
  if (!fills) return [];
  if (!fills.count) return [["Filled", "No fill found in your claims"]];
  return fillRowsFrom(fills.count, fills.last, claimsLabel(fills));
}

export function fillRowsFrom(count, last, label) {
  var once = count === 1;
  var when = last ? (once ? "" : "last ") + dateText(last) : (once ? "date not given" : "dates not given");
  var through = / claims(, some paid without insurance)?$/.exec(label);
  var paid = through ? "Through " + label.slice(0, through.index) + (through[1] ? ", some without insurance" : "") : "Without insurance";
  return [["Filled", (once ? "Once, " : count + " times, ") + when], ["Paid", paid]];
}

var HOLDS = { all: "On hold in your records", some: "One of your records has this on hold" };

export function olderText(date) {
  return "An older prescription" + (date ? ", " + dateText(date) : "");
}

// claimsLoaded: "No fill found" never shows just because the claims couldn't
// be read.
export function patientCard(entry, claimsLoaded) {
  var facts = [];
  var say = function (label, text) { if (text) facts.push([label, text]); };
  var fromRecords = entry.origin !== "claims" && !entry.addedAt;
  var change = doseChange(entry);
  if (fromRecords) {
    say("Prescribed by", entry.prescriber);
    say("Since", entry.start && dateText(entry.start));
    say("Until", entry.end && dateText(entry.end));
    if (entry.count > 1 && entry.firstDate) say("Prescribed", entry.count + " times, first in " + String(entry.firstDate).slice(0, 4));
    else if (entry.count > 1) say("In your records", entry.count + " times");
  }
  if (change) say("Dose change", change.from + " to " + change.to + (change.date ? ", " + dateText(change.date) : ""));
  if (claimsLoaded) facts = facts.concat(fillRows(entry.fills));
  say("Added", entry.addedAt && dateText(entry.addedAt));
  say("From", entry.older && olderText(entry.older.date));
  if (fromRecords) say("Source", entry.source);
  say("You marked", entry.stoppedAt ? "Not taking, " + dateText(entry.stoppedAt) : entry.asNeededAt ? "As needed, " + dateText(entry.asNeededAt) : null);
  if (entry.prn) say("Who says", "Your records say as needed");
  else if (!entry.asNeededAt && entry.schedule && entry.schedule.asNeeded) say("Who says", "You added this");
  return {
    take: takeRows(entry.dose, entry.route, entry.frequency),
    flags: [entry.hospital ? "Hospital order" : null, HOLDS[holdText(entry)], entry.completedButFilled ? completedLine(entry.completedButFilled, entry.recordStatus) : null].filter(Boolean),
    facts: facts
  };
}

// The name goes in as text, like everything from the records.
export function drawCard(parent, name, card) {
  add(parent, "p", name, "med-name");
  drawRows(parent, card.take, "take");
  card.flags.forEach(function (text) { add(parent, "p", text, "flag"); });
  drawRows(parent, card.facts, "facts");
}

function drawRows(parent, rows, className) {
  if (!rows.length) return;
  var list = add(parent, "dl", null, className);
  rows.forEach(function (row) {
    // A whole sentence gets the full width, under its label.
    var pair = add(list, "div", null, row[0] === "Directions" ? "wide" : null);
    add(pair, "dt", row[0]);
    add(pair, "dd", row[1].trim());
  });
}

function add(parent, tag, text, className) {
  var element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}
