// Encrypts what the patient adds (and the medicines they mark stopped)
// before it goes into browser storage. Uses Web Crypto, so the same file
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

export async function loadPatientData(storage, key, patientId) {
  var blob = storage.getItem(DATA_PREFIX + patientId);
  if (!blob) {
    return { additions: [], stopped: {} };
  }
  var data = await decryptJSON(key, blob);
  return { additions: data.additions || [], stopped: data.stopped || {} };
}

// Refuses to replace saved data this key can't open, so a mix-up with the
// lock never quietly erases a patient's additions.
export async function savePatientData(storage, key, patientId, data) {
  var existing = storage.getItem(DATA_PREFIX + patientId);
  if (existing) {
    await decryptJSON(key, existing);
  }
  storage.setItem(DATA_PREFIX + patientId, await encryptJSON(key, data));
}

// Backups stay encrypted. Restoring needs the same unlock as the phone that
// made them, so a lost backup file doesn't expose anything.
export async function exportBackup(storage, key) {
  var data = {};
  for (var i = 0; i < storage.length; i += 1) {
    var name = storage.key(i);
    if (name && name.indexOf(DATA_PREFIX) === 0) {
      var blob = storage.getItem(name);
      await decryptJSON(key, blob);
      data[name.slice(DATA_PREFIX.length)] = blob;
    }
  }
  return JSON.stringify({ app: "brownbag", version: 1, data: data });
}

export async function importBackup(storage, key, text) {
  var backup;
  try {
    backup = JSON.parse(text);
  } catch (error) {
    throw new VaultError("bad-backup", "That file isn't a Brown Bag backup.");
  }
  if (!backup || backup.app !== "brownbag" || backup.version !== 1 || typeof backup.data !== "object" || backup.data === null) {
    throw new VaultError("bad-backup", "That file isn't a Brown Bag backup.");
  }
  var entries = Object.entries(backup.data);
  var restored = [];
  for (var entry of entries) {
    restored.push([entry[0], await decryptJSON(key, entry[1])]);
  }
  // Merge, never replace: anything added on this phone since the backup was
  // made stays. Additions match by id; a stopped mark on the phone wins.
  for (var pair of restored) {
    var patientId = pair[0];
    var fromBackup = pair[1] || {};
    var onPhone = await loadPatientData(storage, key, patientId);
    var ids = new Set(onPhone.additions.map(function (a) { return a.id; }));
    var additions = onPhone.additions.concat((fromBackup.additions || []).filter(function (a) { return !ids.has(a.id); }));
    var stopped = Object.assign({}, fromBackup.stopped || {}, onPhone.stopped);
    await savePatientData(storage, key, patientId, { additions: additions, stopped: stopped });
  }
  return restored.length;
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
