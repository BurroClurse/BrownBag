// One medicine's card, piece by piece: the name, how to take it, anything to
// check, then everything else, each with its own label. My medicines and the
// staff page draw it the same way. Only drawCard touches the page.

import { claimsLabel, completedLine } from "./claims.js";
import { doseChange, holdText } from "./meds.js";
import { isOwnSide, sideWords } from "./reconcile.js";
import { displayName } from "./add-check.js";

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Mar 2, 2023", or only the month or year when that's all the record has.
// Anything else is shown as it came.
export function dateText(date) {
  var parts = datePartsOf(date);
  if (!parts) return String(date);
  if (!parts[2]) return parts[1];
  return MONTHS[Number(parts[2]) - 1] + " " + (parts[3] ? Number(parts[3]) + ", " : "") + parts[1];
}

// "Oct 2026": the month and year only, for when a record was written.
export function monthText(date) {
  var parts = datePartsOf(date);
  if (!parts) return String(date);
  return parts[2] ? MONTHS[Number(parts[2]) - 1] + " " + parts[1] : parts[1];
}

// "Mar 3": the day, for something the patient did this year or so. A date
// with no day says its month and year instead.
export function dayText(date) {
  var parts = datePartsOf(date);
  if (!parts || !parts[3]) return monthText(date);
  return MONTHS[Number(parts[2]) - 1] + " " + Number(parts[3]);
}

function datePartsOf(date) {
  return /^(\d{4})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01])(?:T.*)?)?)?$/.exec(String(date));
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
  var question = entry.answer ? null : entry.question;
  // A side the patient chose from another source than the shown record:
  // the shown record's prescriber, dates and history aren't that side's.
  var chosen = entry.answer ? chosenSide(entry) : null;
  var otherRecord = Boolean(chosen) && !isOwnSide(entry, chosen);
  var change = otherRecord ? null : doseChange(entry);
  if (fromRecords && !otherRecord) {
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
  if (fromRecords) say("Source", otherRecord ? chosen.sourceName : entry.source);
  say("You marked", entry.stoppedAt ? "Not taking, " + dateText(entry.stoppedAt) : entry.asNeededAt ? "As needed, " + dateText(entry.asNeededAt) : null);
  if (entry.prn) say("Who says", "Your records say as needed");
  else if (!entry.asNeededAt && entry.schedule && entry.schedule.asNeeded) say("Who says", "You added this");
  if (entry.answer) say("You said", answerWords(entry) + " (" + dayText(entry.answer.answeredAt) + ")");
  var lead = question ? questionLines(question).filter(Boolean) : [];
  var card = {
    take: takeOf(entry, question),
    flags: lead.concat([entry.hospital ? "Hospital order" : null, HOLDS[holdText(entry)], entry.completedButFilled ? completedLine(entry.completedButFilled, entry.recordStatus) : null].filter(Boolean)),
    facts: facts
  };
  // How many flags go above the take rows: what the records disagree on
  // comes first, as the question it is. Other cards keep today's order.
  if (lead.length) card.lead = lead.length;
  // A chosen side names the card too, so its name and dose are one record's.
  if (cardName(entry) !== entry.name) card.name = cardName(entry);
  return card;
}

// The name a card shows: the side the patient chose, else the record's.
// Its buttons and what's said about it use the same. While "How much do you
// take?" is open, its plain name, so no one side's strength is the name
// (Tyler, 2026-11-25).
export function cardName(entry) {
  if (!entry.answer && entry.question && entry.question.kind === "dose") return plainName(entry.name);
  var chosen = entry.answer ? chosenSide(entry) : null;
  return (chosen && chosen.name) || entry.name;
}

