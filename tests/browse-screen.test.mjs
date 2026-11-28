// The Browse all patients screen in js/launch.js (design 2026-11-28), read
// from its code as sources.test.mjs reads the rest of launch.html's screens.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const launch = read("js/launch.js");
const part = (name) => launch.slice(launch.indexOf("function " + name)).split("\n}\n")[0];

test("Browse all patients replaces Someone else, as its own history step", () => {
  const patients = part("showPatients");
  assert.doesNotMatch(launch, /Someone else/);
  assert.doesNotMatch(patients, /signInLink\(OWN_LIST\)/);
  assert.match(patients, /"Browse all patients"/);
  assert.match(patients, /PATIENTS\.length/);
  assert.match(patients, /location\.href = browseLink\(\)/);
  assert.match(launch, /else if \(screen === "browse"\) showBrowse\(\);/);
});

test("the screen keeps its search, sort and place in the step, and signs in with the patient's own link", () => {
  const browse = part("showBrowse");
  assert.match(browse, /history\.replaceState\(/);
  assert.match(browse, /var state = browseState\(\);/);
  assert.match(part("browseState"), /history\.state && history\.state\.browse/);
  assert.match(browse, /location\.href = signInLink\(patient\.id, sort === "added"\)/);
  assert.match(browse, /type = "search"/);
  assert.match(browse, /"Sort by"/);
  assert.match(browse, /"Show more"/);
  assert.match(launch, /var NO_MATCH = "No one by that name\. Check the spelling, or clear the search\.";/);
  assert.match(browse, /made-up patients with medicines\./);
});

test("Added by other people asks the sandbox live, with a time limit, and says when it can't", () => {
  const live = part("loadAdded");
  const browseJs = read("js/browse.js");
  assert.match(browseJs, /_has:MedicationRequest:patient:status=/);
  assert.match(browseJs, /_has:MedicationStatement:subject:status=/);
  assert.match(browseJs, /_sort=-_lastUpdated&_count=20&_elements=name,birthDate/);
  assert.match(live, /withTimeout\(promise, LIVE_WAIT_MS\)/);
  assert.match(launch, /Couldn't reach the sandbox\./);
  assert.match(launch, /Added to the sandbox by other people\. They may be gone after its nightly reset\./);
  // The sandbox is the only place it asks, and launch.html already allows it.
  assert.match(read("launch.html"), /connect-src 'self' https:\/\/launch\.smarthealthit\.org;/);
});

// Final review fixes (2026-11-28).
test("the live view keeps one request at a time, and a late failure never draws over a list", () => {
  const live = part("loadAdded");
  assert.match(live, /if \(!pending\) \{/);
  assert.match(live, /askAdded\(globalThis\.fetch\.bind\(globalThis\)/);
  assert.match(live, /pending = null;/);
  const browse = part("showBrowse");
  assert.match(browse, /if \(select\.value !== "added" \|\| added\) return;/);
});

test("a screen reader hears when no one matches and when the sandbox can't be reached", () => {
  const browse = part("showBrowse");
  assert.match(browse, /status\.textContent = live && !search\.value\.trim\(\) \? NONE_ADDED : NO_MATCH;/);
  assert.match(browse, /status\.textContent = "Couldn't reach the sandbox\.";/);
  assert.doesNotMatch(read("css/brownbag.css"), /\.browse-count:empty/);
});
