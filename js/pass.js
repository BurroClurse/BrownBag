// The pass: the long-lasting refresh token the health system hands Brown Bag
// when it asks for offline_access. With it, unlocking Brown Bag updates the
// list without the sign-in page. It is kept encrypted with the lock's key,
// one per patient, and never goes into a backup file (vault.js only backs up
// brownbag:data: items).

import { encryptJSON, decryptJSON, idTag } from "./vault.js";

var PASS_PREFIX = "brownbag:pass:";
// Brown Bag ends the connection itself after this many days without being
// opened (Tyler, 2026-11-21), so a lost or unused phone stops being connected.
export var PASS_UNUSED_DAYS = 30;

// Only what's needed to trade the pass for fresh access later. Null when the
// server sent no refresh token, which leaves Brown Bag working as before.
export function passFromState(fhirState) {
  var token = fhirState && fhirState.tokenResponse;
  if (!token || !token.refresh_token) {
    return null;
  }
  return {
    serverUrl: fhirState.serverUrl,
    clientId: fhirState.clientId,
    tokenUri: fhirState.tokenUri,
    scope: fhirState.scope,
    refreshToken: token.refresh_token,
    patientId: token.patient,
    usedAt: Date.now()
  };
}

// A pass from before this rule has no usedAt; it counts as used now.
export function passExpired(pass, now) {
  if (!pass || !pass.usedAt) {
    return false;
  }
  return now - pass.usedAt > PASS_UNUSED_DAYS * 24 * 60 * 60 * 1000;
}

// The state FHIR.client() takes; client.refresh() then gets fresh access.
export function clientStateFromPass(pass) {
  return {
    serverUrl: pass.serverUrl,
    clientId: pass.clientId,
    tokenUri: pass.tokenUri,
    scope: pass.scope,
    tokenResponse: { refresh_token: pass.refreshToken, patient: pass.patientId, scope: pass.scope }
  };
}

export async function savePass(storage, key, pass) {
  storage.setItem(PASS_PREFIX + await idTag(pass.patientId), await encryptJSON(key, pass));
}

export async function loadPass(storage, key, patientId) {
  var blob = storage.getItem(PASS_PREFIX + await idTag(patientId));
  if (!blob) {
    return null;
  }
  try {
    return await decryptJSON(key, blob);
  } catch (error) {
    return null;
  }
}

export async function deletePass(storage, patientId) {
  storage.removeItem(PASS_PREFIX + await idTag(patientId));
}

// After a sign-in: keep the pass it returned, or, if it returned none (the
// patient said no to staying signed in), remove the old one.
export async function storePassFrom(storage, key, fhirState, patientId) {
  var pass = passFromState(fhirState);
  if (pass) {
    await savePass(storage, key, pass);
  } else if (patientId) {
    await deletePass(storage, patientId);
  }
}

// The token server said no (the pass ended or was withdrawn). Anything else,
// like no signal or a slow server, keeps the pass for next time.
export function refreshRefused(error) {
  if (!error) {
    return false;
  }
  var status = error.status || (error.response && error.response.status);
  return status === 400 || status === 401;
}

export function withTimeout(promise, ms) {
  var timer;
  var timeout = new Promise(function (resolve, reject) {
    timer = setTimeout(function () {
      var error = new Error("Took longer than " + ms + " ms.");
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(function () {
    clearTimeout(timer);
  });
}
