// Builds the list a patient shares, as a small FHIR Bundle, and packs it
// into an encrypted link for the QR code. The link holds a random secret;
// the 6-digit code the patient reads out is the other half of the key.
// Two ideas come from SMART Health Cards (HL7 SMART Health Cards and Links
// IG): the Bundle is trimmed (no ids, short "resource:N" references), and
// the packed list is written as digits, which a QR code holds more of.

import { fillNote, completedNote } from "./claims.js";
import { holdText } from "./meds.js";
import { olderText, dateText, fillRowsFrom, isDirections, takeRows } from "./card.js";
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
export function buildShareBundle(list, now, warnings = {}, level = 0) {
  var entries = [{
    resource: {
      resourceType: "Patient",
      name: [{ text: list.patient.name }],
      birthDate: list.patient.birthDate
    }
  }];
  list.current.forEach(function (item) {
    var statement = statementFor(item.name, item.rxcui, dosageText(item), statusFor(item), null, dosageParts(item, level));
    addCodes(statement, item, level);
    if (item.origin === "claims") {
      // Filled through insurance, but not in the health record.
      statement.informationSource = { display: item.source };
      statement.note = [{ text: CLAIMS_ONLY_NOTE }];
    } else {
      statement.note = [{ text: "From records: " + item.source }];
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
    }
    if (item.asNeededAt) {
      statement.dosage = statement.dosage || [{}];
      statement.dosage[0].asNeededBoolean = true;
      statement.note.push({ text: AS_NEEDED_NOTE });
    } else if (item.prn) {
      statement.dosage = statement.dosage || [{}];
      statement.dosage[0].asNeededBoolean = true;
      statement.note.push({ text: RECORDS_AS_NEEDED_NOTE });
    }
    entries.push({ resource: statement });
  });
  list.additions.forEach(function (addition) {
    var statement = statementFor(addition.name, addition.rxcui, dosageText(addition), "active", withUnitCode(addition, level));
    statement.informationSource = SELF;
    if (addition.older) statement.note = [{ text: OLDER_NOTE + (addition.older.date ? ", " + addition.older.date : "") }];
    entries.push({ resource: statement });
  });
  list.stopped.forEach(function (item) {
    var statement = statementFor(item.name, item.rxcui, dosageText(item), "stopped", null, dosageParts(item, level));
    addCodes(statement, item, level);
    statement.informationSource = SELF;
    statement.effectivePeriod = { end: item.stoppedAt };
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

export function groupShareBundle(bundle) {
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
    fromRecords: [],
    fromClaims: [],
    asNeeded: [],
    addedByPatient: [],
    patientSaysStopped: [],
    allergies: allergyTags(tags)
  };
  (bundle.entry || []).forEach(function (entry) {
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
    var row = Object.assign({ name: name }, cardFrom(resource, fromPatient && !stopped));
    var coded = ((resource.medicationCodeableConcept && resource.medicationCodeableConcept.coding) || []).filter(function (c) { return c.system === RXNORM && c.code; })[0];
    if (coded) row.rxnorm = String(coded.code);
    if (stopped) {
      var stoppedOn = resource.effectivePeriod && resource.effectivePeriod.end;
      if (stoppedOn) row.facts.unshift(["Not taking since", dateText(stoppedOn)]);
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
    // The same length as the real one, without the second the locking takes.
    var packed = await transform(new TextEncoder().encode(JSON.stringify(bundle)), new CompressionStream("deflate-raw"));
    var bytes = SECRET_BYTES + IV_BYTES + packed.length + TAG_BYTES;
    if (bitsIn(baseUrl + "share.html#" + PREFIX, Math.ceil(bytes * 4 / 3) * 2) <= CODED_MAX_BITS) return bundle;
  }
  return buildShareBundle(list, now, warnings, 0);
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

// The notes on a shared medicine, each under its own label.
function cardFrom(resource, added) {
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
    else if ((found = /^(.+, but filled )(\d{4}\S*)$/.exec(text))) card.flags.push(found[1] + dateText(found[2]));
    else if ((found = /^(?:Last filled (\S+)|Filled, dates? not given) \((.+)\), (\d+) fills?$/.exec(text))) card.facts = card.facts.concat(fillRowsFrom(Number(found[3]), found[1], found[2]));
    else if (text === "No fill found in claims") card.facts.push(["Filled", text]);
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
  return groups.fromRecords.length + (groups.fromClaims || []).length + (groups.asNeeded || []).length + groups.addedByPatient.length;
}

// What staff are told about the medicines that aren't listed, right under the
// heading, where it can't be missed.
export function medicineNotices(groups) {
  var out = [];
  if (groups.incomplete) out.push("Some of the patient's records couldn't be loaded. This list may be missing medicines.");
  if (groups.ownMissing) out.push("What the patient added or marked not taking couldn't be opened. Ask the patient.");
  if (groups.unnamed) {
    var one = groups.unnamed === 1;
    out.push("The records also have " + groups.unnamed + (one ? " entry" : " entries") + " with no medicine name, so " + (one ? "it isn't" : "they aren't") + " listed. Ask the patient.");
  }
  return out;
}

export function recordsPartial(groups) {
  return Boolean(groups.incomplete || (groups.unnamed && !groups.fromRecords.length));
}

// The ones under As needed that the patient didn't add.
function othersAsNeeded(groups) {
  return groups.asNeeded.filter(function (row) { return !row.added; });
}

// What an empty part says. "None" only when that much is known.
export function emptyPartText(groups, part) {
  if (part === "records") {
    if (groups.incomplete) return "None loaded.";
    if (!groups.unnamed) return othersAsNeeded(groups).length ? "All under As needed." : "No medicines from records.";
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

// The allergies' own date (Tyler, 2026-11-23: always). None when they didn't
// load, or in a code made before it was included.
export function allergyDateLine(groups, format) {
  var allergies = groups.allergies;
  var date = allergies && (allergies.savedAt || (allergies.status === "loaded" && allergies.updatedAt));
  return date ? "Allergies last updated: " + format(date) : null;
}

// Insurance fills are extra: without them the list still stands, so this is a
// note and not a warning (Tyler, 2026-11-23).
export function fillsNote(groups) {
  if (!groups.claimsNotLoaded || groups.incomplete) return null;
  return "Insurance fills couldn't be loaded. That doesn't mean this list is wrong: what's here comes from the records and the patient. A medicine only insurance knows about may not be listed.";
}
