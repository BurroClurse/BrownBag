// The review: when the records disagree, the patient is asked one thing at
// a time, one card per screen (spec, sections 6 and 7). What each card asks,
// its choices and the answer it saves. No page here, so Node's tests can
// check it; the screen is in app.js.

import { cardName, monthText } from "./card.js";
import { sideWords } from "./reconcile.js";

// Where the patient is in the review, so it comes back after the 5-minute
// lock (which reloads the page). Only the card's number, 1 for the first.
export var REVIEW_SPOT = "brownbag-review-spot";

// What the My medicines box and the line on home say, for N cards.
export function checkText(count) {
  var one = count === 1;
  return {
    line: "Your records don't agree on " + count + (one ? " thing" : " things"),
    button: one ? "Check it" : "Check them"
  };
}

var QUESTIONS = {
  dose: "How much do you take?",
  schedule: "How often do you take it?",
  status: "Do you still take it?"
};

// The question a card asks, as its legend.
export function questionText(card) {
  return QUESTIONS[card.question.kind];
}

// A mark's question is the patient's own mark against a record (ruling R2).
function isMark(question) {
  return String(question.fingerprint || "").indexOf("mark:") === 0;
}

var NOT_TAKING = { value: "not-taking", label: "I don't take this anymore", detail: "" };
var NOT_SURE = { value: "not-sure", label: "Not sure, ask my doctor", detail: "" };

// The choices on a card, from what the sources say and nothing else:
// [{ value, label, detail }]. today is "YYYY-MM-DD", for whether a fill is
// recent enough to say.
export function choicesFor(card, today) {
  var question = card.question;
  if (question.kind !== "status") {
    // How much or how often: each source's own words, oldest first. A source
    // that says it stopped has no dose to choose.
    return currentSides(card).map(function (side) {
      return { value: side.sourceId, label: sideWords(side), detail: side.sourceName + (side.asOf ? ", " + monthText(side.asOf) : "") };
    }).concat(NOT_TAKING, NOT_SURE);
  }
  var fill = fillText(card, today);
  if (isMark(question)) {
    // "taking" is never saved: the marks go instead (R2).
    return [
      { value: "taking", label: "Yes, I take it", detail: withFill(listedCurrent(card), fill) },
      { value: "not-taking", label: "No, I stopped", detail: "" },
      NOT_SURE
    ];
  }
  // A status question has a current side; a saved list from before can't
  // be sure, so it falls back to the newest side.
  var current = newestOf(card.group.sides.filter(function (side) { return side.status === "current"; })) || newestOf(card.group.sides);
  var stopped = newestOf(card.group.sides.filter(function (side) { return side.status === "not-current"; }));
  return [
    { value: current.sourceId, label: "Yes, I take it", detail: withFill(says(current.sourceName, "current", current.asOf), fill) },
    { value: "not-taking", label: "No, I stopped", detail: stopped ? says(stopped.sourceName, "stopped", stopped.asOf) : "" },
    NOT_SURE
  ];
}

// The button under a card on My medicines: "Check this" while its question
// is open, "Change" once it's answered, else none. Its label names the card.
export function reviewButton(entry) {
  var text = entry.answer ? "Change" : entry.question ? "Check this" : null;
  return text ? { text: text, label: text + ": " + cardName(entry) } : null;
}

// What the patient chose, as it's saved (spec, section 7). A mark's question
// has its own group id and fingerprint (R2); a group's is the group's.
export function answerFor(card, value, today) {
  var question = card.question || {};
  var group = card.group || null;
  return {
    groupId: question.groupId || (group ? group.id : card.key),
    fingerprint: question.fingerprint || (group ? group.fingerprint : null),
    sides: group ? group.sides.map(function (side) { return Object.assign({}, side); }) : [],
    choice: value,
    answeredAt: today
  };
}

export function saveSpot(storage, number) {
  try {
    storage.setItem(REVIEW_SPOT, String(number));
  } catch (error) {
    // Not kept: after the lock, the review starts again from home.
  }
}

// The saved card number, or null.
export function spotFrom(storage) {
  try {
    var text = storage.getItem(REVIEW_SPOT);
    return /^[1-9]\d{0,3}$/.test(String(text)) ? Number(text) : null;
  } catch (error) {
    return null;
  }
}

export function clearSpot(storage) {
  try {
    storage.removeItem(REVIEW_SPOT);
  } catch (error) {
    // Nothing kept to clear.
  }
}

// Oldest first, an undated one last, as reconcile.js puts them.
function currentSides(card) {
  var sides = card.group.sides;
  var current = sides.filter(function (side) { return side.status === "current"; });
  return (current.length ? current : sides).slice().sort(function (a, b) {
    if (dayOf(a.asOf) === dayOf(b.asOf)) return 0;
    if (!a.asOf) return 1;
    if (!b.asOf) return -1;
    return dayOf(a.asOf) < dayOf(b.asOf) ? -1 : 1;
  });
}

function says(source, what, date) {
  return source + " says " + what + (date ? ", " + monthText(date) : "");
}

function withFill(detail, fill) {
  return [detail, fill].filter(Boolean).join(". ");
}

// The newest dated one; with none dated, the first.
function newestOf(sides) {
  return sides.reduce(function (best, side) {
    return !best || dayOf(side.asOf) > dayOf(best.asOf) ? side : best;
  }, null);
}

function dayOf(date) {
  return String(date || "").slice(0, 10);
}

// The record that still lists it, for a mark's question: the one its
// sentence names (view.js), else the newest current one.
function listedCurrent(card) {
  var listed = card.question.listed;
  if (!card.group && card.origin === "claims") return "";
  if (listed && listed.sourceName) return says(listed.sourceName, "current", listed.date);
  if (!card.group) return card.source ? says(card.source, "current", card.lastDate) : "";
  var side = newestOf(card.group.sides.filter(function (one) { return one.status === "current"; }));
  return side ? says(side.sourceName, "current", side.asOf) : "";
}

// "Filled Oct 2026" for a fill within a year, as claims.js counts recent,
// else nothing. A fill is evidence they take it, never the answer.
function fillText(card, today) {
  var last = card.fills && card.fills.count ? card.fills.last : null;
  if (!last || !today) return "";
  var days = (Date.parse(dayOf(today)) - Date.parse(last)) / (24 * 60 * 60 * 1000);
  return days <= 365 ? "Filled " + monthText(last) : "";
}
