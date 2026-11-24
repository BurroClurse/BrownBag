import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveKeyFromPin, encryptJSON, decryptJSON, idTag, loadPatientData, savePatientData, exportBackup, importBackup, exportPasswordBackup, openPasswordBackup, importOpened, isPasswordBackup, VaultError } from "../js/vault.js";
import { passwordProblem } from "../js/install.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
function memory() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), get length() { return map.size; }, key: (i) => [...map.keys()][i] ?? null };
}
const key = await deriveKeyFromPin("123456", new Uint8Array(16));
const otherKey = await deriveKeyFromPin("654321", new Uint8Array(16).fill(1));
const PASSWORD = "four random words here";
const code = (name) => (error) => error instanceof VaultError && error.code === name;
const named = (...names) => ({ additions: names.map((name) => ({ id: name, name })), stopped: {} });
const names = (data) => data.additions.map((a) => a.name);
async function twoPeople() {
  const storage = memory();
  await savePatientData(storage, key, "alice", named("Alice vitamin"));
  await savePatientData(storage, key, "bob", named("Bob fish oil"));
  return storage;
}

// An edited file must never put one person's medicines in another's list.
test("a backup with swapped or changed labels is refused, and nothing is written", async () => {
  const [a, b, c] = [await idTag("alice"), await idTag("bob"), await idTag("carol")];
  const file = JSON.parse(await exportBackup(await twoPeople(), key));
  const edits = [
    { [a]: file.data[b], [b]: file.data[a] },
    { [c]: file.data[a] },
    // One good label doesn't carry the other in.
    { [a]: file.data[a], [c]: file.data[b] }
  ];
  for (const data of edits) {
    const phone = memory();
    await assert.rejects(importBackup(phone, key, JSON.stringify(Object.assign({}, file, { data }))), code("wrong-person"));
    assert.equal(phone.map.size, 0);
  }
});

test("saved data moved to another person's name on the phone isn't opened or saved over", async () => {
  const storage = await twoPeople();
  const names = [...storage.map.keys()];
  const moved = storage.getItem(names[1]);
  storage.setItem(names[0], moved);
  await assert.rejects(loadPatientData(storage, key, "alice"), code("wrong-person"));
  await assert.rejects(savePatientData(storage, key, "alice", named("x")), code("wrong-person"));
  assert.equal(storage.getItem(names[0]), moved);
});

// Lists saved before sealing must keep working, and become safe once backed up.
test("data from before sealing still opens and restores, and a new backup seals it", async () => {
  const storage = memory();
  storage.setItem("brownbag:data:" + await idTag("alice"), await encryptJSON(key, named("Alice vitamin")));
  assert.deepEqual(names(await loadPatientData(storage, key, "alice")), ["Alice vitamin"]);
  const old = JSON.stringify({ app: "brownbag", version: 2, data: { [await idTag("alice")]: await encryptJSON(key, named("Alice vitamin")) } });
  const phone = memory();
  assert.equal(await importBackup(phone, key, old), 1);
  assert.deepEqual(names(await loadPatientData(phone, key, "alice")), ["Alice vitamin"]);
  const file = JSON.parse(await exportBackup(storage, key));
  file.data = { [await idTag("bob")]: Object.values(file.data)[0] };
  await assert.rejects(importBackup(memory(), key, JSON.stringify(file)), code("wrong-person"));
});

test("the seal is not part of what the app sees", async () => {
  const storage = await twoPeople();
  assert.ok(!("sealedFor" in await loadPatientData(storage, key, "alice")));
  for (const [name, blob] of storage.map) assert.equal((await decryptJSON(key, blob)).sealedFor, name.split(":")[2]);
});

// The password opens it on any phone with any lock, so a forgotten PIN doesn't
// lock someone out of their own backup.
test("a password backup opens with its password alone, under another lock", async () => {
  const text = await exportPasswordBackup(await twoPeople(), key, PASSWORD);
  assert.ok(isPasswordBackup(text));
  const opened = await openPasswordBackup(text, PASSWORD);
  const phone = memory();
  assert.equal(await importOpened(phone, otherKey, opened), 2);
  assert.deepEqual(names(await loadPatientData(phone, otherKey, "alice")), ["Alice vitamin"]);
  assert.deepEqual(names(await loadPatientData(phone, otherKey, "bob")), ["Bob fish oil"]);
  assert.deepEqual(names(await loadPatientData(phone, otherKey, "carol")), []);
});

