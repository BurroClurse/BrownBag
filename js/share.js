// Builds the list a patient shares, as a small FHIR Bundle, and packs it
// into an encrypted link for the QR code. The link holds a random secret;
// the 6-digit code the patient reads out is the other half of the key.
// Two ideas come from SMART Health Cards (HL7 SMART Health Cards and Links
// IG): the Bundle is trimmed (no ids, short "resource:N" references), and
// the packed list is written as digits, which a QR code holds more of.

import { fillNote, completedNote, suggestNote } from "./claims.js";
import { holdText } from "./meds.js";
import { olderText, dateText, monthText, fillRowsFrom, isDirections, oldFillText, recordsDisagree, sourcesText, takeRows } from "./card.js";
import { isMarkFingerprint, isOwnSide, sideWords } from "./reconcile.js";
import { NOT_SURE, UNNAMED, UNSPECIFIED, allergenNamed, isUnspecified, unspecifiedSentence, noneCode, statementOf, longDate } from "./allergies.js";
import { deriveKeyFromPin, toBase64Url, fromBase64Url, concatBytes } from "./vault.js";

export var QR_MAX_BYTES = 2331;

var SECRET_BYTES = 16;
var IV_BYTES = 12;
var TAG_BYTES = 16;
// v3 codes carry allergies. A staff page running older code refuses them,
// rather than showing a list with the allergies silently missing.
var PREFIX = "v3.";
var OLDER_PREFIX = "v2.";
var SELF = { reference: "resource:0" };
var SNOMED = "http://snomed.info/sct";
var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
var DATA_ABSENT = { system: "http://terminology.hl7.org/CodeSystem/data-absent-reason", code: "unknown" };
var FROM_PATIENT = "From the patient";
var QR_MAX_BITS = 18648; // QR_MAX_BYTES x 8: version 40, level M
var CODED_MAX_BITS = 15288; // 1911 bytes x 8: version 36 (161 squares), level M

export class ShareError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "ShareError";
    this.code = code;
  }
}

// Warnings for staff ride along as Bundle tags: records that came from a
// saved copy (with the date they were saved), or a load where a source
// failed. This is the one place the trimmed Bundle keeps a meta field.
var TAGS = "https://burroclurse.github.io/BrownBag/tags";
// A medicine the patient marked As needed: still active, taken only when
// needed (asNeededBoolean), with this note so staff see who said so.
var CLAIMS_ONLY_NOTE = "Filled, not in the health record";
// On hold in the record. The words travel too, for an older staff page.
var HOLD_NOTES = { all: "On hold in the records", some: "One record has this on hold" };
var HOLD_STATUS = { all: "on-hold", some: "unknown" };
// The records say as needed. Its own note: the coded part doesn't always fit.
var RECORDS_AS_NEEDED_NOTE = "Records say: as needed";
// An addition that was an older prescription.
var OLDER_NOTE = "From an older prescription";
export var AS_NEEDED_NOTE = "Patient says: takes only when needed";

// level: how much of what the record says in codes goes. 2: all of it. 1: no
// NDC codes. 0: none, as before codes were kept. The words are always the same.
// undated: no "Record date" on the sides, the last thing trimmed.
export function buildShareBundle(list, now, warnings = {}, level = 0, undated = false) {
  var entries = [{
    resource: {
      resourceType: "Patient",
      name: [{ text: list.patient.name }],
      birthDate: list.patient.birthDate
    }
  }];
  // Statements that disagree go in side by side, and one differs tag holds
  // their entry numbers.
  var differs = [];
  function addAll(statements) {
    var at = statements.map(function (statement) {
      entries.push({ resource: statement });
      return entries.length - 1;
    });
    if (at.length > 1) differs.push(at.join(" "));
  }
  list.current.forEach(function (item) {
    addAll(currentStatements(item, level, !undated));
  });
  // A card to check that isn't current still reaches staff. Matched by
  // itself: two cards can share a key.
  (list.toCheck || []).forEach(function (item) {
    if (list.current.indexOf(item) === -1) addAll(currentStatements(item, level, !undated));
  });
  list.additions.forEach(function (addition) {
    var statement = statementFor(addition.name, addition.rxcui, dosageText(addition), "active", withUnitCode(addition, level));
    statement.informationSource = SELF;
    if (addition.older) statement.note = [{ text: OLDER_NOTE + (addition.older.date ? ", " + addition.older.date : "") }];
    entries.push({ resource: statement });
  });
  list.stopped.forEach(function (item) {
    var statement = stoppedStatement(item, item.stoppedAt, level);
    // "I don't take this anymore": what each source said stays with it.
    var sides = item.answer && item.group ? item.group.sides : [];
    sides.forEach(function (side) { addNote(statement, otherRecordNote(item, side, level)); });
    addGroupNotes(statement, item);
    entries.push({ resource: statement });
  });
  if (list.allergies) {
    allergyEntriesFor(list.allergies).forEach(function (resource) { entries.push({ resource: resource }); });
  }
  entries.forEach(function (entry, index) {
    entry.fullUrl = "resource:" + index;
  });
  var bundle = { resourceType: "Bundle", type: "collection", timestamp: now.toISOString(), entry: entries };
  var tags = [];
  if (warnings.recordsSavedAt) {
    tags.push({ system: TAGS, code: "records-saved-on", display: warnings.recordsSavedAt });
  }
  if (warnings.recordsUpdatedAt) {
    tags.push({ system: TAGS, code: "records-updated-on", display: warnings.recordsUpdatedAt });
  }
  if (warnings.claims === "failed" || warnings.claims === "refused") {
    tags.push({ system: TAGS, code: "claims-not-loaded" });
  }
  if (warnings.incomplete) {
    tags.push({ system: TAGS, code: "records-incomplete" });
  }
  if (warnings.ownMissing) {
    tags.push({ system: TAGS, code: "own-missing" });
  }
  if (warnings.unnamed) {
    tags.push({ system: TAGS, code: "records-unnamed", display: String(warnings.unnamed) });
  }
  // A second source that didn't load, by name. The first one's failure is
  // records-incomplete.
  (warnings.sourceStatus || []).slice(1).forEach(function (source) {
    if (!source.loaded && source.name) tags.push({ system: TAGS, code: "source-not-loaded", display: source.name });
  });
  differs.forEach(function (numbers) {
    tags.push({ system: TAGS, code: "differs", display: numbers });
  });
  // A source that said it has no information about medicines, or knows of
  // none: "no-info:<Source>" or "none-known:<Source>".
  (warnings.noMedicines || []).forEach(function (said) {
    if (NO_MEDICINES[said.kind]) tags.push({ system: TAGS, code: "no-medicines", display: said.kind + ":" + said.source });
  });
  if (list.allergies) {
    tags.push({ system: TAGS, code: "allergies-" + warnings.allergies.status });
    if (warnings.allergies.savedAt) {
      tags.push({ system: TAGS, code: "allergies-saved-on", display: warnings.allergies.savedAt });
    }
    if (warnings.allergies.updatedAt) {
      tags.push({ system: TAGS, code: "allergies-updated-on", display: warnings.allergies.updatedAt });
    }
  }
  if (tags.length) {
    bundle.meta = { tag: tags };
  }
  return bundle;
}

