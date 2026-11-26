// The sandbox's own sign-in page shows only ten patients (its code asks for ten),
// so Brown Bag lists its own. If these fail, a choice signs in as someone else.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUPS, knownPatient, sandboxServer } from "../js/test-patients.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const all = GROUPS.flatMap((group) => group.patients);
const options = (url) => JSON.parse(Buffer.from(/\/sim\/([\w-]+)\/fhir$/.exec(url)[1], "base64url").toString());

test("more than the sandbox's ten, each once, each saying what it shows", () => {
  assert.ok(all.length >= 20);
  assert.equal(new Set(all.map((p) => p.id)).size, all.length);
  assert.equal(new Set(all.map((p) => p.name)).size, all.length);
  for (const p of all) {
    assert.match(p.id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    assert.ok(p.about && /^\d{4}-\d{2}-\d{2}$/.test(p.born), p.name);
  }
  for (const group of GROUPS) assert.ok(group.title && group.patients.length);
});

test("a choice signs in as that patient, and still asks for approval", () => {
  for (const p of all) {
    const o = options(sandboxServer(p.id));
    assert.deepEqual([o[0], o[1], o[4], o[5]], [3, p.id, 1, 0], p.name);
  }
  // The sandbox's own list: nobody chosen, its own sign-in page.
  assert.deepEqual([options(sandboxServer("list"))[1], options(sandboxServer("list"))[4]], ["", 0]);
  assert.equal(options(sandboxServer("list")).length, 17);
});

test("only a patient on the list can be asked for", () => {
  assert.equal(knownPatient(all[0].id), true);
  for (const id of ["", null, "x", "__proto__", "constructor", all[0].id + ",x"]) assert.equal(knownPatient(id), false, String(id));
  assert.throws(() => sandboxServer("x"));
});

test("the README's test patients are on it, and it works with no signal", () => {
  for (const id of ["e89af71d-4aa4-2237-e71d-6fa8e4b5af09", "e7de504a-311d-49be-b2bc-566a328bcc72"]) assert.ok(knownPatient(id));
  assert.ok(read("sw.js").includes('"./js/test-patients.js"'));
});