test("restoring a password backup keeps what's on the phone", async () => {
  const storage = await twoPeople();
  const opened = await openPasswordBackup(await exportPasswordBackup(storage, key, PASSWORD), PASSWORD);
  await savePatientData(storage, key, "alice", named("Added since"));
  await importOpened(storage, key, opened);
  assert.deepEqual(names(await loadPatientData(storage, key, "alice")).sort(), ["Added since", "Alice vitamin"]);
});

// The lock settings would let someone guess the PIN from the file.
test("a password backup holds nothing readable: no lock, names, people or medicines", async () => {
  const storage = await twoPeople();
  storage.setItem("brownbag:lock", JSON.stringify({ method: "pin", salt: "LOCKSALT", check: "LOCKCHECK" }));
  storage.setItem("brownbag:pass:x", "SECRETPASS");
  const text = await exportPasswordBackup(storage, key, PASSWORD);
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ["app", "salt", "sealed", "version"]);
  for (const word of ["alice", "Alice", "fish", "LOCKSALT", "LOCKCHECK", "SECRETPASS", PASSWORD, await idTag("alice")]) assert.ok(!text.includes(word), word);
  const inside = JSON.stringify(await openPasswordBackup(text, PASSWORD));
  assert.ok(!/LOCKSALT|LOCKCHECK|SECRETPASS/.test(inside));
});

test("the wrong password, the PIN, or an edited file doesn't open it", async () => {
  const text = await exportPasswordBackup(await twoPeople(), key, PASSWORD);
  for (const wrong of ["", "123456", PASSWORD + " ", PASSWORD.toUpperCase()]) await assert.rejects(openPasswordBackup(text, wrong), code("wrong-password"), wrong);
  const file = JSON.parse(text);
  file.sealed = file.sealed.slice(0, 40) + (file.sealed[40] === "A" ? "B" : "A") + file.sealed.slice(41);
  await assert.rejects(openPasswordBackup(JSON.stringify(file), PASSWORD), code("wrong-password"));
  await assert.rejects(openPasswordBackup(JSON.stringify({ app: "brownbag", version: 3 }), PASSWORD), code("bad-backup"));
  await assert.rejects(openPasswordBackup("hello", PASSWORD), code("bad-backup"));
});

test("two backups with the same password don't share a key", async () => {
  const storage = await twoPeople();
  const [a, b] = [JSON.parse(await exportPasswordBackup(storage, key, PASSWORD)), JSON.parse(await exportPasswordBackup(storage, key, PASSWORD))];
  assert.notEqual(a.salt, b.salt);
});

// The same letters typed on another keyboard must open it.
test("accented letters match however they're typed", async () => {
  const text = await exportPasswordBackup(await twoPeople(), key, "café café café café");
  assert.equal(Object.keys(await openPasswordBackup(text, "café café café café")).length, 2);
});

test("only a password backup is one", async () => {
  for (const text of ["hello", "null", "[]", "{}", JSON.stringify({ app: "x", version: 3 }), await exportBackup(await twoPeople(), key)]) assert.equal(isPasswordBackup(text), false, text.slice(0, 30));
});

// A short password could be guessed as fast as a PIN.
test("a backup password is long, isn't one thing repeated, and is typed twice", () => {
  assert.match(passwordProblem("short", "short"), /at least 15/);
  assert.match(passwordProblem("12345678901234", "12345678901234"), /at least 15/);
  assert.match(passwordProblem("aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa"), /different/);
  assert.match(passwordProblem(PASSWORD, PASSWORD + "x"), /match/);
  assert.equal(passwordProblem(PASSWORD, PASSWORD), null);
});

// iPhone saved the title as a second file.
test("saving a backup shares only the file", () => {
  const app = read("js/app.js");
  assert.match(read("js/save-file.js"), /nav\.share\(\{ files: \[file\] \}\)/);
  assert.ok(!app.includes('title: "Brown Bag backup"'));
});

test("the backup screens work with no signal", () => {
  for (const file of ["./js/popup.js", "./js/backup-popups.js"]) assert.ok(read("sw.js").includes('"' + file + '"'), file);
});
