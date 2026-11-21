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
    var patientId = await decryptJSON(key, last);
    var blob = storage.getItem(RECORDS_PREFIX + await idTag(patientId));
    return blob ? await decryptJSON(key, blob) : null;
  } catch (error) {
    return null;
  }
}

// The saved list's date for the notes on home: "Nov 21", with the year only
// when it isn't this year.
export function listDate(savedAt, now) {
  var date = new Date(savedAt);
  var text = MONTHS[date.getMonth()] + " " + date.getDate();
  return date.getFullYear() === now.getFullYear() ? text : text + ", " + date.getFullYear();
}
