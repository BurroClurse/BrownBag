// Before adding a medicine, compare it with everything on the list, so the
// patient is asked before adding a duplicate, the same medicine at another
// dose, a medicine they marked stopped, or one whose name only looks like
// another (Hydroxyzine and Hydralazine). No DOM here, so Node's test runner
// can check it. The answer is a question for the patient, never a refusal.

function firstWord(name) {
  return String(name || "").trim().toLowerCase().split(/[\s,]+/)[0] || "";
}

function ingredientKey(ingredientOf, rxcui) {
  var found = rxcui && ingredientOf && ingredientOf.get(rxcui);
  return found ? found.rxcui : null;
}

function sameMedicine(candidate, entry, ingredientOf) {
  if (candidate.rxcui && entry.rxcui) {
    if (candidate.rxcui === entry.rxcui) return true;
    var a = ingredientKey(ingredientOf, candidate.rxcui);
    return Boolean(a) && a === ingredientKey(ingredientOf, entry.rxcui);
  }
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

function sameDoseAndSchedule(candidate, entry) {
  if (!candidate.dose || !candidate.frequency) return false;
  // Two products of one drug (10 MG and 20 MG) are never a duplicate.
  if (candidate.rxcui && entry.rxcui && candidate.rxcui !== entry.rxcui) return false;
  var theirs = words([entry.dose, entry.frequency].filter(Boolean).join(" "));
  return theirs.indexOf(words(candidate.dose)) !== -1 && theirs.indexOf(words(candidate.frequency)) !== -1;
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
  var alike = (list || []).filter(function (entry) { return looksAlike(candidate, entry); })[0];
  return alike ? { kind: "lookalike", match: alike } : null;
}