// Staff notes (spec section 9).
var DISAGREE_NOTE = "Records disagree";
var UNSURE_NOTE = "Patient isn't sure";

// One current card's statements. Until the patient answers, or when they
// aren't sure, each side is its own statement, so nothing one source says is
// lost. A Not taking mark against a record is the record and the mark.
function currentStatements(item, level, dated) {
  var answer = item.answer || null;
  var question = answer ? null : item.question;
  var sides = item.group && item.group.sides.length > 1 ? item.group.sides : null;
  // The records disagree with each other, whatever the patient marked.
  var asked = recordsDisagree(item);
  var out;
  if (question && isMarkFingerprint(question.fingerprint)) {
    var records = asked ? sideStatements(item, sides, level, [DISAGREE_NOTE], dated) : [recordStatement(item, level)];
    // Linked to the mark, so even records that agree aren't an ordinary row.
    if (!asked) records[0].note.splice(1, 0, { text: DISAGREE_NOTE });
    out = records.concat(markStatement(item, question, level));
  } else if (question && sides) {
    out = sideStatements(item, sides, level, [DISAGREE_NOTE], dated);
  } else if (answer && answer.choice === "not-sure" && asked) {
    // Not sure, about the records or about a mark among records that
    // disagree: every side stays.
    out = sideStatements(item, sides, level, [DISAGREE_NOTE, UNSURE_NOTE], dated);
  } else if (answer && answer.choice === "not-sure") {
    out = [recordStatement(item, level)];
    addNote(out[0], UNSURE_NOTE);
  } else if (answer && chosenSide(item)) {
    var chosen = chosenSide(item);
    var statement = sideStatement(item, chosen, level);
    // The day as the answer wrote it, the same day the patient's card shows.
    addNote(statement, "Patient confirmed this, " + String(answer.answeredAt).slice(0, 10));
    (item.group ? item.group.sides : []).forEach(function (side) {
      if (side.sourceId !== chosen.sourceId) addNote(statement, otherRecordNote(item, side, level));
    });
    out = [statement];
  } else {
    out = [recordStatement(item, level)];
  }
  out.forEach(function (one) { addGroupNotes(one, item); });
  return out;
}

function markedAt(fingerprint) {
  var text = String(fingerprint);
  return text.slice(5, text.lastIndexOf(">"));
}

// The patient's Not taking, as the record they marked says it: in a group,
// that source's words and code, never the shown record's.
function markStatement(item, question, level) {
  var mark = question.mark || null;
  var at = mark && mark.at ? mark.at : markedAt(question.fingerprint);
  var side = mark && mark.side;
  if (!side || isOwnSide(item, side)) return stoppedStatement(item, at, level);
  var statement = statementFor(side.name || item.name, rxcuiOf(side), dosageText(side), "stopped", null, dosageParts(side, 0));
  statement.informationSource = SELF;
  statement.effectivePeriod = { end: at };
  return statement;
}

// A side's RxNorm code, from its key.
function rxcuiOf(side) {
  var coded = /^rx:(\d+)/.exec(String(side.key || ""));
  return coded ? coded[1] : null;
}

// The side an answer chose, as the records say it now, else as it was then.
function chosenSide(item) {
  var find = function (sides) { return (sides || []).filter(function (side) { return side.sourceId === item.answer.choice; })[0]; };
  return (item.group && find(item.group.sides)) || find(item.answer.sides) || null;
}

// The staff notes go right after each side's source, then the side's own
// date, so staff can see which is newer.
function sideStatements(item, sides, level, notes, dated) {
  var aboutStopping = item.group.verdicts.indexOf("status") !== -1;
  return sides.map(function (side) {
    var statement = sideStatement(item, side, level);
    var when = dated ? recordDate(side) : null;
    // On a status disagreement, which side lists it current and which
    // stopped, in words an older staff page shows too (the developer, 2026-11-25).
    var says = aboutStopping ? RECORDS_SAY[side.status] : null;
    var texts = notes.concat(says ? "Records say: " + says : [], when ? RECORD_DATE + when : []);
    statement.note.splice.apply(statement.note, [1, 0].concat(texts.map(function (text) { return { text: text }; })));
    return statement;
  });
}

var RECORD_DATE = "Record date: ";
var RECORDS_SAY = { current: "current", "not-current": "stopped" };

// "<YYYY-MM>", or the year when that's all the record has.
function recordDate(side) {
  var found = /^\d{4}(?:-\d{2})?/.exec(String(side.asOf || ""));
  return found ? found[0] : null;
}

// The card's own record has everything it said. Another source's has only
// what its side says: never the shown record's codes, prescriber or fills.
function sideStatement(item, side, level) {
  if (isOwnSide(item, side)) return recordStatement(item, level, side.sourceName);
  var statement = statementFor(side.name || item.name, rxcuiOf(side), dosageText(side), sideStatus(side), null, dosageParts(side, 0));
  statement.note = [{ text: "From records: " + side.sourceName }];
  // The patient's As needed mark is on the card, so on every side.
  if (item.asNeededAt) asNeeded(statement, AS_NEEDED_NOTE);
  return statement;
}

// "completed", not "stopped": a stopped statement is the patient's own mark
// on every staff page.
function sideStatus(side) {
  if (side.status === "not-current") return "completed";
  if (side.status !== "current") return "unknown";
  if (side.recordStatus === "on-hold") return "on-hold";
  return OWN_STATUS.indexOf(side.recordStatus) !== -1 ? side.recordStatus : "active";
}

