import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { saveRecords, loadLastRecords, offlineNotice, savedNotice } from "../js/offline.js";
import { deriveKeyFromPin } from "../js/vault.js";

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), dump: () => [...map.values()].join("\n") };
}

const SAVED = {
  patientId: "patient-7f3a9c-sandbox",
  patient: { name: "Jane Example", birthDate: "1961-04-02" },
  current: [{ key: "rx:1", name: "lisinopril 10 MG Oral Tablet", status: "current" }],
  older: [],
  savedAt: "2026-11-20T20:30:00.000Z"
};

async function key(pin = "246810") {
  return deriveKeyFromPin(pin, new Uint8Array(16));
}

test("saved records round trip with the right key", async () => {
  const storage = memoryStorage();
  await saveRecords(storage, await key(), SAVED);
  assert.deepEqual(await loadLastRecords(storage, await key()), SAVED);
});

test("saved records are not readable as plain text", async () => {
  const storage = memoryStorage();
  await saveRecords(storage, await key(), SAVED);
  assert.ok(!storage.dump().includes("lisinopril"));
  assert.ok(!storage.dump().includes("patient-7f3a9c-sandbox"));
});

test("loadLastRecords is null when nothing is saved", async () => {
  assert.equal(await loadLastRecords(memoryStorage(), await key()), null);
});

test("loadLastRecords is null with a different key", async () => {
  const storage = memoryStorage();
  await saveRecords(storage, await key(), SAVED);
  assert.equal(await loadLastRecords(storage, await key("111111")), null);
});

test("offlineNotice formats the date", () => {
  assert.equal(offlineNotice(new Date(2026, 10, 20, 20, 30).toISOString()), "No connection. Showing your list saved on Nov 20, 2026. It may be out of date.");
});

// sw.js is a classic service worker script. Run it in a sandbox to reach
// its routing rule.
function loadWorker(overrides = {}) {
  const listeners = {};
  const context = Object.assign({ self: { addEventListener: (type, fn) => { listeners[type] = fn; }, location: { origin: "https://burroclurse.github.io" } }, URL, Request: class {}, caches: {}, fetch: () => {}, setTimeout, clearTimeout, Promise, Error }, overrides);
  vm.runInNewContext(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), context);
  return context.self;
}

test("the service worker never keeps health data", () => {
  const route = loadWorker().routeFor;
  assert.equal(route("https://launch.smarthealthit.org/v/r4/fhir/MedicationRequest?patient=1"), "network");
  assert.equal(route("https://r4.smarthealthit.org/Patient/1"), "network");
  assert.equal(route("https://rxnav.nlm.nih.gov/REST/drugs.json?name=ibuprofen"), "network");
  assert.equal(route("https://burroclurse.github.io/BrownBag/index.html?code=abc&state=def"), "app");
  assert.equal(route("https://burroclurse.github.io/BrownBag/js/app.js"), "app");
  assert.equal(route("https://cdn.jsdelivr.net/npm/fhirclient@3.0.1/bundle/fhir-client.js"), "library");
  assert.equal(route("https://cdn.jsdelivr.net/npm/something-else@1.0.0/x.js"), "network");
});

test("savedNotice says 'No connection' only when the phone is offline", () => {
  const at = new Date(2026, 10, 20, 20, 30).toISOString();
  assert.equal(savedNotice(at, false), "No connection. Showing your list saved on Nov 20, 2026. It may be out of date.");
  assert.equal(savedNotice(at, true), "Showing your list saved on Nov 20, 2026. Sign in to update it.");
});

test("the service worker stops waiting for a stalled network and uses its copy", { timeout: 3000 }, async () => {
  const worker = loadWorker({ fetch: () => new Promise(() => {}) });
  const started = Date.now();
  await assert.rejects(worker.fetchWithin("https://burroclurse.github.io/BrownBag/index.html", 50));
  assert.ok(Date.now() - started < 2000);
});
