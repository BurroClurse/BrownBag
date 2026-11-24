// Before adding a medicine, compare it with everything on the list, so the
// patient is asked before adding a duplicate, the same medicine at another
// dose, a medicine they marked stopped, or one whose name only looks like
// another (Hydroxyzine and Hydralazine). No DOM here, so Node's test runner
// can check it. The answer is a question for the patient, never a refusal.

// The drug's own first word: past "24 HR", "3 ML" and other leading
// numbers and units in RxNorm names, so "24 HR metformin …" is metformin.
var UNIT_WORDS = ["hr", "ml", "mg", "mcg", "unt", "actuat", "g", "l"];
function firstWord(name) {
  var words = String(name || "").trim().toLowerCase().split(/[\s,{}()\[\]]+/);
  for (var i = 0; i < words.length; i += 1) {
    if (/^[a-z][a-z-]*$/.test(words[i]) && UNIT_WORDS.indexOf(words[i]) === -1) return words[i];
  }
  return "";
}

// Which vitamin a name says: { letter: "b", number: "12" } for "Vitamin
// B12", "vitamin b-12" and "Vitamin B 12". The number is only read right
// after the letter, so the 50 in "Vitamin D 50 mcg" stays a dose. Null when
// it names more than one ("Vitamin A and D", "Vitamin D3 K2") or none.
function vitamin(name) {
  if (/\b(?:and|with|plus)\b|[&+]|\bvitamin\s+[a-k]\d*(?:\s+|\s*[\/,]\s*)[a-k]\d*\b/i.test(String(name || ""))) return null;
  var match = /\bvitamin\s+([a-k])(?:-?(\d{1,2})(?!\d)|\s(1|2|3|5|6|7|9|12)\b(?!\s*(?:mg|mcg|iu|unt|g)\b))?(?![a-z])/i.exec(String(name || ""));
  return match ? { letter: match[1].toLowerCase(), number: match[2] || match[3] || "" } : null;
}

// Vitamin D, D2 and D3 count as one; B vitamins are told apart by number.
// A name that doesn't say which vitamin could be any of them, so it asks.
function differentVitamins(a, b) {
  var first = vitamin(a);
  var second = vitamin(b);
  if (!first || !second) return false;
  if (first.letter !== second.letter) return true;
  return first.letter === "b" && Boolean(first.number && second.number && first.number !== second.number);
}

// "Lisinopril" for "lisinopril 10 MG Oral Tablet": how the panel names it.
export function displayName(name) {
  var which = vitamin(name);
  if (which && firstWord(name) === "vitamin") return "Vitamin " + which.letter.toUpperCase() + which.number;
  var first = firstWord(name);
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : String(name || "").trim();
}

function ingredientKey(ingredientOf, rxcui) {
  var found = rxcui && ingredientOf && ingredientOf.get(rxcui);
  return found ? found.rxcui : null;
}

function sameMedicine(candidate, entry, ingredientOf) {
  if (candidate.rxcui && entry.rxcui) {
    if (candidate.rxcui === entry.rxcui) return true;
    var a = ingredientKey(ingredientOf, candidate.rxcui);
    var b = ingredientKey(ingredientOf, entry.rxcui);
    // Both ingredients known: they decide. Otherwise (offline, slow
    // lookup) fall back to the drug's name, as for typed names.
    if (a && b) return a === b;
  }
  if (differentVitamins(candidate.name, entry.name)) return false;
  return firstWord(candidate.name) !== "" && firstWord(candidate.name) === firstWord(entry.name);
}

// Words compared loosely: "Twice a day" and "2 times a day" are the same.
function words(text) {
  return " " + String(text || "").toLowerCase()
    .replace(/1½/g, "1.5").replace(/½/g, "0.5")
    .replace(/\btwice\b/g, "2 times").replace(/\bonce\b/g, "1 time")
    .replace(/(\w{3,})ies\b/g, "$1y").replace(/\b(\w{3,})s\b/g, "$1")
    .replace(/[^a-z0-9.]+/g, " ").trim() + " ";
}