// "Other record: <Source>, <words>, <YYYY-MM>". At level 0, where the list
// is longest, only the source and month. Once the patient has answered "Do
// you still take it?", a record that stopped it says so: "Other record
// (stopped): …" (the developer, 2026-11-26).
function otherRecordNote(item, side, level) {
  var month = recordDate(side);
  var stopped = item.group && item.group.verdicts.indexOf("status") !== -1 && side.status === "not-current";
  return "Other record" + (stopped ? " (stopped)" : "") + ": " + [side.sourceName].concat(level ? sideWords(side) : [], month || []).join(", ");
}

function addGroupNotes(statement, item) {
  ((item.group && item.group.notes) || []).forEach(function (text) { addNote(statement, text); });
}

function addNote(statement, text) {
  statement.note = (statement.note || []).concat({ text: text });
}

function asNeeded(statement, note) {
  statement.dosage = statement.dosage || [{}];
  statement.dosage[0].asNeededBoolean = true;
  statement.note.push({ text: note });
}

// A current record as today. from: the source note's names; a group whose
// records agree names every source.
function recordStatement(item, level, from) {
  var statement = statementFor(item.name, item.rxcui, dosageText(item), statusFor(item), null, dosageParts(item, level));
  addCodes(statement, item, level);
  if (item.origin === "claims") {
    // Filled through insurance, but not in the health record.
    statement.informationSource = { display: item.source };
    statement.note = [{ text: CLAIMS_ONLY_NOTE }];
  } else {
    statement.note = [{ text: "From records: " + (from || sourcesText(item)) }];
  }
  if (item.prescriber) {
    statement.note.push({ text: "Prescribed by " + item.prescriber });
  }
  if (HOLD_NOTES[holdText(item)]) {
    statement.note.push({ text: HOLD_NOTES[holdText(item)] });
  }
  if (item.completedButFilled) {
    statement.note.push({ text: completedNote(item.completedButFilled, item.recordStatus) });
  }
  if (item.fills) {
    statement.note.push({ text: fillNote(item.fills) });
    // What the newest fill suggests, for staff to ask about (Task 8). It's
    // optional help, so the first thing to go at level 0 (ruling R31).
    if (level && suggestNote(item.fills)) statement.note.push({ text: suggestNote(item.fills) });
  }
  if (item.asNeededAt) {
    asNeeded(statement, AS_NEEDED_NOTE);
  } else if (item.prn) {
    asNeeded(statement, RECORDS_AS_NEEDED_NOTE);
  }
  return statement;
}

// The patient's Not taking mark, as today.
function stoppedStatement(item, at, level) {
  var statement = statementFor(item.name, item.rxcui, dosageText(item), "stopped", null, dosageParts(item, level));
  addCodes(statement, item, level);
  statement.informationSource = SELF;
  statement.effectivePeriod = { end: at };
  return statement;
}

var NO_MEDICINES = {
  "no-info": function (name) { return name + ": no information about medicines"; },
  "none-known": function (name) { return name + ": no medicines known"; }
};

function noMedicinesFrom(tags) {
  return tags.filter(function (tag) { return tag && tag.system === TAGS && tag.code === "no-medicines"; }).map(function (tag) {
    var found = /^([a-z-]+):(.+)$/.exec(String(tag.display || ""));
    return found && NO_MEDICINES[found[1]] ? { source: found[2], kind: found[1] } : null;
  }).filter(Boolean);
}

function notLoadedFrom(tags) {
  return tags.filter(function (tag) { return tag && tag.system === TAGS && tag.code === "source-not-loaded"; })
    .map(function (tag) { return typeof tag.display === "string" ? tag.display.trim() : ""; })
    .filter(function (name, index, all) { return name && all.indexOf(name) === index; });
}

// Each differs tag's statements, as { name, sides } in `disagree`, by
// entry number. A number that isn't a medicine, or is in an earlier tag,
// is skipped; fewer than two left and the tag says nothing.
function linkedFrom(tags, entries, disagree) {
  var linked = {};
  tags.forEach(function (tag) {
    if (!tag || tag.system !== TAGS || tag.code !== "differs") return;
    var at = String(tag.display || "").split(" ").filter(function (word, index, all) {
      var resource = /^[1-9]\d{0,3}$/.test(word) && entries[Number(word)] && entries[Number(word)].resource;
      return resource && resource.resourceType === "MedicationStatement" && !linked[Number(word)] && all.indexOf(word) === index;
    });
    if (at.length < 2) return;
    var group = { name: null, sides: [] };
    disagree.push(group);
    at.forEach(function (word) { linked[Number(word)] = group; });
  });
  return linked;
}

// The staff page's link: the list is the part after "#". Once it's read, the
// address is put back to plain share.html on the same history step (the developer,
// 2026-11-26), so a link copied or shared from the page doesn't carry the
// list. place and steps are location and history.
//
// The tab keeps the same locked text, exactly what the QR code holds and
// never the unlocked list, on that step's own history.state (the developer, Task
// 10d). A reload, or Safari bringing back a tab it put aside, finds it there
// and asks for the 6 digits again; it goes when the tab is closed (a tab
// reopened from recently closed tabs may bring it back, still locked). The step's
// state goes with the tab's history, not with its address, so a copied
// address or a new tab has no list. A new link in the same tab is a new step
// that keeps its own. A browser that won't keep it still gets a plain address.
export var KEPT_LIST = "brownBagSharedList";

export function takeListFromLink(place, steps) {
  var fragment = String(place.hash || "").slice(1);
  if (!fragment) return listKeptOnStep(steps);
  var address = place.pathname + place.search;
  var state = {};
  state[KEPT_LIST] = fragment;
  try {
    steps.replaceState(state, "", address);
  } catch (error) {
    try { steps.replaceState(null, "", address); } catch (again) { /* the address keeps it */ }
  }
  return fragment;
}

// The locked text the tab's current step keeps, or "". Every step has the
// same plain address, so Back or Forward between two links' steps doesn't
// load the page again; share-view.js compares this with what it read, and
// reloads when they differ.
export function listKeptOnStep(steps) {
  try {
    var state = steps.state;
    var kept = state && typeof state === "object" ? state[KEPT_LIST] : "";
    return typeof kept === "string" ? kept : "";
  } catch (error) {
    return "";
  }
}

