// Builds the list a patient shares, as a small FHIR Bundle, and packs it
// into an encrypted link for the QR code. The link holds a random secret;
// the 6-digit code the patient reads out is the other half of the key.
// Two ideas come from SMART Health Cards (HL7 SMART Health Cards and Links
// IG): the Bundle is trimmed (no ids, short "resource:N" references), and
// the packed list is written as digits, which a QR code holds more of.

import { fillNote, completedNote } from "./claims.js";
import { NOT_SURE, UNSPECIFIED, isUnspecified, unspecifiedSentence, noneCode, reactionWords, statementOf, longDate } from "./allergies.js";
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
var FROM_PATIENT = "From the patient";
var QR_MAX_BITS = 18648; // QR_MAX_BYTES x 8: version 40, level M

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

export function buildShareBundle(list, now, warnings = {}) {
  var entries = [{
    resource: {
      resourceType: "Patient",
      name: [{ text: list.patient.name }],
      birthDate: list.patient.birthDate
    }
  }];
  list.current.forEach(function (item) {
    var statement = statementFor(item.name, item.rxcui, dosageText(item), "active");
    if (item.origin === "claims") {
      // Filled through insurance, but not in the health record.
      statement.informationSource = { display: item.source };
      statement.note = [{ text: "Filled, not in the health record" }];
    } else {
      statement.note = [{ text: "From records: " + item.source }];
    }
    if (item.prescriber) {
      statement.note.push({ text: "Prescribed by " + item.prescriber });
    }
    if (item.completedButFilled) {
      statement.note.push({ text: completedNote(item.completedButFilled, item.recordStatus) });
    }
    if (item.fills) {
      statement.note.push({ text: fillNote(item.fills) });
    }
    entries.push({ resource: statement });
  });
  list.additions.forEach(function (addition) {
    var statement = statementFor(addition.name, addition.rxcui, dosageText(addition), "active", addition);
    statement.informationSource = SELF;
    entries.push({ resource: statement });
  });
  list.stopped.forEach(function (item) {
    var statement = statementFor(item.name, item.rxcui, dosageText(item), "stopped");
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
  if (warnings.incomplete) {
    tags.push({ system: TAGS, code: "records-incomplete" });
  }
  if (list.allergies) {
    tags.push({ system: TAGS, code: "allergies-" + warnings.allergies.status });
    if (warnings.allergies.savedAt) {
      tags.push({ system: TAGS, code: "allergies-saved-on", display: warnings.allergies.savedAt });
    }
  }
  if (tags.length) {
    bundle.meta = { tag: tags };
  }
  return bundle;
}

export function groupShareBundle(bundle) {
  var tags = (bundle.meta && bundle.meta.tag) || [];
  var saved = tags.filter(function (tag) { return tag.system === TAGS && tag.code === "records-saved-on"; })[0];
  var groups = {
    patient: null,
    madeAt: bundle.timestamp,
    recordsSavedAt: saved ? saved.display : null,
    incomplete: tags.some(function (tag) { return tag.system === TAGS && tag.code === "records-incomplete"; }),
    fromRecords: [],
    fromClaims: [],
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
    var dosage = resource.dosage && resource.dosage[0] && resource.dosage[0].text;
    var fromPatient = resource.informationSource && resource.informationSource.reference === SELF.reference;
    var fromClaims = resource.informationSource && !resource.informationSource.reference && resource.informationSource.display;
    if (resource.status === "stopped") {
      var stoppedOn = resource.effectivePeriod && resource.effectivePeriod.end;
      groups.patientSaysStopped.push({ name: name, detail: joinDetail([dosage, stoppedOn ? "stopped " + stoppedOn : null]) });
    } else if (fromPatient) {
      groups.addedByPatient.push({ name: name, detail: joinDetail([dosage]) });
    } else if (fromClaims) {
      var fillNotes = (resource.note || []).map(function (n) { return n.text; }).filter(function (t) { return t !== "Filled, not in the health record"; });
      groups.fromClaims.push({ name: name, detail: joinDetail([dosage].concat(fillNotes)) });
    } else {
      var notes = (resource.note || []).map(function (note) { return note.text; });
      groups.fromRecords.push({ name: name, detail: joinDetail([dosage].concat(notes)) });
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
    out.push(allergyResource("Allergic disposition", [UNSPECIFIED]));
  }
  if (allergies.saidNone) {
    var none = allergyResource("No known allergy", [{ system: SNOMED, code: noneCode("No known allergy") }]);
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

function unconfirmed() {
  return { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", code: "unconfirmed" }] };
}

function allergyFor(card) {
  var own = card.origin === "added";
  var resource = allergyResource(card.name, own ? (card.rxcui ? [{ system: RXNORM, code: card.rxcui }] : null) : (card.codes || [card.code]), card.clinical);
  var notes = own ? [] : ["From records: " + card.source];
  if (own || card.unconfirmed) resource.verificationStatus = unconfirmed();
  if (card.intolerance) resource.type = "intolerance";
  if (card.highRisk) resource.criticality = "high";
  if (own) resource.asserter = SELF;
  var reactions = card.reactions.map(function (r) {
    return Object.assign({ manifestation: [{ text: r.text }] }, r.severity ? { severity: r.severity } : {});
  });
  if (card.mine && card.mine.reaction === NOT_SURE) {
    notes.push(own ? "Reaction not known" : "Patient says: reaction not known");
  } else if (card.mine) {
    (card.mine.reactions || [card.mine.reaction]).forEach(function (text) {
      var mine = { manifestation: [{ text: text }] };
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
  return { status: status, savedAt: saved ? saved.display : null, fromRecords: [], fromPatient: [], statements: [], unspecified: 0, saidNone: false };
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
    return;
  }
  var statement = own ? null : statementOf(resource, name);
  if (statement) {
    groups.statements.push(statement);
    return;
  }
  var theirs = [];
  var patients = [];
  (resource.reaction || []).forEach(function (reaction) {
    var text = reactionWords({ text: (reaction.manifestation && reaction.manifestation[0] && reaction.manifestation[0].text) || "", severity: reaction.severity });
    var fromPatient = (reaction.note || []).some(function (n) { return n.text === FROM_PATIENT; });
    (fromPatient ? patients : theirs).push(text);
  });
  var notes = (resource.note || []).map(function (n) { return n.text; });
  if (own) {
    groups.fromPatient.push({ name: name, detail: joinDetail([theirs.length ? "Reaction: " + theirs.join(" · ") : null].concat(notes)) });
    return;
  }
  var notConfirmed = ((resource.verificationStatus && resource.verificationStatus.coding) || []).some(function (c) { return c.code === "unconfirmed"; });
  groups.fromRecords.push({
    name: name,
    detail: joinDetail([
      resource.criticality === "high" ? "Marked high risk" : null,
      resource.type === "intolerance" ? "Intolerance" : null,
      notConfirmed ? "Not confirmed" : null,
      theirs.length ? "Reaction: " + theirs.join(" · ") : "Reaction not in the records",
      patients.length ? "Patient says: " + patients.join(" · ") : null
    ].concat(notes.filter(function (n) { return n.indexOf("Patient says") === 0; }), notes.filter(function (n) { return n.indexOf("Patient says") !== 0; })))
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
  return out.concat(unspecifiedSentence(allergies.unspecified, listed, "Records", "Ask the patient.") || []);
}

export function allergyEmptyText(allergies) {
  if (!allergies) return "This code doesn't include allergies. Ask the patient.";
  if (allergies.fromRecords.length || allergies.fromPatient.length) return null;
  if (allergies.saidNone) return "Patient says: no known allergies.";
  if (allergies.statements.length || allergies.unspecified) return null;
  return allergies.status === "loaded" || allergies.savedAt ? "None in the records. The patient hasn't said." : null;
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

// Counts the bits of a QR code made of two parts: the web address as text
// (byte mode) and the packed list as digits (numeric mode).
export function fitsInQr(prefix, digits) {
  var textBits = 4 + 16 + 8 * new TextEncoder().encode(prefix).length;
  var rest = digits.length % 3;
  var digitBits = 4 + 14 + 10 * Math.floor(digits.length / 3) + (rest === 1 ? 4 : rest === 2 ? 7 : 0);
  return textBits + digitBits <= QR_MAX_BITS;
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
function statementFor(name, rxcui, dosage, status, structured) {
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
  var parts = structuredDosage(structured);
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
