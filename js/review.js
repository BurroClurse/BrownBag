// The review: when the records disagree, the patient is asked one thing at
// a time, one card per screen (spec, sections 6 and 7). What each card asks,
// its choices and the answer it saves. No page here, so Node's tests can
// check it; the screen is in app.js.

import { cardName, monthText, nameOnceStopped, recentFill } from "./card.js";
import { isMarkFingerprint, sideWords } from "./reconcile.js";
import { dayOf, keysOf, newer } from "./view.js";

// Where the patient is in the review, so it comes back after the 5-minute
// lock (which reloads the page). Only the card's number, 1 for the first.
export var REVIEW_SPOT = "brownbag-review-spot";

// What the My medicines box and the line on home say, for N cards. On a
// partial list, no number (ruling R40): it would read as the whole, as the
// Medicines heading drops its count there.
export function checkText(count, partial) {
  if (partial) return { line: "Some of your records don't agree.", button: "Check them" };
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
  // A mark's question is the patient's own mark against a record (R2).
  if (isMarkFingerprint(question.fingerprint)) {
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
  if (!text) return null;
  // Its own id, so Do this later can put focus back on it.
  var groupId = entry.answer ? entry.answer.groupId : entry.question.groupId;
  return { text: text, label: text + ": " + cardName(entry), id: "card-review-" + String(groupId).replace(/[^A-Za-z0-9_-]/g, "-") };
}

// The patient's data after an answer, as a new copy; what was passed in is
// left alone. The group's old answer goes (a Change replaces it). For a
// mark's question (R2), "taking" takes away the Not taking marks under every
// key the card answers to and saves no answer; "not-taking" saves the answer
// and marks every key with the mark's own date, so the answer keeps matching
// its question, and clears As needed there, as the Not taking button does.
// "not-sure" and a source's id only save the answer.
export function applyAnswer(data, card, value, today) {
  var question = card.question;
  var keys = keysOf(card);
  var stopped = Object.assign({}, data.stopped || {});
  var asNeeded = Object.assign({}, data.asNeeded || {});
  var answers = (data.answers || []).filter(function (answer) { return answer.groupId !== question.groupId; });
  var mark = isMarkFingerprint(question.fingerprint) && question.mark;
  if (value === "taking") {
    keys.forEach(function (key) { delete stopped[key]; });
  } else {
    answers.push(answerFor(card, value, today));
    if (value === "not-taking" && mark) {
      keys.forEach(function (key) {
        stopped[key] = mark.at;
        delete asNeeded[key];
      });
    }
  }
  return Object.assign({}, data, { stopped: stopped, asNeeded: asNeeded, answers: answers });
}

// What an answer adds to the changes made on a saved copy, which the QR
// code's "isn't fully up to date" list says (the developer, 2026-11-26): [{ kind,
// name, extra }]. A mark's Yes and No are what the Not taking button logs
// (No also takes it off As needed); any other answer, in the words picked,
// and whether it stopped the medicine, so Undo can take it back.
export function answerChanges(card, value, data, today) {
  var name = cardName(card);
  var mark = card.question.mark;
  if (mark && value === "taking") return [{ kind: "unstopped", name: name }];
  if (mark && value === "not-taking") {
    var needed = keysOf(card).some(function (key) { return ((data && data.asNeeded) || {})[key]; });
    return (needed ? [{ kind: "regular", name: name }] : []).concat({ kind: "stopped", name: name });
  }
  var picked = choicesFor(card, today).filter(function (choice) { return choice.value === value; })[0];
  // Stopped, it's named as Undo will name it, so Undo takes this line back.
  if (value === "not-taking") name = nameOnceStopped(card);
  return [{ kind: "answered", name: name, extra: { said: picked ? picked.label : "See the record", stopped: value === "not-taking" } }];
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

// The newest dated one, the first of a tie; with none dated, the first.
function newestOf(sides) {
  var date = sides.reduce(function (latest, side) { return newer(side.asOf, latest); }, null);
  return sides.filter(function (side) { return dayOf(side.asOf) === dayOf(date); })[0] || sides[0] || null;
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

// "Filled Oct 2026" for a fill within a year, else nothing: the card's own
// calendar rule, so a fill this leaves out gets "Last filled over a year
// ago." there. A fill is evidence they take it, never the answer.
function fillText(card, today) {
  var last = card.fills && card.fills.count ? card.fills.last : null;
  if (!last || !today) return "";
  return recentFill(last, dayOf(today)) ? "Filled " + monthText(last) : "";
}
