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

// Opens saved data, and refuses it if it was sealed for someone else: a file
// or the phone's storage edited so one person's list sits under another's
// name. Data saved before sealing has no seal.
async function openFor(key, tag, blob) {
  var data = await decryptJSON(key, blob);
  if (data && data.sealedFor && data.sealedFor !== tag) {
    throw new VaultError("wrong-person", "That data belongs to someone else.");
  }
  return Object.assign({}, data);
}

function tagOf(name) {
  return name.slice(DATA_PREFIX.length);
}

async function loadByName(storage, key, name) {
  var blob = storage.getItem(name);
  var data = blob ? await openFor(key, tagOf(name), blob) : {};
  delete data.sealedFor;
  // Everything saved comes back (the log of changes made without signal too).
  return Object.assign({}, data, {
    additions: data.additions || [],
    stopped: data.stopped || {},
    asNeeded: data.asNeeded || {},
    allergies: data.allergies || [],
    allergyReactions: data.allergyReactions || {},
    unnamedAre: data.unnamedAre || {},
    noKnownAllergies: data.noKnownAllergies || null
  });
}

async function saveByName(storage, key, name, data) {
  var existing = storage.getItem(name);
  if (existing) {
    await openFor(key, tagOf(name), existing);
  }
  storage.setItem(name, await encryptJSON(key, Object.assign({}, data, { sealedFor: tagOf(name) })));
}

// Everyone's data on this phone, opened, by tag, each sealed for its person.
async function everyone(storage, key) {
  var out = {};
  for (var i = 0; i < storage.length; i += 1) {
    var name = storage.key(i);
    if (name && name.indexOf(DATA_PREFIX) === 0) {
      var suffix = tagOf(name);
      var tag = TAG_PATTERN.test(suffix) ? suffix : await idTag(suffix);
      out[tag] = Object.assign(await openFor(key, tag, storage.getItem(name)), { sealedFor: tag });
    }
  }
  return out;
}

// Backups stay encrypted. With Face ID or a fingerprint, restoring needs the
// same passkey, so a lost backup file doesn't expose anything. Version 2 files
// list patients by tag; version 1 files (plain ids) still restore.
export async function exportBackup(storage, key) {
  var data = {};
  for (var entry of Object.entries(await everyone(storage, key))) {
    data[entry[0]] = await encryptJSON(key, entry[1]);
  }
  return JSON.stringify({ app: "brownbag", version: 2, data: data });
}

// Version 3, for a PIN lock: a file locked with a PIN could be opened by
// trying every PIN, so it's locked with its own long password instead. It
// holds no lock settings, and opens on any phone with any lock.
export async function exportPasswordBackup(storage, key, password) {
  var salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  var sealed = await encryptJSON(await keyFromPassword(password, salt), await everyone(storage, key));
  return JSON.stringify({ app: "brownbag", version: 3, salt: toBase64Url(salt), sealed: sealed });
}

// Accented letters can be typed as one character or two; both count as one.
function keyFromPassword(password, salt) {
  return deriveKeyFromPin(String(password).normalize("NFKC"), salt);
}

function parseBackup(text) {
  try {
    var backup = JSON.parse(text);
    return backup && backup.app === "brownbag" ? backup : null;
  } catch (error) {
    return null;
  }
}

export function isPasswordBackup(text) {
  var backup = parseBackup(text);
  return Boolean(backup && backup.version === 3);
}

// What's in a password backup, by tag, for importOpened.
export async function openPasswordBackup(text, password) {
  var backup = parseBackup(text);
  if (!backup || backup.version !== 3 || typeof backup.salt !== "string" || typeof backup.sealed !== "string") {
    throw new VaultError("bad-backup", "That file isn't a Brown Bag backup.");
  }
  try {
    return await decryptJSON(await keyFromPassword(password, fromBase64Url(backup.salt)), backup.sealed);
  } catch (error) {
    throw new VaultError("wrong-password", "That password doesn't open it.");
  }
}

export async function importOpened(storage, key, opened) {
  var restored = [];
  for (var entry of Object.entries(opened || {})) {
    if (!TAG_PATTERN.test(entry[0])) {
      throw new VaultError("bad-backup", "That file isn't a Brown Bag backup.");
    }
    if (entry[1] && entry[1].sealedFor && entry[1].sealedFor !== entry[0]) {
      throw new VaultError("wrong-person", "That data belongs to someone else.");
    }
    restored.push([DATA_PREFIX + entry[0], entry[1]]);
  }
  return merge(storage, key, restored);
}

export async function importBackup(storage, key, text) {
  var backup = parseBackup(text);
  if (!backup || (backup.version !== 1 && backup.version !== 2) || typeof backup.data !== "object" || backup.data === null) {
    throw new VaultError("bad-backup", "That file isn't a Brown Bag backup.");
  }
  var entries = Object.entries(backup.data);
  var restored = [];
  for (var entry of entries) {
    var tag = backup.version === 1 ? await idTag(entry[0]) : entry[0];
    restored.push([DATA_PREFIX + tag, await openFor(key, tag, entry[1])]);
  }
  return merge(storage, key, restored);
}

// Merge, never replace: anything added on this phone since the backup was
// made stays. Additions match by id; a Not taking or As needed mark on
// the phone wins.
async function merge(storage, key, restored) {
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
      unnamedAre: Object.assign({}, fromBackup.unnamedAre || {}, onPhone.unnamedAre),
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
