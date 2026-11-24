import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { saveToDevice } from "../js/save-file.js";

const FILE = { name: "list.json" };
const named = (name) => Object.assign(new Error(name), { name });
// What the device did: shared, downloaded, or both.
async function save({ can, refuses }) {
  const did = [];
  const nav = can === undefined ? {} : {
    canShare: () => can,
    share: async (data) => { assert.deepEqual(data, { files: [FILE] }); did.push("shared"); if (refuses) throw named(refuses); }
  };
  let error = null;
  try { await saveToDevice(FILE, nav, (file) => { assert.equal(file, FILE); did.push("downloaded"); }); } catch (problem) { error = problem.name; }
  return [did, error];
}

test("shares where it can, else downloads", async () => {
  assert.deepEqual(await save({ can: true }), [["shared"], null]);
  assert.deepEqual(await save({ can: false }), [["downloaded"], null]);
  assert.deepEqual(await save({}), [["downloaded"], null]);
});

// Chrome on Android says it can share a .json file, then refuses.
test("a share the phone refuses is downloaded instead", async () => {
  for (const refuses of ["NotAllowedError", "DataError", "TypeError"]) {
    assert.deepEqual(await save({ can: true, refuses }), [["shared", "downloaded"], null], refuses);
  }
});

test("cancelling never downloads", async () => {
  assert.deepEqual(await save({ can: true, refuses: "AbortError" }), [["shared"], "AbortError"]);
});

// A second press while the share sheet is open.
test("a share already open is not downloaded too", async () => {
  assert.deepEqual(await save({ can: true, refuses: "InvalidStateError" }), [["shared"], "InvalidStateError"]);
});

test("the FHIR file and the backup both save this way", () => {
  for (const name of ["js/fhir-file.js", "js/app.js"]) {
    const code = readFileSync(new URL("../" + name, import.meta.url), "utf8");
    assert.match(code, /(await|return) saveToDevice\(file\)/);
    assert.doesNotMatch(code, /navigator\.share\(/);
  }
});
