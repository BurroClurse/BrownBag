// Reconciling medicine lists from more than one source: is the other source
// the same person, do two records name the same medicine, and where do the
// sources agree. Worked out fresh from the records every time, never stored
// as buckets. No DOM here, so Node's test runner can check it.

import { formOf, strengthOf, strengthsOf, statusWord } from "./meds.js";
import { firstWord, words } from "./add-check.js";

// Only these matches put two records in one group.
export var GROUPS = ["rxcui", "name", "ingredients"];

// "Sertraline 50 MG Oral Tablet [Zoloft]" and "sertraline 50 mg oral tablet"
// are the same drug, strength and form. Different strengths stay different.
export function plainName(name) {
  return String(name || "").toLowerCase().replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

// Only a whole date: "1950" or "1950-02" could be many people. A datetime's
// date is its first 10 characters, never moved to local time, which could
// make it another day.
var FULL_DATE = /^(\d{4}-\d{2}-\d{2})(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;
// Dates sources put in when they don't know one: shared by many people.
var PLACEHOLDER_DATES = ["1900-01-01", "1901-01-01", "1800-01-01", "0001-01-01"];

function birthDateOf(value) {
  var found = FULL_DATE.exec(String(value || ""));
  return found && PLACEHOLDER_DATES.indexOf(found[1]) === -1 ? found[1] : null;
}

// "_birthDate" saying why it's missing: no birth date, whatever else is there.
function absentBirthDate(patient) {
  var extensions = (patient._birthDate && patient._birthDate.extension) || [];
  return extensions.some(function (e) { return e && /data-absent-reason$/.test(String(e.url || "")); });
}

// The names to try, in order: official ones, then usual ones, then the
// rest that aren't old, maiden, nickname or anonymous ones. The first that
// has a family and a given name is the person's.
var NOT_NOW = ["old", "maiden", "nickname", "anonymous"];
function currentNames(names) {
  var list = (Array.isArray(names) ? names : []).filter(function (name) { return name && typeof name === "object"; });
  var used = function (use) { return list.filter(function (name) { return name.use === use; }); };
  return used("official").concat(used("usual"), list.filter(function (name) { return ["official", "usual"].concat(NOT_NOW).indexOf(name.use) === -1; }));
}

// Endings that tell a father from a son, however they're written. Degrees
// (MSc, PharmD, MD) don't say who, and a person can gain one between records.
var SUFFIXES = { jr: "jr", junior: "jr", sr: "sr", senior: "sr", ii: "ii", "2nd": "ii", iii: "iii", "3rd": "iii", iv: "iv", "4th": "iv" };
var SUFFIX = /[\s,]+(jr|sr|ii|iii|iv|junior|senior|2nd|3rd|4th)\.?\s*$/i;
function withoutSuffix(text) {
  var rest = String(text || "").trim();
  var found = [];
  var match;
  while ((match = SUFFIX.exec(rest))) {
    found.unshift(SUFFIXES[match[1].toLowerCase()]);
    rest = rest.slice(0, match.index).trim();
  }
  return { rest: rest, suffix: found.join(" ") };
}

function suffixOf(list) {
  return (Array.isArray(list) ? list : [list]).map(function (text) { return String(text || "").toLowerCase().replace(/\./g, "").trim(); })
    .filter(function (text) { return Object.prototype.hasOwnProperty.call(SUFFIXES, text); })
    .map(function (text) { return SUFFIXES[text]; }).join(" ");
}

function nameWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function firstNameWord(text) {
  return nameWords(text)[0] || "";
}

function middleOf(text) {
  return nameWords(text).slice(1).join(" ");
}

// Words before the last one that belong to the family name: "van de Heuvel".
var PARTICLES = ["van", "von", "de", "der", "den", "del", "della", "la", "le", "du", "da", "di", "dos", "das", "ten", "ter", "bin", "ibn", "al", "el"];

// A name written only as text: "LAST, FIRST MIDDLE", or "First Middle Last".
function fromText(text) {
  var split = withoutSuffix(text);
  var comma = split.rest.indexOf(",");
  if (comma !== -1) {
    var family = withoutSuffix(split.rest.slice(0, comma));
    var givenPart = split.rest.slice(comma + 1);
    return { family: family.rest, given: firstNameWord(givenPart), middle: middleOf(givenPart), suffix: [split.suffix, family.suffix].filter(Boolean).join(" ") };
  }
  var words = split.rest.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  var start = words.length - 1;
  while (start > 1 && PARTICLES.indexOf(words[start - 1].toLowerCase()) !== -1) start -= 1;
  return { family: words.slice(start).join(" "), given: words[0], middle: words.slice(1, start).join(" "), suffix: split.suffix };
}

// A FHIR Patient as { family, given, birthDate }, with middle ("Olaf", every
// given word after the first) and suffix ("jr") when it has them, or null
// when the name or a whole birth date is missing.
export function personOf(patient) {
  var birthDate = patient && !absentBirthDate(patient) ? birthDateOf(patient.birthDate) : null;
  if (!birthDate) return null;
  return currentNames(patient.name).map(function (name) { return nameParts(name, birthDate); }).filter(Boolean)[0] || null;
}

function nameParts(name, birthDate) {
  var given = (Array.isArray(name.given) ? name.given : [name.given]).map(function (part) { return String(part || ""); }).join(" ");
  var family = withoutSuffix(name.family);
  var parts = { family: family.rest, given: firstNameWord(given), middle: middleOf(given), suffix: [suffixOf(name.suffix), family.suffix].filter(Boolean).join(" ") };
  if (!parts.family || !parts.given) {
    var text = fromText(name.text);
    parts = text && Object.assign(text, { suffix: [suffixOf(name.suffix), text.suffix].filter(Boolean).join(" ") });
  }
  if (!parts || !parts.family || !parts.given) return null;
  return Object.assign({ family: parts.family, given: parts.given, birthDate: birthDate },
    parts.middle ? { middle: parts.middle } : {}, parts.suffix ? { suffix: parts.suffix.split(" ")[0] } : {});
}

// Capitals, accents, punctuation, spaces and Synthea's numbers at the end of
// a word don't count. Letters of any alphabet do. ü is ue or u, ö oe or o,
// ä ae or a, and ß is ss, so each way of writing it gives a key.
function nameKeys(text) {
  var plain = String(text || "").toLowerCase().normalize("NFC").replace(/\u00df/g, "ss");
  var written = plain.replace(/\u00e4/g, "ae").replace(/\u00f6/g, "oe").replace(/\u00fc/g, "ue");
  return [written, plain].map(squash).filter(function (key, i, all) { return key && all.indexOf(key) === i; });
}

function squash(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).map(function (word) {
    return word.replace(/[^\p{L}\p{M}\d]/gu, "").replace(/\d+$/, "");
  }).join("");
}

function sameName(a, b) {
  var keys = nameKeys(b);
  return nameKeys(a).some(function (key) { return keys.indexOf(key) !== -1; });
}

// "V" or "V." stands for any word that starts with V.
function initialOf(word, other) {
  if (!/^\p{L}\.?$/u.test(word)) return false;
  var letter = nameKeys(word)[0];
  return Boolean(letter) && nameKeys(other).some(function (key) { return key.charAt(0) === letter; });
}

// Given words in order. A middle name left off or cut to its initial never
// keeps two records apart, but two different ones do: twins can share the
// first name ("Mary Ann" and "Mary Beth").
function sameGiven(a, b) {
  if (!a.length || !b.length || !sameName(a[0], b[0])) return false;
  for (var i = 1; i < Math.min(a.length, b.length); i += 1) {
    if (!sameName(a[i], b[i]) && !initialOf(a[i], b[i]) && !initialOf(b[i], a[i])) return false;
  }
  return true;
}

// Two people the same: the same family name in full, the same given names
// as far as both go (sameGiven) and the same birth date. Jr. against Sr., or
// II against III, is two people; an ending on one side only is ignored.
export function samePerson(a, b) {
  if (!a || !b) return false;
  var one = partsOf(a);
  var other = partsOf(b);
  if (one.suffix && other.suffix && one.suffix !== other.suffix) return false;
  var date = birthDateOf(a.birthDate);
  return Boolean(date) && date === birthDateOf(b.birthDate) && sameName(one.family, other.family) && sameGiven(one.given, other.given);
}

// What samePerson compares, from personOf's answer or one written by hand.
function partsOf(person) {
  var family = withoutSuffix(person.family);
  var given = withoutSuffix(person.given);
  return { family: family.rest, given: nameWords(given.rest).concat(nameWords(person.middle)), suffix: person.suffix || family.suffix.split(" ")[0] || given.suffix.split(" ")[0] || "" };
}

function ingredientKey(ingredientOf, rxcui) {
  var found = rxcui && ingredientOf && ingredientOf.get(rxcui);
  return found ? found.rxcui : null;
}

// The salt the ingredient lookup found (metoprolol succinate), else the
// ingredient itself. Null when it wasn't looked up.
function saltKey(ingredientOf, rxcui) {
  var found = rxcui && ingredientOf && ingredientOf.get(rxcui);
  return found ? (found.salt ? found.salt.rxcui : found.rxcui) : null;
}

// Its first word, with FAERS's trailing dots ("METOPROLOL.") left off.
function firstWordOf(name) {
  return firstWord(String(name || "").replace(/\.+(?=\s|$)/g, " "));
}

// How two records match, strongest first, or null:
// rxcui, name (same words), ingredients (same ingredient, salt and form),
// form (same ingredient, other form or salt), combo (shared ingredient in a
// combination), name-only (first words agree, nothing coded to confirm).
// A record coded only by ingredient (Cerner's "lisinopril") fits every
// strength and salt, so it's name-only at most. A form the name doesn't
// say is never the same form.
export function matchOf(a, b, ingredientOf) {
  var word = firstWordOf(a.name);
  var nameOnly = word !== "" && word === firstWordOf(b.name) ? "name-only" : null;
  if (a.ingredientOnly || b.ingredientOnly) return nameOnly;
  if (a.rxcui && a.rxcui === b.rxcui) {
    // A strength-only code (SCDC) is SR and XL alike: the names' forms decide.
    if (!a.partCode && !b.partCode) return "rxcui";
    var named = formOf(a.name);
    return named !== null && named === formOf(b.name) ? "rxcui" : "form";
  }
  var plain = plainName(a.name);
  if (plain && plain === plainName(b.name)) return "name";
  var keyA = ingredientKey(ingredientOf, a.rxcui);
  var keyB = ingredientKey(ingredientOf, b.rxcui);
  if (keyA && keyB) {
    if (keyA === keyB) {
      var form = formOf(a.name);
      var sameSalt = saltKey(ingredientOf, a.rxcui) === saltKey(ingredientOf, b.rxcui);
      return form !== null && form === formOf(b.name) && sameSalt ? "ingredients" : "form";
    }
    var inB = keyB.split("+");
    var shared = keyA.split("+").some(function (id) { return inB.indexOf(id) !== -1; });
    if (shared) return "combo";
    return null;
  }
  return nameOnly;
}

// Verdicts, in the order a card asks about them.
var VERDICTS = ["status", "dose", "schedule", "worded"];
var DAYS = { s: 1 / 86400, min: 1 / 1440, h: 1 / 24, d: 1, wk: 7, mo: 30, a: 365 };
var DAILY_UNITS = ["h", "d", "wk", "mo", "a"];
// Weekly or longer, in words, as FAERS and records write it: "15MG/WEEK",
// "QWK", "PER WEEK", "every Monday", "1/MO", "on Monday of each week".
var WEEKLY = /\b(weekly|wkly|biweekly|monthly|bimonthly|once a (?:week|month)|every (?:other )?(?:week|month)|every \d+ (?:weeks?|months?)|(?:per|each|q) ?(?:week|wk|month)|times? a (?:week|month)|qw|qwk|qmo|every (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?)\b|\/\s*(?:week|wk|mo|month)\b/i;
// "every 7 days", "Q7D", "every 28 days": a week or more.
var EVERY_DAYS = /\b(?:every (\d+) days?|q(\d+) ?d(?:ays?)?)\b/gi;
// Masses are compared in mg, so 0.025 MG and 25 MCG are one strength.
var MASS = { g: 1000, gram: 1000, grams: 1000, mg: 1, milligram: 1, milligrams: 1, mcg: 0.001, ug: 0.001, "\u00b5g": 0.001, "\u03bcg": 0.001, microgram: 0.001, micrograms: 0.001 };

// A unit is free text, so "constructor" must not find Object.prototype's.
function massOf(unit) {
  return Object.prototype.hasOwnProperty.call(MASS, unit) ? MASS[unit] : 0;
}

function dosageOf(item) {
  return (item.fhir && item.fhir.dosage) || null;
}

function repeatOf(item) {
  var dosage = dosageOf(item);
  return (dosage && dosage.repeat) || null;
}

// Every strength in the name as { value, unit, top }: "10 MG" is
// { 10, "mg", "mg" }, "25 MCG" is { 0.025, "mg", "mg" }, "2 MG/ML" is
// { 2, "mg/ml", "mg" }.
function strengthParts(name) {
  return strengthsOf(name).map(function (strength) {
    var found = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(strength);
    var unit = found[2].replace(/\s+/g, "").toLowerCase().split("/");
    var scale = massOf(unit[0]) || 1;
    var top = massOf(unit[0]) ? "mg" : unit[0];
    return { value: parseFloat(found[1]) * scale, unit: [top].concat(unit.slice(1)).join("/"), top: top };
  });
}

function sameAmounts(a, b) {
  return a.length === b.length && a.every(function (amount, index) {
    return amount.unit === b[index].unit && near(amount.value, b[index].value);
  });
}

function strengthsDiffer(a, b) {
  var first = strengthParts(a.name);
  var second = strengthParts(b.name);
  return first.length > 0 && second.length > 0 && !sameAmounts(first, second);
}

function near(a, b) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function unitOf(quantity) {
  return String(quantity.unit || quantity.code || "").toLowerCase();
}

// One dose, per strength: 2 tablets of 10 MG is 20 mg. A dose already
// written in the strength's unit ("10 mg" of a 10 MG tablet) is the amount
// itself, or it would count twice; for a combination it can't say which.
function doseAmounts(item) {
  var dosage = dosageOf(item);
  var strengths = strengthParts(item.name);
  if (!dosage || !dosage.quantity || !strengths.length) return null;
  var quantity = dosage.quantity;
  var unit = unitOf(quantity);
  var top = massOf(unit) ? "mg" : unit;
  if (strengths.some(function (strength) { return strength.top === top; })) {
    if (strengths.length > 1) return null;
    return [{ value: quantity.value * (massOf(unit) || 1), unit: top }];
  }
  return strengths.map(function (strength) {
    return { value: strength.value * quantity.value, unit: strength.top };
  });
}

function dailyAmounts(item) {
  var repeat = repeatOf(item);
  var amounts = doseAmounts(item);
  if (!amounts || !repeat || DAILY_UNITS.indexOf(repeat.periodUnit) === -1) return null;
  return amounts.map(function (amount) {
    return { value: amount.value * repeat.frequency / (repeat.period * DAYS[repeat.periodUnit]), unit: amount.unit };
  });
}

// How much a day, from codes only: 2 x 10 mg a day and 1 x 20 mg a day are
// both 20. Masses are in mg. Null when the record doesn't code all of it,
// or for a combination, which has one amount per ingredient.
export function dailyAmount(item) {
  var amounts = dailyAmounts(item);
  return amounts && amounts.length === 1 ? amounts[0].value : null;
}

// Weekly or longer, in its codes or its words. Methotrexate weekly taken
// daily is the mistake this is for.
export function isWeekly(item) {
  var repeat = repeatOf(item);
  var coded = Boolean(repeat) && (["wk", "mo", "a"].indexOf(repeat.periodUnit) !== -1 || (repeat.periodUnit === "d" && repeat.period >= 7));
  var words = String(item.frequency || "");
  return coded || WEEKLY.test(words) || Array.from(words.matchAll(EVERY_DAYS)).some(function (found) {
    return Number(found[1] || found[2]) >= 7;
  });
}

function dosesDiffer(a, b) {
  if (strengthsDiffer(a, b)) {
    // Words can't say it's the same amount: which bottle they have is the
    // patient's to say.
    var first = dailyAmounts(a);
    var second = dailyAmounts(b);
    return !(first && second && sameAmounts(first, second));
  }
  var qa = dosageOf(a) && dosageOf(a).quantity;
  var qb = dosageOf(b) && dosageOf(b).quantity;
  if (!qa || !qb) return false;
  var amountA = doseAmounts(a);
  var amountB = doseAmounts(b);
  if (amountA && amountB) return !sameAmounts(amountA, amountB);
  return qa.value !== qb.value || unitOf(qa) !== unitOf(qb);
}

function sameWhen(a, b) {
  return a.slice().sort().join(" ") === b.slice().sort().join(" ");
}

// Both schedules coded in a way that can be compared: both with a rate, or
// both with times of day. Twice a day beside "in the morning" can't be.
function bothCoded(a, b) {
  var ra = repeatOf(a);
  var rb = repeatOf(b);
  return Boolean(ra && rb) && (Boolean(ra.periodUnit && rb.periodUnit) || Boolean(ra.when && rb.when));
}

function schedulesDiffer(a, b) {
  var ra = repeatOf(a);
  var rb = repeatOf(b);
  if (ra && rb) {
    // Twice a day and every 12 hours are one schedule.
    if (ra.periodUnit && rb.periodUnit && !near(ra.frequency / (ra.period * DAYS[ra.periodUnit]), rb.frequency / (rb.period * DAYS[rb.periodUnit]))) return true;
    if (ra.when && rb.when && !sameWhen(ra.when, rb.when)) return true;
  }
  return isWeekly(a) !== isWeekly(b);
}

function wordedDiffers(a, b) {
  return !strengthsDiffer(a, b) && !bothCoded(a, b) && words(a.frequency) !== words(b.frequency);
}

// A date as far as it goes: "2026", "2026-05" or "2026-05-01". Null when it
// isn't one.
function day(date) {
  var found = date && /^\d{4}(?:-\d{2}(?:-\d{2})?)?/.exec(String(date));
  return found ? found[0] : null;
}

// Clearly before: "2025" is before 2026-05-01, but "2026" might not be.
function before(a, b) {
  if (a.length !== b.length && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return false;
  return a < b;
}

// A stop is history when it's dated before the current record. Without
// both dates the order can't be known, and a missed stop is worse than one
// more question. lastUpdated is the server's, so it only ever asks more.
function stopCounts(current, stopped) {
  var dates = [stopped.updated, stopped.stoppedOn, stopped.asserted, stopped.start].map(day).filter(Boolean);
  var started = day(current.start);
  return !dates.length || !started || dates.some(function (date) { return !before(date, started); });
}

// A snapshot only says what it said then, so against a list that refreshes
// it can't make a status verdict while it's clearly the older word, either
// way round. Undated or tied, it asks.
function snapshotAllowsStop(current, stopped) {
  if (Boolean(current.fromSnapshot) === Boolean(stopped.fromSnapshot)) return true;
  var snapshot = current.fromSnapshot ? current : stopped;
  var other = current.fromSnapshot ? stopped : current;
  var when = day(asOfItem(snapshot));
  var against = day(asOfItem(other));
  return !(when && against && before(when, against));
}

// What the sources disagree on. sides are items, one per source, in one group.
export function verdictsFor(sides) {
  var found = {};
  sides.forEach(function (a, i) {
    sides.forEach(function (b, j) {
      var statusA = statusWord(a);
      var statusB = statusWord(b);
      if (statusA === "current" && statusB === "not-current" && stopCounts(a, b) && snapshotAllowsStop(a, b)) found.status = true;
      if (j <= i || statusA !== "current" || statusB !== "current") return;
      if (dosesDiffer(a, b)) found.dose = true;
      // Weekly against daily is how often, never just worded differently.
      if (schedulesDiffer(a, b)) found.schedule = true;
      else if (wordedDiffers(a, b)) found.worded = true;
    });
  });
  return VERDICTS.filter(function (verdict) { return found[verdict]; });
}

// The record's own date: a request's authoredOn; a statement's end if it
// stopped, else its dateAsserted, else its start. Never the day it arrived.
// A stop is news from when it happened, not from when the medicine began.
function asOfItem(item) {
  if (item.kind === "statement" && item.status !== "current" && item.stoppedOn) return item.stoppedOn;
  return (item.kind === "statement" && item.asserted) || item.start || null;
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

// Newest first, then first source first. An undated record counts as oldest.
function newest(entries) {
  return entries.slice().sort(function (a, b) {
    var dateA = asOfItem(a.item) || "";
    var dateB = asOfItem(b.item) || "";
    return dateA === dateB ? a.index - b.index : dateA < dateB ? 1 : -1;
  })[0];
}

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Jan 2025" from a date, read as written so the time zone can't move it.
function monthYear(date) {
  var found = /^(\d{4})-(\d{2})/.exec(String(date || ""));
  return found && MONTHS[Number(found[2]) - 1] ? MONTHS[Number(found[2]) - 1] + " " + found[1] : "an unknown date";
}

function sideOf(entry) {
  var item = entry.item;
  return {
    sourceId: entry.source.id,
    sourceName: entry.source.name,
    kind: entry.source.kind,
    asOf: asOfItem(item),
    name: item.name,
    dose: item.dose,
    route: item.route,
    frequency: item.frequency,
    status: statusWord(item),
    recordStatus: item.recordStatus,
    key: item.key
  };
}

// A snapshot's current statement that a refreshing record has since
// passed isn't a disagreement, but it says how old it is.
function withAsOfNotes(sides) {
  var refreshed = sides.filter(function (side) { return side.kind !== "snapshot" && day(side.asOf); });
  sides.forEach(function (side) {
    var when = day(side.asOf);
    if (side.kind !== "snapshot" || side.status !== "current" || !when) return;
    if (refreshed.some(function (other) { return before(when, day(other.asOf)); })) {
      side.asOfNote = "As of " + monthYear(when) + ", " + side.sourceName + " listed this";
    }
  });
  return sides;
}

// Oldest first; an undated side goes last.
function bySides(a, b) {
  if (a.asOf !== b.asOf) {
    if (!a.asOf) return 1;
    if (!b.asOf) return -1;
    return a.asOf < b.asOf ? -1 : 1;
  }
  return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
}

// What the question is about, so an answer can tell when the records
// changed. A copy of the same record (new id, new date) isn't a change.
function fingerprintOf(entries) {
  return JSON.stringify(entries.map(function (entry) {
    var side = sideOf(entry);
    return { sourceId: side.sourceId, strength: strengthsOf(entry.item.name), dose: side.dose || null, frequency: side.frequency || null, status: side.status };
  }).sort(function (a, b) { return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0; }));
}

// One side in words, the same everywhere it's shown: its dose and how
// often. The strength goes first when the dose doesn't say it, so a 10 MG
// and a 20 MG side never read the same, even with nothing else to say.
export function sideWords(side) {
  var dose = side.dose || "";
  var often = side.frequency || "";
  var strength = strengthOf(side.name);
  if (!dose && !often) return strength || "See the record";
  var squeeze = function (text) { return text.replace(/\s+/g, "").toLowerCase(); };
  var says = strength && squeeze(dose).indexOf(squeeze(strength)) !== -1;
  return [says ? null : strength, dose, often].filter(Boolean).join(", ");
}

// Whether a side is the card's own record: the same key from the same
// source, never the key alone, since two sources with the same code share
// one. A card saved before it carried its source id goes by the key when
// only one side has it, else by the source's name.
export function isOwnSide(entry, side) {
  if (!side || side.key !== entry.key) return false;
  if (entry.sourceId) return side.sourceId === entry.sourceId;
  var same = ((entry.group && entry.group.sides) || []).filter(function (one) { return one.key === entry.key; });
  return same.length < 2 || side.sourceName === entry.source;
}

// A source that sent only some records can't vouch for what it left out.
function heldBackNotes(group) {
  var said = [];
  group.forEach(function (entry) {
    var line = entry.source.name + " didn't send some records";
    if (entry.source.split.heldBack && said.indexOf(line) === -1) said.push(line);
  });
  return said;
}

// "no-match", not "someone else": a typo in a birth date or a name read
// wrong keeps out the patient's own records too.
function keptOutWhy(first, person) {
  if (!first || !person) return "no-identity";
  return samePerson(first, person) ? null : "no-match";
}

// Every source's list, joined into one. sources is [{ id, name, kind,
// refreshes, patient, split }], the first one the list belongs to. A
// source whose name and birth date don't match, or one that doesn't say who,
// stays out. Records from different sources that match (GROUPS) become one
// card with a `group`; one source never joins with itself.
export function reconcile(sources, ingredientOf) {
  var first = sources[0];
  var firstPerson = personOf(first.patient);
  var keptOut = [];
  var sourceStatus = sources.map(function (source) {
    return { id: source.id, name: source.name, loaded: !source.split.failed, complete: !source.split.heldBack };
  });
  // A source that didn't load says nothing either way.
  var included = sources.filter(function (source, index) {
    if (index === 0) return true;
    if (source.split.failed) return false;
    var why = keptOutWhy(firstPerson, personOf(source.patient));
    if (why) keptOut.push({ id: source.id, name: source.name, why: why });
    return !why;
  });

  var entries = [];
  included.forEach(function (source, order) {
    source.split.current.concat(source.split.older).forEach(function (item) {
      entries.push({ item: item, source: source, order: order, index: entries.length });
    });
  });

  // Every pair from different sources, and how they match. A hospital order
  // is for the stay, so it never joins.
  var pairs = [];
  entries.forEach(function (a) {
    entries.forEach(function (b) {
      if (b.index <= a.index || a.order === b.order || a.item.hospital || b.item.hospital) return;
      var match = matchOf(a.item, b.item, ingredientOf);
      if (match) pairs.push({ a: a, b: b, match: match });
    });
  });

  // Strongest matches join first. Two records from one source never share
  // a group, so two current strengths in one record stay two cards.
  var members = entries.map(function (entry) { return [entry]; });
  var owner = entries.map(function (entry) { return entry.index; });
  GROUPS.forEach(function (level) {
    pairs.forEach(function (pair) {
      if (pair.match !== level) return;
      var keep = owner[pair.a.index];
      var gone = owner[pair.b.index];
      if (keep === gone) return;
      var clash = members[keep].some(function (x) {
        return members[gone].some(function (y) { return x.order === y.order; });
      });
      if (clash) return;
      members[gone].forEach(function (entry) { owner[entry.index] = keep; });
      members[keep] = members[keep].concat(members[gone]);
      members[gone] = null;
    });
  });

  // What stays apart but may be the same medicine is said on both, for staff.
  var notes = entries.map(function () { return []; });
  pairs.forEach(function (pair) {
    var one = owner[pair.a.index];
    var other = owner[pair.b.index];
    if (one === other) return;
    var line = pair.match === "name-only" ? "May be the same medicine as " : "Possible duplicate of ";
    if (notes[one].indexOf(line + pair.b.item.name) === -1) notes[one].push(line + pair.b.item.name);
    if (notes[other].indexOf(line + pair.a.item.name) === -1) notes[other].push(line + pair.a.item.name);
  });

  // So no agreement is vouched for by a source that wasn't there.
  var missing = sourceStatus.filter(function (status) { return !status.loaded; }).map(function (status) {
    return status.name + " didn't load";
  });

  var built = [];
  members.forEach(function (group, at) {
    if (!group) return;
    if (group.length === 1 && !notes[at].length) {
      built.push({ card: group[0].item });
      return;
    }
    var inOrder = group.slice().sort(function (a, b) { return a.index - b.index; });
    var current = inOrder.filter(function (entry) { return entry.item.status === "current"; });
    var shown = newest(current.length ? current : inOrder);
    var ingredients = inOrder.map(function (entry) { return ingredientKey(ingredientOf, entry.item.rxcui); }).filter(Boolean).sort();
    var keys = inOrder.map(function (entry) { return entry.item.key; }).sort();
    built.push({
      ingredient: ingredients[0] || null,
      lowestKey: keys[0],
      // Which source the card's own record is from: two sources with the
      // same code share a key.
      card: Object.assign({}, shown.item, {
        sourceId: shown.source.id,
        group: {
          id: null,
          sources: inOrder.map(function (entry) { return entry.source.name; }),
          verdicts: inOrder.length > 1 ? verdictsFor(inOrder.map(function (entry) {
            // verdictsFor can't see the source, so a copy says if it's a snapshot's.
            return entry.source.kind === "snapshot" ? Object.assign({}, entry.item, { fromSnapshot: true }) : entry.item;
          })) : [],
          sides: withAsOfNotes(inOrder.map(sideOf).sort(bySides)),
          fingerprint: fingerprintOf(inOrder),
          notes: missing.concat(heldBackNotes(inOrder), notes[at])
        }
      })
    });
  });

  // The ingredient names the group, unless two groups share it.
  var counts = {};
  built.forEach(function (entry) {
    if (entry.ingredient) counts[entry.ingredient] = (counts[entry.ingredient] || 0) + 1;
  });
  built.forEach(function (entry) {
    if (entry.card.group) entry.card.group.id = entry.ingredient && counts[entry.ingredient] === 1 ? entry.ingredient : entry.lowestKey;
  });

  var all = built.map(function (entry) { return entry.card; });
  return Object.assign({}, first.split, {
    current: all.filter(function (card) { return card.status === "current"; }).sort(byName),
    older: all.filter(function (card) { return card.status !== "current"; }).sort(byName),
    failed: Boolean(first.split.failed),
    heldBack: included.some(function (source) { return Boolean(source.split.heldBack); }),
    placeholders: included.reduce(function (sum, source) { return sum + (source.split.placeholders || 0); }, 0),
    // A source that says it has no medicines, or knows of none, is said by
    // name. One kept out says nothing about this patient.
    noMedicines: included.reduce(function (all, source) { return all.concat(source.split.noMedicines || []); }, []),
    keptOut: keptOut,
    sourceStatus: sourceStatus
  });
}
