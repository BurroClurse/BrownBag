// Builds the list a patient shares, as a small FHIR Bundle, and packs it
// into an encrypted link for the QR code. The link holds a random secret;
// the 6-digit code the patient reads out is the other half of the key.
// Two ideas come from SMART Health Cards (HL7 SMART Health Cards and Links
// IG): the Bundle is trimmed (no ids, short "resource:N" references), and
// the packed list is written as digits, which a QR code holds more of.

import { fillNote } from "./claims.js";
import { deriveKeyFromPin, toBase64Url, fromBase64Url, concatBytes } from "./vault.js";

export var QR_MAX_BYTES = 2331;

var SECRET_BYTES = 16;
var IV_BYTES = 12;
var TAG_BYTES = 16;
var PREFIX = "v2.";
var SELF = { reference: "resource:0" };
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
      statement.note.push({ text: "Record marked completed, but filled " + item.completedButFilled });
    }
    if (item.fills) {
      statement.note.push({ text: fillNote(item.fills) });
    }
    entries.push({ resource: statement });
  });
  list.additions.forEach(function (addition) {
    var statement = statementFor(addition.name, addition.rxcui, dosageText(addition), "active");
    statement.informationSource = SELF;
    entries.push({ resource: statement });
  });
  list.stopped.forEach(function (item) {
    var statement = statementFor(item.name, item.rxcui, dosageText(item), "stopped");
    statement.informationSource = SELF;
    statement.effectivePeriod = { end: item.stoppedAt };
    entries.push({ resource: statement });
  });
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
    patientSaysStopped: []
  };
  (bundle.entry || []).forEach(function (entry) {
    var resource = entry.resource || {};
    if (resource.resourceType === "Patient") {
      groups.patient = { name: (resource.name && resource.name[0] && resource.name[0].text) || "", birthDate: resource.birthDate || "" };
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
  if (typeof fragment !== "string" || fragment.indexOf(PREFIX) !== 0) {
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

function statementFor(name, rxcui, dosage, status) {
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
  if (dosage) {
    statement.dosage = [{ text: dosage }];
  }
  return statement;
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
