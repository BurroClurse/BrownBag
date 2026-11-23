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
    removeItem: function (key) { map.delete(key); },
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
  var raw = Array.from(storage.map.values()).join("\n");
  assert.ok(raw);
  assert.ok(!raw.includes("Vitamin"));
});

test("nothing stored gives empty patient data", async () => {
  assert.deepEqual(await loadPatientData(memoryStorage(), await keyA, "p1"), { additions: [], stopped: {}, allergies: [], allergyReactions: {}, noKnownAllergies: null });
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

test("saved additions don't show the patient id in storage", async () => {
  const storage = memoryStorage();
  const key = await deriveKeyFromPin("123456", new Uint8Array(16));
  await savePatientData(storage, key, "patient-7f3a9c-sandbox", { additions: [], stopped: {} });
  const names = [];
  for (let i = 0; i < storage.length; i += 1) names.push(storage.key(i));
  assert.ok(names.every((name) => !name.includes("patient-7f3a9c-sandbox")));
  const backup = await exportBackup(storage, key);
  assert.ok(!backup.includes("patient-7f3a9c-sandbox"));
});

test("additions saved the old way still load, and move to the new name", async () => {
  const storage = memoryStorage();
  const key = await deriveKeyFromPin("123456", new Uint8Array(16));
  storage.setItem("brownbag:data:p-old", await encryptJSON(key, { additions: [{ id: "a" }], stopped: {} }));
  assert.deepEqual((await loadPatientData(storage, key, "p-old")).additions, [{ id: "a" }]);
  assert.equal(storage.getItem("brownbag:data:p-old"), null);
  assert.deepEqual((await loadPatientData(storage, key, "p-old")).additions, [{ id: "a" }]);
});

test("a backup made the old way still restores", async () => {
  const storage = memoryStorage();
  const key = await deriveKeyFromPin("123456", new Uint8Array(16));
  const old = JSON.stringify({ app: "brownbag", version: 1, data: { "p-old": await encryptJSON(key, { additions: [{ id: "a" }], stopped: {} }) } });
  assert.equal(await importBackup(storage, key, old), 1);
  assert.deepEqual((await loadPatientData(storage, key, "p-old")).additions, [{ id: "a" }]);
});

test("the log of changes made without signal is kept when Brown Bag reopens", async () => {
  const storage = memoryStorage();
  const key = await keyA;
  const changes = [{ kind: "added", name: "Zinc", checked: false }];
  await savePatientData(storage, key, "p1", { additions: [], stopped: {}, changes });
  assert.deepEqual((await loadPatientData(storage, key, "p1")).changes, changes);
});

test("restoring a backup keeps the change log, joined without repeats", async () => {
  const key = await keyA;
  const there = memoryStorage();
  await savePatientData(there, key, "p1", { additions: [], stopped: {}, changes: [{ kind: "added", name: "Zinc", checked: false }, { kind: "stopped", name: "Aspirin" }] });
  const backup = await exportBackup(there, key);
  const here = memoryStorage();
  await savePatientData(here, key, "p1", { additions: [], stopped: {}, changes: [{ kind: "stopped", name: "Aspirin" }] });
  await importBackup(here, key, backup);
  assert.deepEqual((await loadPatientData(here, key, "p1")).changes, [{ kind: "stopped", name: "Aspirin" }, { kind: "added", name: "Zinc", checked: false }]);
  const empty = memoryStorage();
  await importBackup(empty, key, backup);
  assert.equal((await loadPatientData(empty, key, "p1")).changes.length, 2);
});

test("saved data from before allergies loads with the allergy fields empty", async () => {
  const storage = memoryStorage();
  await savePatientData(storage, await keyA, "p1", { additions: [], stopped: {} });
  const data = await loadPatientData(storage, await keyA, "p1");
  assert.deepEqual([data.allergies, data.allergyReactions, data.noKnownAllergies], [[], {}, null]);
  assert.deepEqual((await loadPatientData(memoryStorage(), await keyA, "p2")).allergies, []);
});

test("restoring a backup joins allergies and the phone's reaction wins", async () => {
  const key = await keyA;
  const there = memoryStorage();
  await savePatientData(there, key, "p1", { additions: [], stopped: {}, allergies: [{ id: "a", name: "Latex" }, { id: "b", name: "Eggs" }], allergyReactions: { k1: { reaction: "Old" }, k2: { reaction: "Rash" } }, noKnownAllergies: null });
  const backup = await exportBackup(there, key);
  const here = memoryStorage();
  await savePatientData(here, key, "p1", { additions: [], stopped: {}, allergies: [{ id: "a", name: "Latex" }], allergyReactions: { k1: { reaction: "New" } }, noKnownAllergies: "2026-11-23" });
  await importBackup(here, key, backup);
  const data = await loadPatientData(here, key, "p1");
  assert.deepEqual(data.allergies.map((a) => a.id), ["a", "b"]);
  assert.equal(data.allergyReactions.k1.reaction, "New");
  assert.equal(data.allergyReactions.k2.reaction, "Rash");
  assert.equal(data.noKnownAllergies, null);
});

test("restoring a backup keeps a no known allergies statement when neither side has one listed", async () => {
  const key = await keyA;
  const there = memoryStorage();
  await savePatientData(there, key, "p1", { additions: [], stopped: {}, noKnownAllergies: "2026-11-20" });
  const backup = await exportBackup(there, key);
  const here = memoryStorage();
  await importBackup(here, key, backup);
  assert.equal((await loadPatientData(here, key, "p1")).noKnownAllergies, "2026-11-20");
});
