// Browse all patients (design 2026-11-28): sorting, searching and wording the
// saved list of sandbox patients (js/sandbox-patients.js), and picking out
// the patients other people added, for the live view. No DOM here.

import { bornText } from "./card.js";

export var SORTS = [
  { id: "different", label: "Most different medicines" },
  { id: "prescriptions", label: "Most prescriptions" },
  { id: "current", label: "Most current medicines" },
  { id: "fills", label: "Most insurance fills" },
  { id: "allergies", label: "Most allergies" },
  { id: "name", label: "Name A to Z" },
  { id: "oldest", label: "Oldest first" },
  { id: "youngest", label: "Youngest first" },
  { id: "added", label: "Added by other people" }
];
export var DEFAULT_SORT = "different";
export var PAGE = 20;

// The number each count sort shows, as one thing and as many.
var COUNTED = {
  different: ["different medicine", "different medicines"],
  prescriptions: ["prescription", "prescriptions"],
  current: ["current medicine", "current medicines"],
  fills: ["insurance fill", "insurance fills"],
  allergies: ["allergy", "allergies"]
};

// Lower case with accents taken off, so "MELENDEZ" finds "Meléndez".
function folded(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// By name, then id: the same order every time, so Show more never repeats or
// skips anyone. A patient with no name goes last.
function byName(a, b) {
  if (!a.name !== !b.name) return a.name ? -1 : 1;
  var an = folded(a.name);
  var bn = folded(b.name);
  if (an !== bn) return an < bn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// The family name is the name's last word, as the saved list keeps one line.
function byFamily(a, b) {
  if (!a.name !== !b.name) return a.name ? -1 : 1;
  var af = folded(a.name).split(" ").pop();
  var bf = folded(b.name).split(" ").pop();
  if (af !== bf) return af < bf ? -1 : 1;
  return byName(a, b);
}

// Oldest or youngest first; no birth date last either way.
function byBorn(oldestFirst) {
  return function (a, b) {
    if (!a.born !== !b.born) return a.born ? -1 : 1;
    if (a.born && a.born !== b.born) return (a.born < b.born) === oldestFirst ? -1 : 1;
    return byName(a, b);
  };
}

export function sortPatients(patients, sortId) {
  var compare;
  if (COUNTED[sortId]) {
    compare = function (a, b) { return (b[sortId] || 0) - (a[sortId] || 0) || byName(a, b); };
  } else if (sortId === "name") {
    compare = byFamily;
  } else if (sortId === "oldest" || sortId === "youngest") {
    compare = byBorn(sortId === "oldest");
  } else {
    return patients.slice();
  }
  return patients.slice().sort(compare);
}

export function matchesName(patient, query) {
  var wanted = folded(query);
  if (!wanted) return true;
  return Boolean(patient.name) && folded(patient.name).indexOf(wanted) !== -1;
}

export function findPatients(patients, query, sortId) {
  return sortPatients(patients.filter(function (patient) { return matchesName(patient, query); }), sortId);
}

export function rowLines(patient, sortId) {
  var born = patient.born ? bornText(patient.born) + "." : "No birth date.";
  var words = COUNTED[sortId];
  var count = words ? " " + patient[sortId] + " " + (patient[sortId] === 1 ? words[0] : words[1]) + "." : "";
  return { name: patient.name || "No name in the record", detail: born + count };
}

// The sandbox's own patients have long ids (8-4-4-4-12 hex). Patients added
// through its API get other ids (numbers, or Brown Bag's own "brownbag-…"),
// and the sandbox deletes them every night.
var OWN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;

export function isAddedId(id) {
  return typeof id === "string" && FHIR_ID.test(id) && !OWN_ID.test(id);
}

// "Given Family" from the official name, else the first; null when none says
// anything.
export function nameOf(patient) {
  var names = patient && Array.isArray(patient.name) ? patient.name : [];
  var name = names.filter(function (one) { return one && one.use === "official"; })[0] || names[0];
  if (!name) return null;
  var text = String(name.text || "").trim();
  if (text) return text;
  var parts = (Array.isArray(name.given) ? name.given : []).concat(name.family || []);
  var joined = parts.map(function (part) { return String(part || "").trim(); }).filter(Boolean).join(" ");
  return joined || null;
}

// The live view's search answer, keeping only patients other people added.
export function addedFromBundle(bundle) {
  var entries = bundle && Array.isArray(bundle.entry) ? bundle.entry : [];
  return entries.map(function (entry) { return entry && entry.resource; }).filter(function (resource) {
    return resource && resource.resourceType === "Patient" && isAddedId(resource.id);
  }).map(function (patient) {
    return { id: patient.id, name: nameOf(patient), born: typeof patient.birthDate === "string" && patient.birthDate ? patient.birthDate : null };
  });
}