// today ("YYYY-MM-DD"), on screens: the day the list is opened, so a fill
// over a year old says so. The FHIR file's maker leaves it out.
export function groupShareBundle(bundle, today) {
  var tags = (bundle.meta && bundle.meta.tag) || [];
  var of = function (code) { return tags.filter(function (tag) { return tag.system === TAGS && tag.code === code; })[0]; };
  var saved = of("records-saved-on");
  var updated = of("records-updated-on");
  var unnamed = of("records-unnamed");
  var groups = {
    patient: null,
    madeAt: bundle.timestamp,
    recordsSavedAt: saved ? saved.display : null,
    recordsUpdatedAt: updated ? updated.display : null,
    claimsNotLoaded: Boolean(of("claims-not-loaded")),
    incomplete: Boolean(of("records-incomplete")),
    ownMissing: Boolean(of("own-missing")),
    // A count that isn't one still means there are some.
    unnamed: unnamed ? (/^[1-9]\d{0,3}$/.test(unnamed.display) ? Number(unnamed.display) : 1) : 0,
    noMedicines: noMedicinesFrom(tags),
    notLoaded: notLoadedFrom(tags),
    disagree: [],
    fromRecords: [],
    fromClaims: [],
    asNeeded: [],
    addedByPatient: [],
    patientSaysStopped: [],
    allergies: allergyTags(tags)
  };
  var linked = linkedFrom(tags, bundle.entry || [], groups.disagree);
  (bundle.entry || []).forEach(function (entry, index) {
    var resource = entry.resource || {};
    if (resource.resourceType === "Patient") {
      groups.patient = { name: (resource.name && resource.name[0] && resource.name[0].text) || "", birthDate: resource.birthDate || "" };
      return;
    }
    if (resource.resourceType === "AllergyIntolerance" && groups.allergies) {
      groupAllergy(groups.allergies, resource);
      return;
    }
    if (resource.resourceType !== "MedicationStatement") {
      return;
    }
    var name = (resource.medicationCodeableConcept && resource.medicationCodeableConcept.text) || "Unnamed medicine";
    var fromPatient = resource.informationSource && resource.informationSource.reference === SELF.reference;
    var fromClaims = resource.informationSource && !resource.informationSource.reference && resource.informationSource.display;
    var noted = function (text) { return (resource.note || []).some(function (note) { return note.text === text; }); };
    var who = null;
    if (fromPatient) who = resource.dosage && resource.dosage[0] && resource.dosage[0].asNeededBoolean === true ? "Added by patient" : null;
    else if (noted(AS_NEEDED_NOTE)) who = "Patient says as needed";
    else if (noted(RECORDS_AS_NEEDED_NOTE)) who = "Records say as needed";
    var stopped = resource.status === "stopped";
    var row = Object.assign({ name: name }, cardFrom(resource, fromPatient && !stopped, today));
    var coded = ((resource.medicationCodeableConcept && resource.medicationCodeableConcept.coding) || []).filter(function (c) { return c.system === RXNORM && c.code; })[0];
    if (coded) row.rxnorm = String(coded.code);
    if (stopped) {
      var stoppedOn = resource.effectivePeriod && resource.effectivePeriod.end;
      if (stoppedOn) row.facts.unshift(["Not taking since", dateText(stoppedOn)]);
    }
    if (linked[index]) {
      // One side of a disagreement: only in its own part.
      if (who) row.facts.push(["Who says", who]);
      row.status = resource.status;
      linked[index].name = linked[index].name || name;
      linked[index].sides.push(row);
    } else if (stopped) {
      groups.patientSaysStopped.push(row);
    } else if (who) {
      row.facts.push(["Who says", who]);
      row.added = Boolean(fromPatient);
      groups.asNeeded.push(row);
    } else if (fromPatient) {
      groups.addedByPatient.push(row);
    } else if (fromClaims) {
      groups.fromClaims.push(row);
    } else {
      groups.fromRecords.push(row);
    }
  });
  return groups;
}

// The allergies part of the Bundle (FHIR R4 AllergyIntolerance).
function allergyEntriesFor(allergies) {
  var out = allergies.cards.map(allergyFor);
  allergies.statements.forEach(function (text) {
    var resource = allergyResource(text, noneCode(text) ? [{ system: SNOMED, code: noneCode(text) }] : null);
    resource.note = [{ text: "From records" }];
    out.push(resource);
  });
  for (var i = 0; i < (allergies.unspecified || 0); i += 1) {
    var blank = allergyResource("Allergic disposition", [UNSPECIFIED]);
    addSaid(blank, (allergies.unnamedFhir || [])[i]);
    var details = (allergies.unnamed || [])[i];
    if (details) blank.note = [{ text: DETAILS + details }];
    out.push(blank);
  }
  if (allergies.saidNone) {
    var none = allergyResource("No known allergy", [{ system: SNOMED, code: noneCode("No known allergy") }]);
    // US Core: the patient was asked and has none, so it's confirmed.
    none.verificationStatus = verified("confirmed");
    none.recorder = SELF;
    none.asserter = SELF;
    none.recordedDate = allergies.saidNone;
    out.push(none);
  }
  return out;
}

function allergyResource(text, codings, clinical) {
  // A code with no system means nothing to another system.
  var coding = (codings || []).filter(function (c) { return c && c.system; });
  return {
    resourceType: "AllergyIntolerance",
    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: clinical || "active" }] },
    code: coding.length ? { text: text, coding: coding } : { text: text },
    patient: SELF
  };
}

function verified(code) {
  return { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: code }] };
}

function manifestation(text, codes) {
  var coding = (codes || []).filter(function (c) { return c.system; });
  return coding.length ? { text: text, coding: coding } : { text: text };
}

// The patient's own allergy: they said it and they recorded it. Nobody at a
// clinic has confirmed it.
function ownAllergy(card) {
  var known = allergenNamed(card.name);
  var rxcui = card.rxcui || (known && known.rxcui);
  var resource = allergyResource(card.name, rxcui ? [{ system: RXNORM, code: rxcui }] : null);
  resource.verificationStatus = verified("unconfirmed");
  if (known) resource.category = [known.category];
  if (card.mine && card.mine.addedAt) resource.recordedDate = card.mine.addedAt;
  resource.recorder = SELF;
  resource.asserter = SELF;
  return resource;
}

