// Reconciling medicine lists from more than one source: is the other source
// the same person, and do two records name the same medicine. No DOM here,
// so Node's test runner can check it.

import { formOf } from "./meds.js";
import { firstWord } from "./add-check.js";

// Only these matches put two records in one group.
export var GROUPS = ["rxcui", "name", "ingredients"];

// "Sertraline 50 MG Oral Tablet [Zoloft]" and "sertraline 50 mg oral tablet"
// are the same drug, strength and form. Different strengths stay different.
export function plainName(name) {
  return String(name || "").toLowerCase().replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

// A FHIR Patient as { family, given, birthDate }, or null when the name or
// birth date is missing. A name written only as text uses its first and
// last words.
export function personOf(patient) {
  var name = patient && patient.name && patient.name[0];
  if (!name || !patient.birthDate) return null;
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

// Capitals, accents, punctuation, spaces and endings (Jr., III) don't count.
function nameKey(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(?:jr|sr|ii|iii|iv)\b/g, " ").replace(/[^a-z0-9]/g, "");
}

export function samePerson(a, b) {
  if (!a || !b) return false;
  var family = nameKey(a.family);
  var given = nameKey(a.given);
  return family !== "" && given !== "" && family === nameKey(b.family) && given === nameKey(b.given) &&
    !!a.birthDate && a.birthDate === b.birthDate;
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
