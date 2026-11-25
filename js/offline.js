// Keeps the last records list on the phone, encrypted with the lock's key,
// so Brown Bag still shows it (and makes the QR code) with no signal.

import { encryptJSON, decryptJSON, idTag } from "./vault.js";

var RECORDS_PREFIX = "brownbag:records:";
var LAST_KEY = "brownbag:records:last";
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The patient id is health data too, so even the "which patient was last"
// pointer is encrypted.
export async function saveRecords(storage, key, saved) {
  storage.setItem(RECORDS_PREFIX + await idTag(saved.patientId), await encryptJSON(key, saved));
  storage.setItem(LAST_KEY, await encryptJSON(key, saved.patientId));
}

// Whether there's a saved list for an unlock to open. Needs no key: it only
// checks the encrypted pointer exists.
export function hasSavedList(storage) {
  return storage.getItem(LAST_KEY) !== null;
}

export async function loadLastRecords(storage, key) {
  var last = storage.getItem(LAST_KEY);
  if (!last) {
    return null;
  }
  try {
    return await loadRecordsFor(storage, key, await decryptJSON(key, last));
  } catch (error) {
    return null;
  }
}

export async function loadRecordsFor(storage, key, patientId) {
  try {
    var blob = storage.getItem(RECORDS_PREFIX + await idTag(patientId));
    return blob ? await decryptJSON(key, blob) : null;
  } catch (error) {
    return null;
  }
}

// The list's part of the saved copy: every card with its group, and which
// sources stayed out, didn't load or said they have no medicines. The
// ingredient map is looked up again.
export function splitToSave(split) {
  return {
    current: split.current,
    older: split.older,
    placeholders: split.placeholders || 0,
    noMedicines: split.noMedicines || [],
    heldBack: Boolean(split.heldBack),
    claims: split.claims || null,
    keptOut: split.keptOut || [],
    sourceStatus: split.sourceStatus || []
  };
}

// A saved copy as a list again. One saved before sources were joined has
// no groups and no source notes, and opens as it did; the next update
// rebuilds it.
export function splitFromSaved(saved) {
  return {
    current: saved.current,
    older: saved.older,
    failed: false,
    placeholders: saved.placeholders || 0,
    noMedicines: saved.noMedicines || [],
    heldBack: Boolean(saved.heldBack),
    claims: saved.claims || null,
    keptOut: saved.keptOut || [],
    sourceStatus: saved.sourceStatus || []
  };
}

// The saved list's date for the notes on home: "Nov 21", with the year only
// when it isn't this year.
export function listDate(savedAt, now) {
  var date = new Date(savedAt);
  var text = MONTHS[date.getMonth()] + " " + date.getDate();
  return date.getFullYear() === now.getFullYear() ? text : text + ", " + date.getFullYear();
}