// One from the records, with everything the record said. A list saved before
// that was kept has only the parts the screen shows.
function recordAllergy(card) {
  var codes = card.codes || [card.code];
  // FHIR's own words for "we don't know what it's called".
  if (card.name === UNNAMED && !codes.filter(Boolean).length) codes = [DATA_ABSENT];
  var resource = allergyResource(card.name, codes, card.clinical);
  var said = card.fhir || { verification: card.unconfirmed ? "unconfirmed" : null, type: card.intolerance ? "intolerance" : null, category: [], criticality: card.highRisk ? "high" : null, recordedDate: null };
  addSaid(resource, said);
  return resource;
}

// What the record said in codes.
function addSaid(resource, said) {
  if (!said) return;
  if (said.verification) resource.verificationStatus = verified(said.verification);
  if (said.type) resource.type = said.type;
  if (said.category.length) resource.category = said.category;
  if (said.criticality) resource.criticality = said.criticality;
  if (said.recordedDate) resource.recordedDate = said.recordedDate;
}

// What else an allergy with no allergen says.
var DETAILS = "Details: ";

function allergyFor(card) {
  var own = card.origin === "added";
  var resource = own ? ownAllergy(card) : recordAllergy(card);
  var notes = own ? [] : ["From records: " + card.source];
  var reactions = card.reactions.map(function (r) {
    return Object.assign({ manifestation: [manifestation(r.text, r.codes)] }, r.severity ? { severity: r.severity } : {});
  });
  if (card.mine && card.mine.reaction === NOT_SURE) {
    notes.push(own ? "Reaction not known" : "Patient says: reaction not known");
  } else if (card.mine) {
    (card.mine.reactions || [card.mine.reaction]).forEach(function (text) {
      var mine = { manifestation: [manifestation(text)] };
      if (!own) mine.note = [{ text: FROM_PATIENT }];
      reactions.push(mine);
    });
  }
  if (reactions.length) resource.reaction = reactions;
  if (notes.length) resource.note = notes.map(function (text) { return { text: text }; });
  return resource;
}

// Null when the code was made before Brown Bag had allergies.
function allergyTags(tags) {
  var of = function (code) {
    return tags.filter(function (tag) { return tag.system === TAGS && tag.code === code; })[0];
  };
  var status = ["loaded", "failed", "refused", "not-loaded"].filter(function (s) { return of("allergies-" + s); })[0];
  if (!status) return null;
  var saved = of("allergies-saved-on");
  var updated = of("allergies-updated-on");
  return { status: status, savedAt: saved ? saved.display : null, updatedAt: updated ? updated.display : null, fromRecords: [], fromPatient: [], statements: [], unspecified: 0, unnamed: [], saidNone: false };
}

function groupAllergy(groups, resource) {
  var name = (resource.code && resource.code.text) || "Unnamed allergy";
  var own = Boolean(resource.asserter);
  // The patient's statement is the coded one only, never words they typed.
  var saysSo = ((resource.code && resource.code.coding) || []).some(function (c) { return c.system === SNOMED && c.code === noneCode("No known allergy"); });
  if (own && saysSo) {
    groups.saidNone = true;
    return;
  }
  if (!own && isUnspecified(resource)) {
    groups.unspecified += 1;
    var said = String(((resource.note || [])[0] || {}).text || "");
    groups.unnamed.push(said.indexOf(DETAILS) === 0 ? said.slice(DETAILS.length) : "");
    return;
  }
  var statement = own ? null : statementOf(resource, name);
  if (statement) {
    groups.statements.push(statement);
    return;
  }
  var reactions = (resource.reaction || []).map(function (reaction) {
    var fromPatient = (reaction.note || []).some(function (n) { return n.text === FROM_PATIENT; });
    var text = (reaction.manifestation && reaction.manifestation[0] && reaction.manifestation[0].text) || "Unnamed reaction";
    if (reaction.severity) text += ", " + reaction.severity;
    return own ? text : text + (fromPatient ? " (patient)" : " (records)");
  });
  var source = null;
  var lines = [];
  (resource.note || []).forEach(function (n) {
    var found = own ? null : /^From records: (.+)$/.exec(n.text);
    if (found && !source) source = found[1];
    else if (n.text === (own ? "Reaction not known" : "Patient says: reaction not known")) reactions.push(own ? "not known" : "not known (patient)");
    else if (n.text) lines.push(n.text);
  });
  lines.unshift("Reaction: " + (reactions.join(" · ") || "not listed"));
  if (own) {
    groups.fromPatient.push({ name: name, source: null, lines: lines });
    return;
  }
  var notConfirmed = ((resource.verificationStatus && resource.verificationStatus.coding) || []).some(function (c) { return c.code === "unconfirmed"; });
  var marks = joinDetail([
    resource.criticality === "high" ? "Marked high risk" : null,
    resource.type === "intolerance" ? "Intolerance" : null,
    notConfirmed ? "Not confirmed" : null
  ]);
  groups.fromRecords.push({ name: name, source: source, lines: (marks ? [marks] : []).concat(lines) });
}

// The allergies as staff read them: a title and rows of a name and its lines.
// Where the records are from is in the title when it's the same for all of them.
export function allergyParts(allergies) {
  var first = allergies.fromRecords.length ? allergies.fromRecords[0].source : null;
  var same = Boolean(first) && allergies.fromRecords.every(function (row) { return row.source === first; });
  return [
    { title: same ? "From records (" + first + ")" : "From records", rows: allergies.fromRecords },
    { title: "From patient", rows: allergies.fromPatient }
  ].filter(function (part) { return part.rows.length; }).map(function (part) {
    return {
      title: part.title,
      rows: part.rows.map(function (row) {
        return { name: row.name, lines: row.lines.concat(row.source && !same ? "Source: " + row.source : []) };
      })
    };
  });
}

// The staff page's allergy wording. A load that failed is said whether or
// not anything is listed, so a partial list never looks complete.
export function allergyNotices(allergies) {
  if (!allergies) return [];
  var out = [];
  if (allergies.savedAt) {
    out.push("Allergies from records are a copy saved on " + longDate(localDay(allergies.savedAt)) + ". They may be out of date.");
  } else if (allergies.status !== "loaded") {
    out.push("Allergies from records couldn't be loaded. Ask the patient.");
  }
  var listed = allergies.fromRecords.length + allergies.fromPatient.length;
  return out.concat(unspecifiedSentence(allergies.unspecified, listed, "Records", "Ask the patient.", allergies.unnamed) || []);
}

