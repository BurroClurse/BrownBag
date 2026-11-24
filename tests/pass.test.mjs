import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { passFromState, clientStateFromPass, savePass, loadPass, deletePass, refreshRefused, withTimeout, storePassFrom, passExpired, PASS_UNUSED_DAYS, allPasses, deleteAllPasses, revokePass } from "../js/pass.js";
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
  const { usedAt, ...rest } = passFromState(STATE);
  assert.deepEqual(rest, {
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

test("storePassFrom saves the pass a sign-in returns", async () => {
  const storage = memoryStorage();
  await storePassFrom(storage, await key(), STATE, "p1-patient-id");
  assert.equal((await loadPass(storage, await key(), "p1-patient-id")).refreshToken, "r1-refresh-token");
});

test("a sign-in that returns no refresh token removes the old pass", async () => {
  const storage = memoryStorage();
  await savePass(storage, await key(), passFromState(STATE));
  await storePassFrom(storage, await key(), { ...STATE, tokenResponse: { access_token: "a2", patient: "p1-patient-id" } }, "p1-patient-id");
  assert.equal(await loadPass(storage, await key(), "p1-patient-id"), null);
});

test("the connection ends after 30 days without opening Brown Bag", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 11, 31);
  assert.equal(PASS_UNUSED_DAYS, 30);
  assert.equal(passExpired({ usedAt: now - 29 * DAY }, now), false);
  assert.equal(passExpired({ usedAt: now - 31 * DAY }, now), true);
  assert.equal(passExpired({}, now), false);
});

test("passFromState stamps when the pass was last used", () => {
  const before = Date.now();
  const pass = passFromState(STATE);
  assert.ok(pass.usedAt >= before && pass.usedAt <= Date.now());
});

const PASS = (patientId, o = {}) => Object.assign({ serverUrl: "https://ehr.example/r4", clientId: "app", tokenUri: "https://ehr.example/auth/token", scope: "s", refreshToken: "r-" + patientId, patientId }, o);

test("sign out reaches everyone who signed in on this phone", async () => {
  const storage = memoryStorage();
  const k = await key();
  await savePass(storage, k, PASS("one"));
  await savePass(storage, k, PASS("two"));
  storage.setItem("brownbag:data:x", "kept");
  assert.deepEqual((await allPasses(storage, k)).map((p) => p.patientId).sort(), ["one", "two"]);
  deleteAllPasses(storage);
  assert.deepEqual(storage.names(), ["brownbag:data:x"]);
});

test("a pass that can't be opened is still deleted at sign out", async () => {
  const storage = memoryStorage();
  await savePass(storage, await key("111111"), PASS("one"));
  assert.deepEqual(await allPasses(storage, await key()), []);
  deleteAllPasses(storage);
  assert.deepEqual(storage.names(), []);
});

test("sign out tells the health system to end the pass, when it offers that", async () => {
  const calls = [];
  const server = (config) => async (url, o = {}) => { calls.push([url, o.method || "GET", o.body && o.body.toString()]); return { ok: true, json: async () => config }; };
  assert.equal(await revokePass(PASS("one"), server({ revocation_endpoint: "https://ehr.example/auth/revoke" })), true);
  assert.equal(calls[0][0], "https://ehr.example/r4/.well-known/smart-configuration");
  assert.deepEqual(calls[1], ["https://ehr.example/auth/revoke", "POST", "token=r-one&token_type_hint=refresh_token&client_id=app"]);
});

test("the pass is never sent to another server, and no answer is no harm", async () => {
  let posted = 0;
  const server = (config) => async (url, o = {}) => { if (o.method === "POST") posted += 1; return { ok: true, json: async () => config }; };
  assert.equal(await revokePass(PASS("one"), server({ revocation_endpoint: "https://evil.example/revoke" })), false);
  assert.equal(await revokePass(PASS("one"), server({ revocation_endpoint: "http://ehr.example/revoke" })), false);
  assert.equal(await revokePass(PASS("one"), server({})), false);
  assert.equal(posted, 0);
  assert.equal(await revokePass(PASS("one"), async () => { throw new Error("offline"); }), false);
});

test("a sign-in with no token address gives no pass", () => {
  assert.equal(passFromState(Object.assign({}, STATE, { tokenUri: undefined })), null);
});
