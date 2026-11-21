import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveKeyFromPin,
  keyFromPrf,
  encryptJSON,
  decryptJSON,
  loadPatientData,
  savePatientData,
  exportBackup,
  importBackup,
  VaultError
} from "../js/vault.js";

function memoryStorage() {
  var map = new Map();
  return {
    map: map,
    getItem: function (key) { return map.has(key) ? map.get(key) : null; },
    setItem: function (key, value) { map.set(key, String(value)); },
    get length() { return map.size; },
    key: function (index) { return Array.from(map.keys())[index] ?? null; }
  };
}

var SALT = new Uint8Array(16).fill(7);
var keyA = deriveKeyFromPin("123456", SALT);
var keyB = deriveKeyFromPin("654321", SALT);

var VITAMIN = { id: "a1", rxcui: null, name: "Vitamin D3", dose: "2000 IU", frequency: "daily", addedAt: "2026-11-17" };

test("round trip with a PIN key returns the same object", async () => {
  var value = { additions: [VITAMIN], stopped: { "rx:314076": "2026-10-01" } };
  var blob = await encryptJSON(await keyA, value);
  assert.deepEqual(await decryptJSON(await keyA, blob), value);
});

test("wrong PIN throws VaultError locked", async () => {
  var blob = await encryptJSON(await keyA, { a: 1 });
  await assert.rejects(decryptJSON(await keyB, blob), (error) => error instanceof VaultError && error.code === "locked");
});

test("a damaged blob throws VaultError locked", async () => {
  await assert.rejects(decryptJSON(await keyA, "not-a-blob"), (error) => error instanceof VaultError && error.code === "locked");
});

test("stored text does not contain the medicine name", async () => {
  var storage = memoryStorage();
  await savePatientData(storage, await keyA, "p1", { additions: [VITAMIN], stopped: {} });
  var raw = storage.getItem("brownbag:data:p1");
  assert.ok(raw);
  assert.ok(!raw.includes("Vitamin"));
});

test("nothing stored gives empty patient data", async () => {
  assert.deepEqual(await loadPatientData(memoryStorage(), await keyA, "p1"), { additions: [], stopped: {} });
});

test("two patients are stored separately", async () => {
  var storage = memoryStorage();
  await savePatientData(storage, await keyA, "p1", { additions: [VITAMIN], stopped: {} });
  await savePatientData(storage, await keyA, "p2", { additions: [], stopped: { "rx:1": "2026-01-01" } });
  assert.equal((await loadPatientData(storage, await keyA, "p1")).additions[0].name, "Vitamin D3");
  assert.deepEqual((await loadPatientData(storage, await keyA, "p2")).stopped, { "rx:1": "2026-01-01" });
});

test("keyFromPrf gives a key that round trips", async () => {
  var key = await keyFromPrf(new Uint8Array(32).fill(3).buffer);
  var blob = await encryptJSON(key, { ok: true });
  assert.deepEqual(await decryptJSON(key, blob), { ok: true });
});

test("backup then restore into empty storage brings both patients back", async () => {
  var storage = memoryStorage();
  await savePatientData(storage, await keyA, "p1", { additions: [VITAMIN], stopped: {} });
  await savePatientData(storage, await keyA, "p2", { additions: [], stopped: { "rx:1": "2026-01-01" } });
  storage.setItem("brownbag:lock", "{}");
  var text = await exportBackup(storage, await keyA);

  var fresh = memoryStorage();
  assert.equal(await importBackup(fresh, await keyA, text), 2);
  assert.equal((await loadPatientData(fresh, await keyA, "p1")).additions[0].name, "Vitamin D3");
  assert.equal(fresh.getItem("brownbag:lock"), null);
});

test("restoring someone else's backup throws locked", async () => {
  var storage = memoryStorage();
  await savePatientData(storage, await keyA, "p1", { additions: [VITAMIN], stopped: {} });
  var text = await exportBackup(storage, await keyA);
  await assert.rejects(importBackup(memoryStorage(), await keyB, text), (error) => error instanceof VaultError && error.code === "locked");
});

test("restoring hello throws bad-backup", async () => {
  await assert.rejects(importBackup(memoryStorage(), await keyA, "hello"), (error) => error instanceof VaultError && error.code === "bad-backup");
});

test("the backup text does not contain a medicine name", async () => {
  var storage = memoryStorage();
  await savePatientData(storage, await keyA, "p1", { additions: [VITAMIN], stopped: {} });
  assert.ok(!(await exportBackup(storage, await keyA)).includes("Vitamin"));
});

test("savePatientData won't overwrite saved data it can't open", async () => {
  const storage = memoryStorage();
  const right = await deriveKeyFromPin("123456", new Uint8Array(16));
  const wrong = await deriveKeyFromPin("654321", new Uint8Array(16));
  await savePatientData(storage, right, "p-1", { additions: [{ id: "a" }], stopped: {} });
  await assert.rejects(savePatientData(storage, wrong, "p-1", { additions: [], stopped: {} }), (error) => error instanceof VaultError && error.code === "locked");
  assert.deepEqual((await loadPatientData(storage, right, "p-1")).additions, [{ id: "a" }]);
});

test("restoring a backup keeps what was added since, and adds what the backup had", async () => {
  const storage = memoryStorage();
  const key = await deriveKeyFromPin("123456", new Uint8Array(16));
  await savePatientData(storage, key, "p-1", { additions: [{ id: "old", name: "Fish oil" }], stopped: { "rx:1": "2026-10-01" } });
  const backup = await exportBackup(storage, key);
  await savePatientData(storage, key, "p-1", { additions: [{ id: "new", name: "Vitamin D" }], stopped: { "rx:2": "2026-11-20" } });
  assert.equal(await importBackup(storage, key, backup), 1);
  const data = await loadPatientData(storage, key, "p-1");
  assert.deepEqual(data.additions.map((a) => a.id).sort(), ["new", "old"]);
  assert.deepEqual(Object.keys(data.stopped).sort(), ["rx:1", "rx:2"]);
});
