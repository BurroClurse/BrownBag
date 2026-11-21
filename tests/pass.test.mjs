import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { passFromState, clientStateFromPass, savePass, loadPass, deletePass, refreshRefused, withTimeout } from "../js/pass.js";
import { deriveKeyFromPin, exportBackup, savePatientData } from "../js/vault.js";

// A localStorage stand-in with the parts the app uses.
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    names: () => [...map.keys()],
    dump: () => [...map.entries()].flat().join("\n")
  };
}

const STATE = {
  serverUrl: "https://launch.smarthealthit.org/v/r4/sim/abc/fhir",
  clientId: "my_web_app",
  tokenUri: "https://launch.smarthealthit.org/v/r4/sim/abc/auth/token",
  scope: "launch/patient openid offline_access patient/Patient.read",
  codeVerifier: "secret-verifier",
  tokenResponse: { access_token: "a1", refresh_token: "r1-refresh-token", patient: "p1-patient-id", scope: "s" }
};

async function key(pin = "246810") {
  return deriveKeyFromPin(pin, new Uint8Array(16));
}

test("passFromState keeps only what's needed to update later", () => {
  assert.deepEqual(passFromState(STATE), {
    serverUrl: STATE.serverUrl,
    clientId: "my_web_app",
    tokenUri: STATE.tokenUri,
    scope: STATE.scope,
    refreshToken: "r1-refresh-token",
    patientId: "p1-patient-id"
  });
});

test("passFromState gives nothing when the server sent no refresh token", () => {
  assert.equal(passFromState({ ...STATE, tokenResponse: { access_token: "a1", patient: "p1" } }), null);
  assert.equal(passFromState({}), null);
});

test("clientStateFromPass rebuilds a state fhirclient can refresh from", () => {
  const rebuilt = clientStateFromPass(passFromState(STATE));
  assert.equal(rebuilt.serverUrl, STATE.serverUrl);
  assert.equal(rebuilt.clientId, "my_web_app");
  assert.equal(rebuilt.tokenUri, STATE.tokenUri);
  assert.equal(rebuilt.tokenResponse.refresh_token, "r1-refresh-token");
  assert.equal(rebuilt.tokenResponse.patient, "p1-patient-id");
});

test("a saved pass is encrypted and comes back with the same key", async () => {
  const storage = memoryStorage();
  const pass = passFromState(STATE);
  await savePass(storage, await key(), pass);
  assert.deepEqual(await loadPass(storage, await key(), "p1-patient-id"), pass);
  assert.ok(storage.names().every((n) => n.startsWith("brownbag:pass:")));
  assert.ok(!storage.dump().includes("r1-refresh-token"));
  assert.ok(!storage.dump().includes("p1-patient-id"));
});

test("loadPass gives nothing for another patient, a wrong key, or after deletePass", async () => {
  const storage = memoryStorage();
  await savePass(storage, await key(), passFromState(STATE));
  assert.equal(await loadPass(storage, await key(), "someone-else"), null);
  assert.equal(await loadPass(storage, await key("135790"), "p1-patient-id"), null);
  await deletePass(storage, "p1-patient-id");
  assert.equal(await loadPass(storage, await key(), "p1-patient-id"), null);
});

test("backup files never carry the pass", async () => {
  const storage = memoryStorage();
  const k = await key();
  await savePatientData(storage, k, "p1-patient-id", { additions: [], stopped: {} });
  await savePass(storage, k, passFromState(STATE));
  const passName = storage.names().find((n) => n.startsWith("brownbag:pass:"));
  const backup = await exportBackup(storage, k);
  assert.ok(!backup.includes(storage.getItem(passName)));
  assert.ok(!backup.includes("brownbag:pass:"));
});

test("refreshRefused tells a refused pass from a network problem", () => {
  assert.equal(refreshRefused({ status: 400 }), true);
  assert.equal(refreshRefused({ status: 401 }), true);
  assert.equal(refreshRefused({ response: { status: 400 } }), true);
  assert.equal(refreshRefused(new TypeError("Failed to fetch")), false);
  assert.equal(refreshRefused({ name: "TimeoutError" }), false);
  assert.equal(refreshRefused({ status: 500 }), false);
  assert.equal(refreshRefused(null), false);
});

test("withTimeout gives up after the time and passes results through", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10), (error) => error.name === "TimeoutError");
  assert.equal(await withTimeout(Promise.resolve(3), 10), 3);
});

test("the pass module is kept for offline use", () => {
  const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.ok(worker.includes('"./js/pass.js"'));
});