// Doses: the same words, or the same number when the record gives no unit
// and the drug comes in that form ("1" for a tablet is 1 tablet).
function sameDose(dose, theirs, names) {
  var mine = words(dose);
  var other = words(theirs);
  if (mine === other) return true;
  var bare = /^ (\d+(?:\.\d+)?) $/.exec(other);
  var counted = /^ (\d+(?:\.\d+)?) ([a-z]+) $/.exec(mine);
  return Boolean(bare && counted && bare[1] === counted[1] && words(names).indexOf(" " + counted[2] + " ") !== -1);
}

function asNeeded(text) {
  return /\b(as needed|prn)\b/i.test(String(text || ""));
}

function sameDoseAndSchedule(candidate, entry) {
  if (!candidate.dose || !candidate.frequency) return false;
  // Two products of one drug (10 MG and 20 MG) are never a duplicate.
  if (candidate.rxcui && entry.rxcui && candidate.rxcui !== entry.rxcui) return false;
  if (asNeeded(candidate.frequency) !== asNeeded(entry.frequency)) return false;
  // One of several directions, one end of a range, or a schedule left to the
  // record isn't the same schedule.
  if (/Direction 1: |\d to \d|see the record/i.test(String(entry.frequency || ""))) return false;
  var schedule = words(entry.frequency);
  // With no dose of its own, the record has it in the schedule's words.
  var dose = entry.dose
    ? sameDose(candidate.dose, entry.dose, candidate.name + " " + entry.name)
    : schedule.indexOf(words(candidate.dose)) !== -1;
  return dose && schedule.indexOf(words(candidate.frequency)) !== -1;
}

function distance(a, b) {
  var row = [];
  for (var j = 0; j <= b.length; j += 1) row[j] = j;
  for (var i = 1; i <= a.length; i += 1) {
    var previous = row[0];
    row[0] = i;
    for (j = 1; j <= b.length; j += 1) {
      var kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

function looksAlike(candidate, entry) {
  var a = firstWord(candidate.name);
  var b = firstWord(entry.name);
  if (a.length < 5 || b.length < 5) return false;
  var d = distance(a, b);
  // Up to 2 letters apart; 3 for long names (Hydroxyzine, Hydralazine).
  var most = a.length >= 9 && b.length >= 9 ? 3 : 2;
  return d >= 1 && d <= most;
}

// candidate: { name, rxcui, dose, frequency }. list: entries with key,
// name, rxcui, dose, frequency, origin ("records", "claims", "added") and
// stoppedAt when stopped. ingredientOf: rxcui -> { rxcui of ingredients }.
// Returns null, or { kind: "stopped" | "duplicate" | "different" |
// "lookalike", match }, in that order of importance.
export function checkAddition(candidate, list, ingredientOf) {
  var same = (list || []).filter(function (entry) { return sameMedicine(candidate, entry, ingredientOf); });
  var stopped = same.filter(function (entry) { return entry.stoppedAt; })[0];
  if (stopped) return { kind: "stopped", match: stopped };
  var active = same.filter(function (entry) { return !entry.stoppedAt; });
  var duplicate = active.filter(function (entry) { return sameDoseAndSchedule(candidate, entry); })[0];
  if (duplicate) return { kind: "duplicate", match: duplicate };
  if (active.length) return { kind: "different", match: active[0] };
  var alike = (list || []).filter(function (entry) { return looksAlike(candidate, entry); });
  var closest = alike.filter(function (entry) { return !entry.stoppedAt; })[0] || alike[0];
  return closest ? { kind: "lookalike", match: closest } : null;
}

export function lookalikeText(name, match) {
  return name + " looks like " + displayName(match.name) + ", which is " +
    (match.stoppedAt ? "on your stopped list" : "already on your list") +
    ". They're different medicines. Check the bottle.";
}
