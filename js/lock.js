// The lock that opens Brown Bag. It never stores the key itself: the key
// comes back from Face ID or fingerprint (a passkey with the WebAuthn "prf"
// extension), or from a 6-digit PIN where the phone can't do that.
// Only how to rebuild the key is saved, plus a small encrypted check value
// that tells a right PIN from a wrong one.
// Browser objects are passed in (storage, credentials, hostname) so Node's
// tests can use stand-ins; in the page they default to the real ones.

import { deriveKeyFromPin, keyFromPrf, encryptJSON, decryptJSON, toBase64Url, fromBase64Url } from "./vault.js";

export var LOCK_KEY = "brownbag:lock";

var CHECK_VALUE = "brownbag-lock-check";
var PIN_PATTERN = /^\d{6}$/;

export class LockError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "LockError";
    this.code = code;
  }
}

export function hasLock(storage = globalThis.localStorage) {
  return Boolean(storage && storage.getItem(LOCK_KEY));
}

var setupInFlight = null;

// With a pin: PIN lock. Without: try a passkey; throws "needs-pin" when the
// phone or browser can't make one, so the page can ask for a PIN instead.
// A second call while one is still running (a double tap) gets the same
// lock, never a second one with a different key.
export function setupLock(options) {
  if (!setupInFlight) {
    setupInFlight = makeLock(options).finally(function () {
      setupInFlight = null;
    });
  }
  return setupInFlight;
}

async function makeLock({ pin, storage = globalThis.localStorage, credentials = defaultCredentials(), hostname = defaultHostname() } = {}) {
  if (pin !== undefined) {
    if (!PIN_PATTERN.test(String(pin))) {
      throw new LockError("bad-pin");
    }
    var pinSalt = randomBytes(16);
    var pinKey = await deriveKeyFromPin(String(pin), pinSalt);
    await saveLock(storage, pinKey, { method: "pin", salt: toBase64Url(pinSalt) });
    return pinKey;
  }
  if (!credentials || typeof credentials.create !== "function") {
    throw new LockError("needs-pin");
  }
  var salt = randomBytes(32);
  var created;
  try {
    created = await credentials.create({
      publicKey: {
        rp: { name: "Brown Bag", id: hostname },
        user: { id: randomBytes(16), name: "Brown Bag", displayName: "Brown Bag" },
        challenge: randomBytes(32),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
        extensions: { prf: { eval: { first: salt } } }
      }
    });
  } catch (error) {
    throw passkeyError(error);
  }
  var prf = (created && created.getClientExtensionResults().prf) || {};
  if (!prf.enabled) {
    throw new LockError("needs-pin");
  }
  var credentialId = new Uint8Array(created.rawId);
  // Some phones only report PRF support at set-up, so one more prompt gets the output.
  var output = prf.results && prf.results.first
    ? prf.results.first
    : await passkeyOutput(credentials, hostname, credentialId, salt);
  var key = await keyFromPrf(output);
  await saveLock(storage, key, { method: "passkey", credentialId: toBase64Url(credentialId), salt: toBase64Url(salt) });
  return key;
}

// "record" lets the restore flow try a backup's lock settings before they
// are saved, so a failed restore leaves nothing behind.
export async function unlock({ pin, storage = globalThis.localStorage, credentials = defaultCredentials(), hostname = defaultHostname(), record } = {}) {
  var saved = record ? parseLock(record) : readLock(storage);
  if (!saved) {
    throw new LockError("no-lock");
  }
  var key;
  if (saved.method === "pin") {
    if (!PIN_PATTERN.test(String(pin || ""))) {
      throw new LockError("wrong-pin");
    }
    key = await deriveKeyFromPin(String(pin), fromBase64Url(saved.salt));
  } else {
    if (!credentials || typeof credentials.get !== "function") {
      throw new LockError("needs-pin");
    }
    key = await keyFromPrf(await passkeyOutput(credentials, hostname, fromBase64Url(saved.credentialId), fromBase64Url(saved.salt)));
  }
  try {
    await decryptJSON(key, saved.check);
  } catch (error) {
    throw new LockError(saved.method === "pin" ? "wrong-pin" : "wrong-key");
  }
  return key;
}

export function lockMethod(storage = globalThis.localStorage) {
  var saved = readLock(storage);
  return saved ? saved.method : null;
}

async function passkeyOutput(credentials, hostname, credentialId, salt) {
  var result;
  try {
    result = await credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: hostname,
        allowCredentials: [{ type: "public-key", id: credentialId }],
        userVerification: "required",
        extensions: { prf: { eval: { first: salt } } }
      }
    });
  } catch (error) {
    throw passkeyError(error);
  }
  var prf = result && result.getClientExtensionResults().prf;
  if (!prf || !prf.results || !prf.results.first) {
    throw new LockError("needs-pin");
  }
  return prf.results.first;
}

// NotAllowedError is what browsers give when the person cancels or the
// prompt times out. Anything else means passkeys can't work here, such as a
// plain IP address, which WebAuthn refuses.
function passkeyError(error) {
  if (error && error.name === "NotAllowedError") {
    return new LockError("cancelled");
  }
  return new LockError("needs-pin", error && error.message);
}

async function saveLock(storage, key, record) {
  record.check = await encryptJSON(key, CHECK_VALUE);
  storage.setItem(LOCK_KEY, JSON.stringify(record));
}

// "Start over" for a forgotten PIN or a lost passkey. Records come back at
// the next sign-in; additions and stopped marks come back from a backup.
export function eraseBrownBag(storage = globalThis.localStorage) {
  var names = [];
  for (var i = 0; i < storage.length; i += 1) {
    var name = storage.key(i);
    if (name && name.indexOf("brownbag:") === 0) names.push(name);
  }
  names.forEach(function (name) { storage.removeItem(name); });
}

function readLock(storage) {
  return parseLock(storage && storage.getItem(LOCK_KEY));
}

function parseLock(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function randomBytes(count) {
  return globalThis.crypto.getRandomValues(new Uint8Array(count));
}

function defaultCredentials() {
  return globalThis.navigator && globalThis.PublicKeyCredential ? globalThis.navigator.credentials : null;
}

function defaultHostname() {
  return globalThis.location ? globalThis.location.hostname : "";
}
