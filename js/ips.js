// The file staff save for a hospital system: an International Patient Summary
// (IPS 2.0.1, a FHIR R4 document), built from an opened QR code. Anyone can make
// a valid link, so every part is read, checked and written again; nothing is
// copied whole, and anything unexpected means no file. No DOM here.

import { AS_NEEDED_NOTE, DISAGREE_TITLE, disagreeRows, allergyDateLine, allergyEmptyText, allergyNotices, allergyParts, dateLines, emptyPartText, fillsNote, groupShareBundle, medicineNotices, medicinesTitle, recordsPartial, savedCopyText, staffSaysNone, timeText } from "./share.js";
import { localDate } from "./view.js";
import { isUnspecified, noneCode, statementOf } from "./allergies.js";

var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
var NDC = "http://hl7.org/fhir/sid/ndc";
var SNOMED = "http://snomed.info/sct";
var LOINC = "http://loinc.org";
var ABSENT_CODES = "http://terminology.hl7.org/CodeSystem/data-absent-reason";
var ABSENT = { extension: [{ url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason", valueCode: "unknown" }] };
var NOTE = "http://hl7.org/fhir/StructureDefinition/note";
var PROFILE = "http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips";
var UNAVAILABLE = { coding: [{ system: "http://terminology.hl7.org/CodeSystem/list-empty-reason", code: "unavailable", display: "Unavailable" }] };

var MED_STATUS = ["active", "completed", "intended", "stopped", "on-hold", "unknown", "not-taken"];
var CLINICAL = ["active", "inactive", "resolved", "recurrence", "relapse"];
var VERIFIED = ["unconfirmed", "confirmed"];
var WHEN = ["MORN", "AFT", "EVE", "NIGHT", "HS", "WAKE", "PHS", "C", "CM", "CD", "CV", "AC", "ACM", "ACD", "ACV", "PC", "PCM", "PCD", "PCV"];
var SELF = "resource:0";
var NOT_ALLOWED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;
var MAX_TEXT = 20000;
var MAX_ENTRIES = 1000;

// Null when it can be saved, else "incomplete" (something didn't load) or "odd"
// (not a list Brown Bag makes).
export function whyNotSaved(bundle) {
  var read;
  try {
    read = readBundle(bundle);
  } catch (error) {
    return "odd";
  }
  var groups = read.groups;
  var allergies = groups.allergies;
  if (groups.incomplete || groups.ownMissing || !allergies || (allergies.status !== "loaded" && !allergies.savedAt)) return "incomplete";
  return null;
}

export function summaryFileName(bundle) {
  return "patient-summary-" + localDate(new Date(bundle.timestamp)) + ".json";
}

// options: now (when the file is made) and uuid (makes one id).
export function patientSummary(bundle, options) {
  var why = whyNotSaved(bundle);
  if (why) throw new Error("Not saved: " + why);
  var read = readBundle(bundle);
  var groups = read.groups;
  var url = function () { return "urn:uuid:" + options.uuid(); };
  var patient = { reference: url() };
  var device = { reference: url() };
  var entries = [];
  var add = function (resource) {
    var entry = { fullUrl: url(), resource: resource };
    entries.push(entry);
    return { reference: entry.fullUrl };
  };

  var medicines = read.medicines.map(function (m) { return add(medicineFor(m, patient)); });
  for (var i = 0; i < groups.unnamed; i += 1) medicines.push(add(unnamedMedicine(patient)));
  var held = noneIsInDoubt(groups.allergies);
  var allergies = read.allergies.filter(function (a) { return !(held && a.none); }).map(function (a) { return add(allergyFor(a, patient)); });

  var caution = [groups.recordsSavedAt ? ["saved copy", savedCopyText(groups)] : null, groups.claimsNotLoaded ? ["insurance fills not loaded", fillsNote(groups)] : null].filter(Boolean);
  var allergyCaution = groups.allergies.savedAt ? [["saved copy", allergyNotices(groups.allergies)[0]]] : [];
  var composition = {
    resourceType: "Composition",
    status: "preliminary",
    type: loinc("60591-5", "Patient summary Document"),
    subject: patient,
    date: bundle.timestamp,
    author: [patient, device],
    title: "Patient summary from Brown Bag",
    section: [
      section("Medicines", loinc("10160-0", "History of Medication use Narrative"), medicineWords(groups), medicines, caution),
      section("Allergies", loinc("48765-2", "Allergies and adverse reactions Document"), allergyWords(groups), allergies, allergyCaution),
      section("Problems", loinc("11450-4", "Problem list - Reported"), [["p", "Brown Bag doesn't read health problems."]], [], [])
    ]
  };
  return {
    resourceType: "Bundle",
    meta: { profile: [PROFILE] },
    identifier: { system: "urn:ietf:rfc:3986", value: url() },
    type: "document",
    timestamp: options.now.toISOString(),
    entry: [
      { fullUrl: url(), resource: composition },
      { fullUrl: patient.reference, resource: read.patient },
      { fullUrl: device.reference, resource: { resourceType: "Device", deviceName: [{ name: "Brown Bag", type: "user-friendly-name" }] } }
    ].concat(entries)
  };
}

// "No known allergies" must never stand in codes beside a reason to doubt it.
function noneIsInDoubt(allergies) {
  return Boolean(allergies.fromRecords.length || allergies.fromPatient.length || allergies.unspecified || allergies.savedAt || allergies.status !== "loaded");
}

function loinc(code, display) {
  return { coding: [{ system: LOINC, code: code, display: display }] };
}

// cautions: [short words for the title, the whole sentence]. A system that
// skips the readable text still has the title and the note.
function section(title, code, words, entries, cautions) {
  var out = {};
  if (cautions.length) {
    out.extension = [{ url: NOTE, valueAnnotation: { text: cautions.map(function (c) { return c[1]; }).join(" ") } }];
    title += " (" + cautions.map(function (c) { return c[0]; }).join(", ") + ")";
  }
  out.title = title;
  out.code = code;
  out.text = { status: "generated", div: '<div xmlns="http://www.w3.org/1999/xhtml">' + words.map(html).join("") + "</div>" };
  if (entries.length) out.entry = entries;
  else out.emptyReason = UNAVAILABLE;
  return out;
}

// The readable text: the same words as the staff page, warnings first.
function medicineWords(groups) {
  var words = warnings(medicineNotices(groups).concat(groups.recordsSavedAt ? savedCopyText(groups) : [], fillsNote(groups) || []));
  dateLines(groups, timeText).forEach(function (text) { words.push(["p", text]); });
  words.push(["p", medicinesTitle(groups)]);
  list(words, DISAGREE_TITLE, disagreeRows(groups));
  if (groups.fromRecords.length) list(words, "From records", groups.fromRecords);
  else if (emptyPartText(groups, "records")) words.push(["p", (recordsPartial(groups) ? "From records: " : "") + emptyPartText(groups, "records")]);
  list(words, "Filled, not in the health record", groups.fromClaims);
  list(words, "As needed", groups.asNeeded);
  list(words, "Added by patient", groups.addedByPatient);
  list(words, "Patient says not taking", groups.patientSaysStopped);
  return words;
}

function allergyWords(groups) {
  var allergies = groups.allergies;
  var words = warnings(allergyNotices(allergies));
  var dated = allergyDateLine(groups, timeText);
  if (dated) words.push(["p", dated]);
  if (staffSaysNone(allergies)) words.push(["p", "No known allergies. The patient says this."]);
  else if (allergyEmptyText(allergies)) words.push(["p", allergyEmptyText(allergies)]);
  allergies.statements.forEach(function (text) { words.push(["p", "Records say: " + text + "."]); });
  allergyParts(allergies).forEach(function (one) { list(words, one.title, one.rows); });
  return words;
}

function warnings(texts) {
  return texts.map(function (text) { return ["strong", text]; });
}

function list(words, title, rows) {
  if (!rows || !rows.length) return;
  words.push(["p", title]);
  words.push(["ul", rows.map(function (row) {
    if (!row.take) return [row.name].concat(row.lines).join(". ");
    var pairs = row.take.concat(row.facts).map(function (pair) { return pair[0] + ": " + String(pair[1]).trim(); });
    return [row.name].concat(row.flags, pairs).join(". ");
  })]);
}

function html(word) {
  if (word[0] === "ul") return "<ul>" + word[1].map(function (text) { return "<li>" + escaped(text) + "</li>"; }).join("") + "</ul>";
  return word[0] === "strong" ? "<p><strong>" + escaped(word[1]) + "</strong></p>" : "<p>" + escaped(word[1]) + "</p>";
}

var ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escaped(text) {
  return String(text).replace(NOT_ALLOWED, "").replace(/[&<>"']/g, function (c) { return ESCAPES[c]; });
}

function medicineFor(m, patient) {
  var out = { resourceType: "MedicationStatement", status: m.status, medicationCodeableConcept: m.concept, subject: patient, _effectiveDateTime: ABSENT };
  if (m.notedOn) out.dateAsserted = m.notedOn;
  if (m.source) out.informationSource = m.source === "patient" ? patient : { display: m.source };
  if (m.notes.length) out.note = m.notes;
  if (m.dosage) out.dosage = [m.dosage];
  return out;
}

function unnamedMedicine(patient) {
  return {
    resourceType: "MedicationStatement",
    status: "unknown",
    medicationCodeableConcept: { coding: [{ system: ABSENT_CODES, code: "unknown", display: "Unknown" }], text: "Medicine name not in the record" },
    subject: patient,
    _effectiveDateTime: ABSENT
  };
}

function allergyFor(a, patient) {
  var out = Object.assign({ resourceType: "AllergyIntolerance" }, a.resource, { patient: patient });
  if (a.byPatient) {
    out.recorder = patient;
    out.asserter = patient;
  }
  return out;
}

// Reads the bundle's known fields. Throws on anything it doesn't expect.
function readBundle(bundle) {
  need(bundle && bundle.resourceType === "Bundle" && bundle.type === "collection");
  need(typeof bundle.timestamp === "string" && isMoment(bundle.timestamp) && /Z$/.test(bundle.timestamp));
  need(Array.isArray(bundle.entry) && bundle.entry.length && bundle.entry.length <= MAX_ENTRIES);
  var resources = bundle.entry.map(function (entry) {
    need(entry && entry.resource && !entry.resource.modifierExtension);
    return entry.resource;
  });
  need(resources[0].resourceType === "Patient");
  var medicines = [];
  var allergies = [];
  resources.slice(1).forEach(function (resource) {
    if (resource.resourceType === "MedicationStatement") medicines.push(readMedicine(resource));
    else if (resource.resourceType === "AllergyIntolerance") allergies.push(readAllergy(resource));
    else need(false);
  });
  var patient = readPatient(resources[0]);
  var groups = groupShareBundle(bundle);
  need(groups.unnamed <= MAX_ENTRIES);
  var allergyDates = groups.allergies ? [groups.allergies.savedAt, groups.allergies.updatedAt] : [];
  [groups.recordsSavedAt, groups.recordsUpdatedAt].concat(allergyDates).forEach(function (date) { need(!date || !isNaN(Date.parse(date))); });
  return { patient: patient, medicines: medicines, allergies: allergies, groups: groups };
}

function readPatient(resource) {
  var name = resource.name === undefined ? null : clean(one(resource.name).text);
  var out = { resourceType: "Patient", name: [name && name !== "Name not recorded" ? { text: name } : { _text: ABSENT }] };
  var born = String(resource.birthDate || "").slice(0, 10);
  if (isMoment(born)) out.birthDate = born;
  else out._birthDate = ABSENT;
  return out;
}

function readMedicine(resource) {
  need(MED_STATUS.indexOf(resource.status) !== -1);
  var concept = resource.medicationCodeableConcept;
  need(concept);
  var source = null;
  if (resource.informationSource) {
    if (resource.informationSource.reference !== undefined) {
      need(resource.informationSource.reference === SELF);
      source = "patient";
    } else {
      source = clean(resource.informationSource.display);
    }
  }
  var notes = readNotes(resource.note);
  var out = {
    status: resource.status,
    concept: readConcept(concept, [RXNORM, NDC], "Unnamed medicine"),
    source: source,
    notedOn: null,
    notes: notes,
    dosage: resource.dosage === undefined ? null : readDosage(one(resource.dosage))
  };
  // The day the patient marked it Not taking, which isn't the day they stopped.
  if (resource.effectivePeriod) {
    need(resource.status === "stopped" && onlyKeys(resource.effectivePeriod, ["end"]));
    if (isMoment(resource.effectivePeriod.end)) out.notedOn = resource.effectivePeriod.end;
  }
  // The patient says as needed: the record's schedule isn't how they take it.
  if (out.dosage && notes.some(function (note) { return note.text === AS_NEEDED_NOTE; })) {
    delete out.dosage.timing;
    out.dosage.text = (out.dosage.text ? out.dosage.text + ". " : "") + AS_NEEDED_NOTE;
  }
  return out;
}

function readNotes(notes) {
  return (notes === undefined ? [] : array(notes)).map(function (note) { need(note); return { text: clean(note.text) }; }).filter(function (note) { return note.text; });
}

function readDosage(dosage) {
  need(onlyKeys(dosage, ["text", "patientInstruction", "timing", "asNeededBoolean", "route", "doseAndRate"]));
  var out = {};
  var words = dosage.text === undefined ? null : clean(dosage.text);
  if (words) out.text = words;
  var instruction = dosage.patientInstruction === undefined ? null : clean(dosage.patientInstruction);
  if (instruction) out.patientInstruction = instruction;
  var timing = dosage.timing === undefined ? null : readTiming(dosage.timing);
  if (timing) out.timing = timing;
  if (dosage.asNeededBoolean !== undefined) {
    need(dosage.asNeededBoolean === true);
    out.asNeededBoolean = true;
  }
  var route = dosage.route === undefined ? null : clean(dosage.route && dosage.route.text);
  if (route) out.route = { text: route };
  if (dosage.doseAndRate !== undefined) out.doseAndRate = [{ doseQuantity: readQuantity(one(dosage.doseAndRate)) }];
  return Object.keys(out).length ? out : null;
}

// FHIR reads Timing.code as the whole schedule, so words there don't stand
// beside a coded one; they're in the dosage's text.
function readTiming(timing) {
  need(timing && typeof timing === "object" && onlyKeys(timing, ["repeat", "code"]));
  if (timing.repeat === undefined) {
    var words = clean(timing.code && timing.code.text);
    return words ? { code: { text: words } } : null;
  }
  var repeat = timing.repeat;
  need(repeat && onlyKeys(repeat, ["frequency", "period", "periodUnit", "when"]));
  if (repeat.frequency !== undefined || repeat.period !== undefined || repeat.periodUnit !== undefined) {
    need(Number.isInteger(repeat.frequency) && repeat.frequency > 0 && positive(repeat.period) && ["s", "min", "h", "d", "wk", "mo", "a"].indexOf(repeat.periodUnit) !== -1);
  } else {
    need(repeat.when);
  }
  if (repeat.when !== undefined) need(array(repeat.when).length && repeat.when.every(function (code) { return WHEN.indexOf(code) !== -1; }));
  return { repeat: Object.assign({}, repeat) };
}

function readQuantity(rate) {
  need(onlyKeys(rate, ["doseQuantity"]));
  var quantity = rate.doseQuantity;
  need(quantity && onlyKeys(quantity, ["value", "unit", "system", "code"]) && positive(quantity.value));
  var out = { value: quantity.value };
  var unit = quantity.unit === undefined ? null : clean(quantity.unit);
  if (unit) out.unit = unit;
  var coded = quantity.code === undefined ? null : readCoding(quantity);
  return coded ? Object.assign(out, coded) : out;
}

function readAllergy(resource) {
  var out = {};
  out.clinicalStatus = status(resource.clinicalStatus, "allergyintolerance-clinical", CLINICAL);
  if (resource.verificationStatus !== undefined) out.verificationStatus = status(resource.verificationStatus, "allergyintolerance-verification", VERIFIED);
  if (resource.type !== undefined) out.type = among(resource.type, ["allergy", "intolerance"]);
  if (resource.category !== undefined) out.category = array(resource.category).map(function (c) { return among(c, ["food", "medication", "environment", "biologic"]); });
  if (resource.criticality !== undefined) out.criticality = among(resource.criticality, ["low", "high", "unable-to-assess"]);
  out.code = readConcept(resource.code, null, "Unnamed allergy");
  if (isMoment(resource.recordedDate)) out.recordedDate = resource.recordedDate;
  var notes = readNotes(resource.note);
  if (notes.length) out.note = notes;
  if (resource.reaction !== undefined) out.reaction = array(resource.reaction).map(readReaction);
  var byPatient = Boolean(resource.asserter);
  var name = out.code.text || "";
  var saysNone = byPatient
    ? (out.code.coding || []).some(function (c) { return c.system === SNOMED && c.code === noneCode("No known allergy"); })
    : !isUnspecified(resource) && Boolean(statementOf(resource, name));
  if (resource.asserter) need(resource.asserter.reference === SELF);
  return { resource: out, byPatient: byPatient, none: saysNone };
}

function readReaction(reaction) {
  need(reaction && !reaction.modifierExtension && array(reaction.manifestation).length);
  var out = { manifestation: reaction.manifestation.map(function (m) { return readConcept(m, null, "Unnamed reaction"); }) };
  if (reaction.severity !== undefined) out.severity = among(reaction.severity, ["mild", "moderate", "severe"]);
  var notes = readNotes(reaction.note);
  if (notes.length) out.note = notes;
  return out;
}

// systems: the only ones kept, or null for any. A code that isn't a proper one
// is left out; the words stay.
function readConcept(concept, systems, unnamed) {
  need(concept && typeof concept === "object");
  var out = {};
  if (concept.coding !== undefined) {
    var codings = array(concept.coding).map(readCoding)
      .filter(function (c) { return c && (!systems || systems.indexOf(c.system) !== -1); });
    if (codings.length) out.coding = codings;
  }
  out.text = (concept.text === undefined ? null : clean(concept.text)) || unnamed;
  return out;
}

function readCoding(coding) {
  if (!coding || typeof coding.system !== "string" || typeof coding.code !== "string") return null;
  var system = coding.system.trim();
  var code = coding.code.trim();
  return /^(https?:\/\/|urn:)\S{1,300}$/.test(system) && /^\S+( \S+)*$/.test(code) && code.length <= 100 ? { system: system, code: code } : null;
}

function status(concept, name, allowed) {
  var value = one(concept && concept.coding).code;
  return { coding: [{ system: "http://terminology.hl7.org/CodeSystem/" + name, code: among(value, allowed) }] };
}

function need(ok) {
  if (!ok) throw new Error("Unexpected");
}

function array(value) {
  need(Array.isArray(value) && value.length <= MAX_ENTRIES);
  return value;
}

function one(value) {
  need(Array.isArray(value) && value.length === 1 && value[0]);
  return value[0];
}

// Text with the characters FHIR doesn't allow left out. Null when it's blank.
function clean(value) {
  need(typeof value === "string" && value.length <= MAX_TEXT);
  return value.replace(NOT_ALLOWED, "").trim() || null;
}

// A real day or time, written FHIR's way.
function isMoment(value) {
  var parts = /^(\d{4})(?:-(\d\d)(?:-(\d\d)(T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d):[0-5]\d))?)?)?$/.exec(String(value));
  if (!parts || parts[1] === "0000") return false;
  if (!parts[2]) return true;
  var month = Number(parts[2]);
  var last = new Date(Date.UTC(2000 + Number(parts[1]) % 400, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && (!parts[3] || (Number(parts[3]) >= 1 && Number(parts[3]) <= last));
}

function among(value, allowed) {
  need(allowed.indexOf(value) !== -1);
  return value;
}

function positive(value) {
  return typeof value === "number" && isFinite(value) && value > 0;
}

function onlyKeys(object, keys) {
  return Object.keys(object).every(function (key) { return keys.indexOf(key) !== -1; });
}