// With no answer yet, or "Not sure", no single dose: what each source says
// instead. With a side chosen, that side's.
function takeOf(entry, question) {
  var answer = entry.answer;
  var sides = entry.group && entry.group.sides.length > 1 ? entry.group.sides : null;
  if (sides && question) return sides.map(function (side) { return sideRow(side, question.kind === "status"); });
  if (sides && answer && answer.choice === "not-sure") {
    return sides.map(function (side) { return sideRow(side, aboutStopping(answer.sides && answer.sides.length ? answer.sides : sides)); });
  }
  var chosen = answer ? chosenSide(entry) : null;
  if (chosen) return takeRows(chosen.dose, chosen.route, chosen.frequency);
  return takeRows(entry.dose, entry.route, entry.frequency);
}

var CARD_LINES = {
  dose: "Your records don't agree on how much you take.",
  schedule: "Your records don't agree on how often you take it.",
  status: "Your records don't agree on whether you still take it."
};

// A mark's question is the patient's mark against a record, not two
// records, so it has only its own words.
function questionLines(question) {
  var mark = String(question.fingerprint || "").indexOf("mark:") === 0;
  return [mark ? null : CARD_LINES[question.kind], question.why];
}

var STATUS_WORDS = { current: "current", "not-current": "stopped" };

// On a question about stopping, each side says which it lists.
function sideRow(side, withStatus) {
  var status = withStatus && STATUS_WORDS[side.status];
  return [side.sourceName + (side.asOf ? ", " + monthText(side.asOf) : ""), sideWords(side) + (status ? ", " + status : "")];
}

function aboutStopping(sides) {
  return sides.some(function (one) { return one.status === "not-current"; });
}

// The plain name: "Lisinopril", or for a combination every ingredient,
// "Hydrochlorothiazide / Lisinopril": the words before each strength.
function plainName(name) {
  var parts = String(name || "").split(" / ");
  if (parts.length < 2) return displayName(name);
  return parts.map(function (part) {
    var before = /^(.*?)\s+\d/.exec(part.trim());
    var words = before && before[1] ? before[1] : displayName(part);
    return words.charAt(0).toUpperCase() + words.slice(1);
  }).join(" / ");
}

// The side an answer chose, as the records say it now, else as it was
// then; null for an answer that isn't a side.
function chosenSide(entry) {
  var answer = entry.answer;
  var find = function (sides) { return (sides || []).filter(function (one) { return one.sourceId === answer.choice; })[0]; };
  return (entry.group && find(entry.group.sides)) || find(answer.sides) || null;
}

var CHOICE_WORDS = { "not-taking": "I don't take this anymore", "not-sure": "Not sure, ask my doctor", taking: "Yes, I take it" };

// The answer as the patient chose it. A side is said as it was then: in a
// question about stopping, which side they agreed with; else its dose and
// how often. A stop is said as it was picked: "No, I stopped" to "Do you
// still take it?" (a mark's question, or the group's status one, asked
// first), else "I don't take this anymore".
function answerWords(entry) {
  var answer = entry.answer;
  if (answer.choice === "not-taking" && askedAboutStopping(entry)) return "No, I stopped";
  if (CHOICE_WORDS[answer.choice]) return CHOICE_WORDS[answer.choice];
  var sides = answer.sides && answer.sides.length ? answer.sides : (entry.group ? entry.group.sides : []);
  var side = sides.filter(function (one) { return one.sourceId === answer.choice; })[0];
  if (!side) return "See the record";
  if (aboutStopping(sides)) return side.status === "not-current" ? "No, I stopped" : "Yes, I take it";
  return sideWords(side);
}

// Worked out from what's saved, so answers saved before this need nothing new.
function askedAboutStopping(entry) {
  var answer = entry.answer;
  if (String(answer.fingerprint || "").indexOf("mark:") === 0) return true;
  if (entry.group && Array.isArray(entry.group.verdicts)) return entry.group.verdicts.indexOf("status") !== -1;
  return aboutStopping(answer.sides || []);
}

// The name goes in as text, like everything from the records.
export function drawCard(parent, name, card) {
  var lead = card.lead || 0;
  add(parent, "p", name, "med-name");
  card.flags.slice(0, lead).forEach(function (text) { add(parent, "p", text, "flag"); });
  drawRows(parent, card.take, "take");
  card.flags.slice(lead).forEach(function (text) { add(parent, "p", text, "flag"); });
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