export function allergyEmptyText(allergies) {
  if (!allergies) return "This code doesn't include allergies. Ask the patient.";
  if (allergies.fromRecords.length || allergies.fromPatient.length) return null;
  if (allergies.saidNone) return "Patient says: no known allergies.";
  if (allergies.statements.length || allergies.unspecified) return null;
  return allergies.status === "loaded" || allergies.savedAt ? "None in the records. The patient hasn't said." : null;
}

// Whether staff see a calm box: the patient said none, nothing is listed, and
// there's no warning to read.
export function staffSaysNone(allergies) {
  return Boolean(allergies && allergies.saidNone) && !allergies.fromRecords.length && !allergies.fromPatient.length && !allergyNotices(allergies).length;
}

// The day on the reader's own calendar.
function localDay(timestamp) {
  var date = new Date(timestamp);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

export async function packShare(bundle, baseUrl) {
  var code = sixDigitCode();
  var secret = globalThis.crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
  var iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  var key = await deriveKeyFromPin(code, secret);
  var compressed = await transform(new TextEncoder().encode(JSON.stringify(bundle)), new CompressionStream("deflate-raw"));
  var sealed = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, compressed));
  var prefix = baseUrl + "share.html#" + PREFIX;
  var digits = toDigits(toBase64Url(concatBytes(secret, iv, sealed)));
  return { url: prefix + digits, prefix: prefix, digits: digits, code: code };
}

export async function unpackShare(fragment, code) {
  if (typeof fragment !== "string" || (fragment.indexOf(PREFIX) !== 0 && fragment.indexOf(OLDER_PREFIX) !== 0)) {
    throw new ShareError("bad-link");
  }
  var bytes;
  try {
    bytes = fromBase64Url(fromDigits(fragment.slice(PREFIX.length)));
  } catch (error) {
    throw new ShareError("bad-link");
  }
  if (bytes.length <= SECRET_BYTES + IV_BYTES + TAG_BYTES) {
    throw new ShareError("bad-link");
  }
  var secret = bytes.slice(0, SECRET_BYTES);
  var iv = bytes.slice(SECRET_BYTES, SECRET_BYTES + IV_BYTES);
  var key = await deriveKeyFromPin(String(code), secret);
  var compressed;
  try {
    compressed = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, bytes.slice(SECRET_BYTES + IV_BYTES));
  } catch (error) {
    throw new ShareError("wrong-code");
  }
  try {
    var plain = await transform(new Uint8Array(compressed), new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (error) {
    throw new ShareError("bad-link");
  }
}

// The list with as much in codes as fits. More squares are harder to scan, so
// codes go only while the QR code stays at 161 across.
export async function shareBundleFor(list, now, warnings, baseUrl) {
  for (var level = 2; level > 0; level -= 1) {
    var bundle = buildShareBundle(list, now, warnings, level);
    if (await bitsFor(bundle, baseUrl) <= CODED_MAX_BITS) return bundle;
  }
  // Then the sides' dates, only when the code wouldn't fit at all. A side
  // itself is never left out: past this, the list is too long for one code.
  var plain = buildShareBundle(list, now, warnings, 0);
  if (await bitsFor(plain, baseUrl) <= QR_MAX_BITS) return plain;
  var undated = buildShareBundle(list, now, warnings, 0, true);
  return await bitsFor(undated, baseUrl) <= QR_MAX_BITS ? undated : plain;
}

// The same length as the real code, without the second the locking takes.
async function bitsFor(bundle, baseUrl) {
  var packed = await transform(new TextEncoder().encode(JSON.stringify(bundle)), new CompressionStream("deflate-raw"));
  var bytes = SECRET_BYTES + IV_BYTES + packed.length + TAG_BYTES;
  return bitsIn(baseUrl + "share.html#" + PREFIX, Math.ceil(bytes * 4 / 3) * 2);
}

// Counts the bits of a QR code made of two parts: the web address as text
// (byte mode) and the packed list as digits (numeric mode).
export function fitsInQr(prefix, digits) {
  return bitsIn(prefix, digits.length) <= QR_MAX_BITS;
}

function bitsIn(prefix, digitCount) {
  var textBits = 4 + 16 + 8 * new TextEncoder().encode(prefix).length;
  var rest = digitCount % 3;
  return textBits + 4 + 14 + 10 * Math.floor(digitCount / 3) + (rest === 1 ? 4 : rest === 2 ? 7 : 0);
}

// Each base64url character becomes two digits: its character code minus 45,
// the same trick SMART Health Cards use.
function toDigits(text) {
  var out = "";
  for (var i = 0; i < text.length; i += 1) {
    out += String(text.charCodeAt(i) - 45).padStart(2, "0");
  }
  return out;
}

function fromDigits(digits) {
  if (!/^\d*$/.test(digits) || digits.length % 2 !== 0) {
    throw new ShareError("bad-link");
  }
  var out = "";
  for (var i = 0; i < digits.length; i += 2) {
    var value = Number(digits.slice(i, i + 2));
    if (value > 77) {
      throw new ShareError("bad-link");
    }
    out += String.fromCharCode(value + 45);
  }
  return out;
}

// structured: an addition's picked answers ({ quantity, schedule }), added
// as FHIR dosage numbers next to the words.
function statementFor(name, rxcui, dosage, status, structured, separate) {
  var concept = { text: name };
  if (rxcui) {
    concept.coding = [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: rxcui }];
  }
  var statement = {
    resourceType: "MedicationStatement",
    status: status,
    subject: SELF,
    medicationCodeableConcept: concept
  };
  var parts = structuredDosage(structured) || separate;
  if (dosage || parts) {
    statement.dosage = [Object.assign(dosage ? { text: dosage } : {}, parts || {})];
  }
  return statement;
}

function structuredDosage(structured) {
  var quantity = structured && structured.quantity;
  var schedule = structured && structured.schedule;
  if (!quantity && !schedule) return null;
  var out = {};
  if (quantity) {
    out.doseAndRate = [{ doseQuantity: Object.assign({}, quantity) }];
  }
  if (schedule) {
    var repeat = {};
    ["frequency", "period", "periodUnit", "when"].forEach(function (field) {
      if (schedule[field] !== undefined) repeat[field] = schedule[field];
    });
    if (Object.keys(repeat).length) out.timing = { repeat: repeat };
    if (schedule.asNeeded) out.asNeededBoolean = true;
  }
  return out;
}

