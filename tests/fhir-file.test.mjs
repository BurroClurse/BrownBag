// Saving the file on the staff page, and what's said about it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOT_SAVED, UNLOCKED, saveResult } from "../js/fhir-file.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const flat = (file) => read(file).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("why a list can't be saved is said plainly", () => {
  assert.equal(NOT_SAVED.incomplete, "This list is incomplete, so it can't be saved as a file.");
  assert.equal(NOT_SAVED.odd, "This list can't be saved as a file.");
});

test("a cancelled or failed save never says saved", () => {
  assert.equal(saveResult(null), "Saved.");
  assert.equal(saveResult(null, true), "Check your downloads.");
  assert.equal(saveResult({ name: "AbortError" }), "Not saved.");
  assert.equal(saveResult(new Error("x")), "Couldn't save the file.");
});

test("the file is made on the device and nothing is sent", () => {
  for (const file of ["js/ips.js", "js/fhir-file.js", "js/save-file.js", "js/share-view.js"]) assert.doesNotMatch(read(file), /fetch\(|XMLHttpRequest|sendBeacon|localStorage|indexedDB/, file);
  // Only the file: a title becomes a second file on an iPhone.
  assert.match(read("js/save-file.js"), /nav\.share\(\{ files: \[file\] \}\)/);
});

test("the patient is told the list can be saved unlocked", () => {
  const line = "The person who opens it can save it as a file that isn't locked.";
  assert.ok(flat("privacy.html").includes(line));
  assert.ok(read("js/app.js").includes(line));
});

// The patient can hand over a file when nobody can scan. If this broke, they'd
// save their list unlocked without being told, or not be able to.
test("the patient can save it too, from See what's inside, after a warning in their words", () => {
  assert.match(UNLOCKED.patient, /your name, birth date, allergies and medicines/);
  assert.match(UNLOCKED.staff, /the patient's name, birth date, allergies and medicines/);
  assert.match(read("js/app.js"), /if \(groups\) drawSaveFile\(page, opened, UNLOCKED\.patient\)/);
  assert.match(read("js/share-view.js"), /drawSaveFile\(root, bundle, UNLOCKED\.staff\)/);
  assert.ok(flat("privacy.html").includes("You can save that file too."));
});

test("it works with no signal, and the code owners are credited", () => {
  for (const file of ["./js/ips.js", "./js/fhir-file.js"]) assert.ok(read("sw.js").includes('"' + file + '"'), file);
  const readme = flat("README.md");
  assert.match(readme, /This material contains content from LOINC \(http:\/\/loinc\.org\)\. LOINC is copyright © Regenstrief Institute, Inc\. and the Logical Observation Identifiers Names and Codes \(LOINC\) Committee and is available at no cost under the license at http:\/\/loinc\.org\/license/);
  assert.match(readme, /UCUM/);
});
