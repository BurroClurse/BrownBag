// Reconciling medicine lists from more than one source: is the other source
// the same person, do two records name the same medicine, and where do the
// sources agree. Worked out fresh from the records every time, never stored
// as buckets. No DOM here, so Node's test runner can check it.

import { formOf, strengthsOf, statusWord } from "./meds.js";
import { firstWord, words } from "./add-check.js";

// Only these matches put two records in one group.
export var GROUPS = ["rxcui", "name", "ingredients"];

// "Sertraline 50 MG Oral Tablet [Zoloft]" and "sertraline 50 mg oral tablet"
// are the same drug, strength and form. Different strengths stay different.
export function plainName(name) {
  return String(name || "").toLowerCase().replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

// Only a whole date: "1950" or "1950-02" could be many people.
var FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A FHIR Patient as { family, given, birthDate }, or null when the name or
// a whole birth date is missing. A name written only as text uses its first
// and last words.
export function personOf(patient) {
  var name = patient && patient.name && patient.name[0];
  if (!name || !FULL_DATE.test(String(patient.birthDate || ""))) return null;
  var family = name.family ? String(name.family).trim() : "";
  var given = name.given && name.given[0] ? String(name.given[0]).trim() : "";
  if (!family || !given) {
    var words = String(name.text || "").trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    family = words[words.length - 1];
    given = words[0];
  }
  return { family: family, given: given, birthDate: String(patient.birthDate) };
}

// Capitals, accents, punctuation and spaces don't count, nor an ending
// (Jr., III) after the rest of the name. Elsewhere those letters are part of it.
function nameKey(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/(?:[\s,]+(?:jr|sr|ii|iii|iv)\.?)+$/, "").replace(/[^a-z0-9]/g, "");
}

export function samePerson(a, b) {
  if (!a || !b) return false;
  var family = nameKey(a.family);
  var given = nameKey(a.given);
  return family !== "" && given !== "" && family === nameKey(b.family) && given === nameKey(b.given) &&
    FULL_DATE.test(a.birthDate || "") && a.birthDate === b.birthDate;
}

function ingredientKey(ingredientOf, rxcui) {
  var found = rxcui && ingredientOf && ingredientOf.get(rxcui);
  return found ? found.rxcui : null;
}

// How two records match, strongest first, or null:
// rxcui, name (same words), ingredients (same ingredient and form),
// form (same ingredient, other form), combo (shared ingredient in a
// combination), name-only (first words agree, nothing coded to confirm).
export function matchOf(a, b, ingredientOf) {
  if (a.rxcui && a.rxcui === b.rxcui) return "rxcui";
  var plain = plainName(a.name);
  if (plain && plain === plainName(b.name)) return "name";
  var keyA = ingredientKey(ingredientOf, a.rxcui);
  var keyB = ingredientKey(ingredientOf, b.rxcui);
  if (keyA && keyB) {
    if (keyA === keyB) return formOf(a.name) === formOf(b.name) ? "ingredients" : "form";
    var inB = keyB.split("+");
    var shared = keyA.split("+").some(function (id) { return inB.indexOf(id) !== -1; });
    if (shared) return "combo";
    return null;
  }
  var word = firstWord(a.name);
  return word !== "" && word === firstWord(b.name) ? "name-only" : null;
}

// Verdicts, in the order a card asks about them.
var VERDICTS = ["status", "dose", "schedule", "worded"];
var DAYS = { s: 1 / 86400, min: 1 / 1440, h: 1 / 24, d: 1, wk: 7, mo: 30, a: 365 };
var DAILY_UNITS = ["h", "d", "wk", "mo", "a"];
// Weekly or longer, in words.
var WEEKLY = /\b(weekly|biweekly|monthly|bimonthly|once a (?:week|month)|every (?:other )?(?:week|month)|every \d+ (?:weeks?|months?))\b/i;
// Masses are compared in mg, so 0.025 MG and 25 MCG are one strength.
var MASS = { g: 1000, mg: 1, mcg: 0.001 };

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
  return coded || WEEKLY.test(item.frequency || "");
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
// it can't call the record stopped, or current again, on date alone. Its
// stop counts only when it's the newer word; its "current" never does.
function snapshotAllowsStop(current, stopped) {
  if (Boolean(current.fromSnapshot) === Boolean(stopped.fromSnapshot)) return true;
  if (current.fromSnapshot) return false;
  var when = day(asOfItem(stopped));
  var against = day(asOfItem(current));
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

// The record's own date: a request's authoredOn, a statement's dateAsserted
// or else its start. Never the day it arrived.
function asOfItem(item) {
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

// A source that sent only some records can't vouch for what it left out.
function heldBackNotes(group) {
  var said = [];
  group.forEach(function (entry) {
    var line = entry.source.name + " didn't send some records";
    if (entry.source.split.heldBack && said.indexOf(line) === -1) said.push(line);
  });
  return said;
}

function keptOutWhy(first, person) {
  if (!first || !person) return "no-identity";
  return samePerson(first, person) ? null : "someone-else";
}

// Every source's list, joined into one. sources is [{ id, name, kind,
// refreshes, patient, split }], the first one the list belongs to. A
// source for someone else, or one that doesn't say who, stays out. Records
// from different sources that match (GROUPS) become one card with a
// `group`; one source never joins with itself.
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
      card: Object.assign({}, shown.item, {
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
    keptOut: keptOut,
    sourceStatus: sourceStatus
  });
}
