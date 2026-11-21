// Keeps the last records list on the phone, encrypted with the lock's key,
// so Brown Bag still shows it (and makes the QR code) with no signal.

import { encryptJSON, decryptJSON } from "./vault.js";

var RECORDS_PREFIX = "brownbag:records:";
var LAST_KEY = "brownbag:records:last";
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The patient id is health data too, so even the "which patient was last"
// pointer is encrypted.
export async function saveRecords(storage, key, saved) {
  storage.setItem(RECORDS_PREFIX + await idTag(saved.patientId), await encryptJSON(key, saved));
  storage.setItem(LAST_KEY, await encryptJSON(key, saved.patientId));
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

export function offlineNotice(savedAt) {
  return "No connection. Showing your list saved on " + shortDate(savedAt) + ". It may be out of date.";
}

// On weak Wi-Fi the phone can say it's online while sign-in still can't
// work, so a saved list shows whenever sign-in isn't available.
export function savedNotice(savedAt, online) {
  return online
    ? "Showing your list saved on " + shortDate(savedAt) + ". Sign in to update it."
    : offlineNotice(savedAt);
}

function shortDate(iso) {
  var date = new Date(iso);
  return MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
}

// A one-way tag for the storage name, so the patient id isn't readable there.
async function idTag(patientId) {
  var digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode("brownbag:" + patientId));
  return Array.from(new Uint8Array(digest).slice(0, 12), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