// The records' route and how often on their own, beside the whole dosage in
// words, so the staff page can label each.
function dosageParts(item, level) {
  var out = {};
  var coded = (level && item.fhir && item.fhir.dosage) || {};
  if (item.route) out.route = { text: item.route };
  if (item.frequency && isDirections(item.frequency)) out.patientInstruction = item.frequency;
  else if (item.frequency) out.timing = { code: { text: item.frequency } };
  // The patient's own "as needed" isn't the record's schedule.
  if (coded.repeat && !item.asNeededAt) out.timing = Object.assign({ repeat: coded.repeat }, out.timing);
  if (coded.quantity) out.doseAndRate = [{ doseQuantity: coded.quantity }];
  if (coded.asNeeded) out.asNeededBoolean = true;
  return Object.keys(out).length ? out : null;
}

// Back into labelled rows. Words that don't say which part is which (an older
// code, a changed one) stay whole: never a guessed label.
function takeFrom(dosage, added) {
  var text = dosage && dosage.text;
  if (!text) return [];
  var route = (dosage.route && dosage.route.text) || null;
  var often = (dosage.timing && dosage.timing.code && dosage.timing.code.text) || dosage.patientInstruction || null;
  if (added) {
    // The add form makes these: a dose, how often, or both.
    var two = text.split(" · ");
    if (two.length === 2) return takeRows(two[0], null, two[1]);
    if (two.length === 1 && (dosage.timing || dosage.asNeededBoolean)) return takeRows(null, null, text);
    if (two.length === 1 && dosage.doseAndRate) return takeRows(text, null, null);
    return [["Directions", text]];
  }
  var rest = joinDetail([route, often]);
  if (!rest) return [["Directions", text]];
  if (text === rest) return takeRows(null, route, often);
  return text.slice(-rest.length - 3) === " · " + rest ? takeRows(text.slice(0, -rest.length - 3), route, often) : [["Directions", text]];
}

// The notes on a shared medicine, each under its own label. The note about a
// fill over a year old is worked out here from the fill's date, as on the
// patient's card; it's never in the code.
function cardFrom(resource, added, today) {
  var card = { take: takeFrom(resource.dosage && resource.dosage[0], added), flags: [], facts: [] };
  var source = [];
  (resource.note || []).forEach(function (note) {
    var text = String(note.text || "");
    var found;
    if (text === AS_NEEDED_NOTE || text === RECORDS_AS_NEEDED_NOTE || text === CLAIMS_ONLY_NOTE) return;
    if (text === HOLD_NOTES.all || text === HOLD_NOTES.some) {
      card.flags.push(text);
      return;
    }
    if (text === OLDER_NOTE) card.facts.push(["From", olderText(null)]);
    else if ((found = /^From an older prescription, (\d{4}\S*)$/.exec(text))) card.facts.push(["From", olderText(found[1])]);
    else if ((found = /^From records: (.+)$/.exec(text))) source.push(["Source", found[1]]);
    else if ((found = /^Prescribed by (.+)$/.exec(text))) card.facts.push(["Prescribed by", found[1]]);
    else if ((found = /^Record date: (\d{4}(?:-\d{2})?)$/.exec(text))) card.facts.push(["Record date", monthText(found[1])]);
    else if ((found = /^Records say: (current|stopped)$/.exec(text))) card.facts.push(["Records say", found[1]]);
    else if ((found = /^(.+, but filled )(\d{4}\S*)$/.exec(text))) card.flags.push(found[1] + dateText(found[2]));
    else if ((found = /^(?:Last filled (\S+)|Filled, dates? not given) \((.+)\), (\d+) fills?$/.exec(text))) {
      card.facts = card.facts.concat(fillRowsFrom(Number(found[3]), found[1], found[2]));
      if (found[1] && oldFillText(found[1], today)) card.flags.push(oldFillText(found[1], today));
    }
    else if (text === "No fill found in claims") card.facts.push(["Filled", text]);
    else if ((found = /^Fill suggests (about \d+(?:\.5)? a day \(\d+(?:\.\d+)? for \d+(?:\.\d+)? days\))$/.exec(text))) card.facts.push(["From the fill", found[1]]);
    else if (text) source.push(["Note", text]);
  });
  card.facts = card.facts.concat(source);
  return card;
}

function addCodes(statement, item, level) {
  var codes = (level && item.fhir && item.fhir.codes) || [];
  if (level === 1) codes = codes.filter(function (coding) { return coding.system === RXNORM; });
  if (codes.length) statement.medicationCodeableConcept.coding = codes;
}

var UCUM = "http://unitsofmeasure.org";
var UNIT_CODES = { tablet: "{tbl}", capsule: "{capsule}", drop: "[drp]", puff: "{puff}", spray: "{spray}", patch: "{patch}", suppository: "{suppository}", lozenge: "{lozenge}", scoop: "{scoop}" };
function withUnitCode(addition, level) {
  var quantity = addition.quantity;
  if (!level || !quantity || quantity.code || !Object.prototype.hasOwnProperty.call(UNIT_CODES, quantity.unit)) return addition;
  return Object.assign({}, addition, { quantity: Object.assign({}, quantity, { system: UCUM, code: UNIT_CODES[quantity.unit] }) });
}

// The record's own word when it isn't plainly active. A finished prescription
// filled again, or a medicine only insurance knows: nobody has said it's taken.
var OWN_STATUS = ["intended", "unknown"];
function statusFor(item) {
  var held = HOLD_STATUS[holdText(item)];
  if (held) return held;
  if (item.origin === "claims" || item.completedButFilled) return "unknown";
  return OWN_STATUS.indexOf(item.recordStatus) !== -1 ? item.recordStatus : "active";
}

function dosageText(item) {
  return joinDetail([item.dose, item.route, item.frequency]) || null;
}

function joinDetail(parts) {
  return parts.filter(Boolean).join(" · ");
}

// Rejection sampling keeps every code equally likely.
function sixDigitCode() {
  var buffer = new Uint32Array(1);
  var limit = Math.floor(4294967296 / 1000000) * 1000000;
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return String(buffer[0] % 1000000).padStart(6, "0");
}

