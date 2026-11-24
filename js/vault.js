// Encrypts what the patient adds (and the medicines they mark Not taking or
// As needed) before it goes into browser storage. Uses Web Crypto, so the same file
// runs in the browser and in Node's tests.

var subtle = globalThis.crypto.subtle;

var PBKDF2_ITERATIONS = 600000;
var IV_BYTES = 12;
var DATA_PREFIX = "brownbag:data:";

export class VaultError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "VaultError";
    this.code = code;
  }
}

export async function deriveKeyFromPin(pin, salt) {
  var material = await subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// The passkey's PRF output is already random, so HKDF only shapes it into a key.
export async function keyFromPrf(prfOutput) {
  var material = await subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("brownbag-vault") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJSON(key, value) {
  var iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  var plain = new TextEncoder().encode(JSON.stringify(value));
  var sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plain));
  return toBase64Url(concatBytes(iv, sealed));
}

export async function decryptJSON(key, blob) {
  try {
    var bytes = fromBase64Url(blob);
    var plain = await subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) }, key, bytes.slice(IV_BYTES));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (error) {
    throw new VaultError("locked", "Could not unlock the saved data.");
  }
}

// Saved data is filed under a one-way tag of the patient id, so the id
// itself is never readable in the phone's storage or in a backup file.
// Data saved before that (under the plain id) is moved on first use.
export async function idTag(patientId) {
  var digest = await subtle.digest("SHA-256", new TextEncoder().encode("brownbag:" + patientId));
  return Array.from(new Uint8Array(digest).slice(0, 12), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

var TAG_PATTERN = /^[0-9a-f]{24}$/;

async function nameFor(storage, patientId) {
  var name = DATA_PREFIX + await idTag(patientId);
  var legacy = DATA_PREFIX + patientId;
  if (!storage.getItem(name) && storage.getItem(legacy)) {
    storage.setItem(name, storage.getItem(legacy));
    storage.removeItem(legacy);
  }
  return name;
}

export async function loadPatientData(storage, key, patientId) {
  return loadByName(storage, key, await nameFor(storage, patientId));
}

// Refuses to replace saved data this key can't open, so a mix-up with the
// lock never quietly erases a patient's additions.
export async function savePatientData(storage, key, patientId, data) {
  await saveByName(storage, key, await nameFor(storage, patientId), data);
}

async function loadByName(storage, key, name) {
  var blob = storage.getItem(name);
  var data = blob ? await decryptJSON(key, blob) : {};
  // Everything saved comes back (the log of changes made without signal too).
  return Object.assign({}, data, {
    additions: data.additions || [],
    stopped: data.stopped || {},
    asNeeded: data.asNeeded || {},
    allergies: data.allergies || [],
    allergyReactions: data.allergyReactions || {},
    noKnownAllergies: data.noKnownAllergies || null
  });
}

async function saveByName(storage, key, name, data) {
  var existing = storage.getItem(name);
  if (existing) {
    await decryptJSON(key, existing);
  }
  storage.setItem(name, await encryptJSON(key, data));
}

// Backups stay encrypted. Restoring needs the same unlock as the phone that
// made them, so a lost backup file doesn't expose anything. Version 2 files
// list patients by tag; version 1 files (plain ids) still restore.
export async function exportBackup(storage, key) {
  var data = {};
  for (var i = 0; i < storage.length; i += 1) {
    var name = storage.key(i);
    if (name && name.indexOf(DATA_PREFIX) === 0) {
      var blob = storage.getItem(name);
      await decryptJSON(key, blob);
      var suffix = name.slice(DATA_PREFIX.length);
      data[TAG_PATTERN.test(suffix) ? suffix : await idTag(suffix)] = blob;
    }
  }
  return JSON.stringify({ app: "brownbag", version: 2, data: data });
}

export async function importBackup(storage, key, text) {
  var backup;
  try {
    backup = JSON.parse(text);
  } catch (error) {
    throw new VaultError("bad-backup", "That file isn't a Brown Bag backup.");
  }
  if (!backup || backup.app !== "brownbag" || (backup.version !== 1 && backup.version !== 2) || typeof backup.data !== "object" || backup.data === null) {
    throw new VaultError("bad-backup", "That file isn't a Brown Bag backup.");
  }
  var entries = Object.entries(backup.data);
  var restored = [];
  for (var entry of entries) {
    var tag = backup.version === 1 ? await idTag(entry[0]) : entry[0];
    restored.push([DATA_PREFIX + tag, await decryptJSON(key, entry[1])]);
  }
  // Merge, never replace: anything added on this phone since the backup was
  // made stays. Additions match by id; a Not taking or As needed mark on
  // the phone wins.
  for (var pair of restored) {
    var fromBackup = pair[1] || {};
    var onPhone = await loadByName(storage, key, pair[0]);
    var additions = joinById(onPhone.additions, fromBackup.additions);
    var allergies = joinById(onPhone.allergies, fromBackup.allergies);
    var stopped = Object.assign({}, fromBackup.stopped || {}, onPhone.stopped);
    await saveByName(storage, key, pair[0], Object.assign({}, fromBackup, onPhone, {
      additions: additions,
      stopped: stopped,
      asNeeded: Object.assign({}, fromBackup.asNeeded || {}, onPhone.asNeeded),
      allergies: allergies,
      allergyReactions: Object.assign({}, fromBackup.allergyReactions || {}, onPhone.allergyReactions),
      // "No known allergies" can't stand next to an allergy.
      noKnownAllergies: allergies.length ? null : (onPhone.noKnownAllergies || fromBackup.noKnownAllergies || null),
      changes: joinChanges(onPhone.changes, fromBackup.changes)
    }));
  }
  return restored.length;
}

function joinById(onPhone, fromBackup) {
  var ids = new Set(onPhone.map(function (a) { return a.id; }));
  return onPhone.concat((fromBackup || []).filter(function (a) { return !ids.has(a.id); }));
}

// Both logs, without repeats. A change undone on one side only stays listed:
// saying too much is better than losing the warning.
function joinChanges(onPhone, fromBackup) {
  var joined = (onPhone || []).slice();
  (fromBackup || []).forEach(function (change) {
    var known = joined.some(function (c) { return c.kind === change.kind && c.name === change.name; });
    if (!known) joined.push(change);
  });
  return joined;
}

export function toBase64Url(bytes) {
  var text = "";
  bytes.forEach(function (byte) {
    text += String.fromCharCode(byte);
  });
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64Url(text) {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text)) {
    throw new Error("Not base64url");
  }
  var binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function concatBytes() {
  var parts = Array.from(arguments);
  var total = parts.reduce(function (sum, part) { return sum + part.length; }, 0);
  var out = new Uint8Array(total);
  var offset = 0;
  parts.forEach(function (part) {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}