async function transform(bytes, stream) {
  var output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

// The same number as the home button: current, filled and added.
export function shareMedicineCount(groups) {
  // A disagreement is one card on the patient's list.
  return groups.fromRecords.length + (groups.disagree || []).length + (groups.fromClaims || []).length + (groups.asNeeded || []).length + groups.addedByPatient.length;
}

// What staff are told about the medicines that aren't listed, right under the
// heading, where it can't be missed.
export function medicineNotices(groups) {
  var out = [];
  if (groups.incomplete) out.push("Some of the patient's records couldn't be loaded. This list may be missing medicines.");
  (groups.notLoaded || []).forEach(function (name) { out.push(name + " didn't load."); });
  if (groups.ownMissing) out.push("What the patient added or marked not taking couldn't be opened. Ask the patient.");
  if (groups.unnamed) {
    var one = groups.unnamed === 1;
    out.push("The records also have " + groups.unnamed + (one ? " entry" : " entries") + " with no medicine name, so " + (one ? "it isn't" : "they aren't") + " listed. Ask the patient.");
  }
  (groups.noMedicines || []).forEach(function (said) { out.push(NO_MEDICINES[said.kind](said.source)); });
  return out;
}

export function recordsPartial(groups) {
  return Boolean(groups.incomplete || ((groups.unnamed || (groups.noMedicines || []).length) && !groups.fromRecords.length && !(groups.disagree || []).length));
}

export var DISAGREE_TITLE = "Records disagree: ask the patient";

var ANSWERED = /^Patient (?:isn't sure|confirmed this, .+)$/;

// Each disagreement as staff read it, on the staff page and in See what's
// inside: the patient's answer first, then each side under its source and
// date, a side the patient confirmed first. What the label, the answer and
// the part's title say isn't said again on each side.
export function disagreeParts(groups) {
  return (groups.disagree || []).map(function (group) {
    var answer = null;
    var sides = group.sides.map(function (row) {
      var said = row.facts.filter(function (fact) { return fact[0] === "Note" && ANSWERED.test(fact[1]); })[0];
      if (said && !answer) answer = said[1];
      var label = [factOf(row, "Source"), factOf(row, "Record date")].filter(Boolean).join(", ");
      var facts = row.facts.filter(function (fact) {
        if (fact[0] === "Source" || fact[0] === "Record date") return false;
        return !(fact[0] === "Note" && (fact[1] === DISAGREE_NOTE || ANSWERED.test(fact[1])));
      });
      return {
        // The patient's own Not taking has no source: it's theirs.
        label: label || (row.status === "stopped" ? "Patient says not taking" : null),
        row: Object.assign({}, row, { facts: facts }),
        confirmed: Boolean(said) && said[1] !== UNSURE_NOTE
      };
    });
    var first = sides.filter(function (side) { return side.confirmed; });
    return {
      name: group.name,
      answer: answer,
      sides: first.concat(sides.filter(function (side) { return !side.confirmed; })).map(function (side) { return { label: side.label, row: side.row }; })
    };
  });
}

function factOf(row, label) {
  var found = row.facts.filter(function (fact) { return fact[0] === label; })[0];
  return found ? found[1] : null;
}

// The ones under As needed that the patient didn't add.
function othersAsNeeded(groups) {
  return groups.asNeeded.filter(function (row) { return !row.added; });
}

// What an empty part says. "None" only when that much is known. Null when
// a source's own word (medicineNotices) is all there is to say.
export function emptyPartText(groups, part) {
  if (part === "records") {
    if (groups.incomplete) return "None loaded.";
    var elsewhere = [(groups.disagree || []).length ? DISAGREE_TITLE : null, othersAsNeeded(groups).length ? "As needed" : null].filter(Boolean);
    if ((groups.noMedicines || []).length && !groups.unnamed && !elsewhere.length) return null;
    // The parts the records' medicines are under instead (the developer, 2026-11-25).
    if (!groups.unnamed) return elsewhere.length ? "All under " + elsewhere.join(", and ") + "." : "No medicines from records.";
    return othersAsNeeded(groups).length || groups.patientSaysStopped.length ? "No others with a medicine name." : "None with a medicine name.";
  }
  if (groups.ownMissing) return "Couldn't be opened.";
  if (part === "added" && groups.asNeeded.length > othersAsNeeded(groups).length) return "All under As needed.";
  return part === "added" ? "Nothing added by the patient." : "Nothing marked not taking.";
}

// Some of it didn't load, or no record has a medicine name: no number, which
// would read as the whole.
export function medicinesTitle(groups) {
  return groups.incomplete || (recordsPartial(groups) && !othersAsNeeded(groups).length) ? "Medicines" : "Medicines (" + shareMedicineCount(groups) + ")";
}

export function timeText(timestamp) {
  var date = new Date(timestamp);
  if (isNaN(date)) return "an unknown date";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function savedCopyText(groups) {
  return "The From records part is a copy saved on " + timeText(groups.recordsSavedAt) + ". It may be out of date.";
}

// How old the list is: when the medicines last loaded into Brown Bag, then when
// the code was made. No date for a list that only partly loaded, so a date
// never vouches for it; none either in a code made before it was included.
export function dateLines(groups, format, made) {
  var updated = groups.recordsUpdatedAt || groups.recordsSavedAt;
  var out = [];
  if (groups.incomplete) out.push("Meds: some didn't load");
  else if (updated) out.push("Meds last updated: " + format(updated));
  return out.concat((made || "QR code made") + ": " + format(groups.madeAt));
}

// The allergies' own date (the developer, 2026-11-23: always). None when they didn't
// load, or in a code made before it was included.
export function allergyDateLine(groups, format) {
  var allergies = groups.allergies;
  var date = allergies && (allergies.savedAt || (allergies.status === "loaded" && allergies.updatedAt));
  return date ? "Allergies last updated: " + format(date) : null;
}

// Insurance fills are extra: without them the list still stands, so this is a
// note and not a warning (the developer, 2026-11-23).
export function fillsNote(groups) {
  if (!groups.claimsNotLoaded || groups.incomplete) return null;
  return "Insurance fills couldn't be loaded. That doesn't mean this list is wrong: what's here comes from the records and the patient. A medicine only insurance knows about may not be listed.";
}
