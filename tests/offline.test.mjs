import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { saveRecords, loadLastRecords, loadRecordsFor, listDate, hasSavedList, splitToSave, splitFromSaved } from "../js/offline.js";
import { arrangeList } from "../js/view.js";
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

test("saved allergies round trip with the records", async () => {
  const storage = memoryStorage();
  const allergies = { items: [{ key: "alg:name:mold", name: "Mold" }], statements: [], savedAt: "2026-11-23T10:00:00.000Z" };
  await saveRecords(storage, await key(), Object.assign({}, SAVED, { allergies }));
  assert.deepEqual((await loadLastRecords(storage, await key())).allergies, allergies);
  assert.ok(!storage.dump().includes("Mold"));
});

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

test("listDate is short this year and adds the year otherwise", () => {
  const now = new Date(2026, 10, 21, 9, 0);
  assert.equal(listDate(new Date(2026, 10, 20, 20, 30).toISOString(), now), "Nov 20");
  assert.equal(listDate(new Date(2025, 0, 5, 8, 0).toISOString(), now), "Jan 5, 2025");
});

// sw.js is a classic service worker script. Run it in a sandbox to reach
// its routing rule.
function loadWorker(overrides = {}) {
  const listeners = {};
  const context = Object.assign({ self: { addEventListener: (type, fn) => { listeners[type] = fn; }, location: { origin: "https://burroclurse.github.io" }, registration: { scope: "https://burroclurse.github.io/BrownBag/" } }, URL, Request: class {}, caches: {}, fetch: () => {}, setTimeout, clearTimeout, Promise, Error }, overrides);
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
  assert.equal(route("https://cdn.jsdelivr.net/npm/fhirclient@3.0.1/bundle/fhir-client.js"), "network");
});

test("the service worker stops waiting for a stalled network and uses its copy", { timeout: 3000 }, async () => {
  const worker = loadWorker({ fetch: () => new Promise(() => {}) });
  const started = Date.now();
  await assert.rejects(worker.fetchWithin("https://burroclurse.github.io/BrownBag/index.html", 50));
  assert.ok(Date.now() - started < 2000);
});

test("the service worker leaves other sites on the same address alone", () => {
  const route = loadWorker().routeFor;
  assert.equal(route("https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/index.html"), "network");
});

test("every picture the app's pages use is saved for offline", () => {
  const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const pages = ["index.html", "share.html", "js/app.js", "js/lock-screen.js", "js/share-view.js"]
    .map((file) => readFileSync(new URL("../" + file, import.meta.url), "utf8")).join("\n");
  const pictures = [...new Set(pages.match(/icons\/[\w-]+\.png/g))];
  assert.ok(pictures.includes("icons/logo-trimmed.png"), "the logo is used on the screens");
  for (const picture of pictures) assert.ok(worker.includes('"./' + picture + '"'), picture + " is in the offline list");
});

test("hasSavedList says whether there's a saved list to unlock, without the key", async () => {
  const storage = memoryStorage();
  assert.equal(hasSavedList(storage), false);
  await saveRecords(storage, await key(), SAVED);
  assert.equal(hasSavedList(storage), true);
});

test("the service worker always asks GitHub for app files, not the browser's 10-minute copy", async () => {
  const calls = [];
  const worker = loadWorker({ fetch: (url, init) => { calls.push([typeof url === "string" ? url : url.url, init && init.cache]); return Promise.resolve({ ok: true }); } });
  await worker.fetchWithin({ url: "https://burroclurse.github.io/BrownBag/js/app.js", method: "GET" }, 1000);
  assert.deepEqual(calls[0], ["https://burroclurse.github.io/BrownBag/js/app.js", "no-cache"]);
});

test("loadRecordsFor opens one patient's saved list, not just the last one's", async () => {
  const storage = memoryStorage();
  await saveRecords(storage, await key(), SAVED);
  await saveRecords(storage, await key(), Object.assign({}, SAVED, { patientId: "other" }));
  assert.equal((await loadRecordsFor(storage, await key(), SAVED.patientId)).patientId, SAVED.patientId);
  assert.equal(await loadRecordsFor(storage, await key(), "nobody"), null);
  assert.equal(await loadRecordsFor(storage, await key("111111"), SAVED.patientId), null);
});

const APP = "https://burroclurse.github.io/BrownBag/";
function cachesWith(saved) {
  const put = [];
  return {
    put,
    match: async (url) => (saved[url] ? { from: "phone", url } : undefined),
    open: async () => ({ put: (url) => { put.push(url); } })
  };
}
const ok = (url) => ({ ok: true, from: "network", url, clone() { return this; } });

test("a file with no saved copy waits for a slow network, and never gets the wrong page", { timeout: 3000 }, async () => {
  let calls = 0;
  const slow = (request) => { calls += 1; return new Promise((resolve) => setTimeout(() => resolve(ok(request.url)), 120)); };
  const worker = loadWorker({ caches: cachesWith({ [APP + "index.html"]: true }), fetch: slow });
  const answer = await worker.answerFor({ url: APP + "js/read.js", mode: "cors" }, 30);
  assert.deepEqual([answer.from, answer.url], ["network", APP + "js/read.js"]);
  assert.ok(calls >= 1);
});

test("a file with no saved copy and no network is an error, not a page", async () => {
  const worker = loadWorker({ caches: cachesWith({ [APP + "index.html"]: true }), fetch: () => Promise.reject(new Error("offline")) });
  await assert.rejects(worker.answerFor({ url: APP + "js/read.js", mode: "cors" }, 30));
});

test("a saved copy is used when the network is slow, and a page falls back to the start page", async () => {
  const never = () => new Promise(() => {});
  const worker = loadWorker({ caches: cachesWith({ [APP + "js/app.js"]: true, [APP + "index.html"]: true }), fetch: never });
  assert.equal((await worker.answerFor({ url: APP + "js/app.js", mode: "cors" }, 30)).from, "phone");
  const page = await worker.answerFor({ url: APP + "index.html?code=1", mode: "navigate" }, 30);
  assert.equal(page.url, APP + "index.html");
  const other = await worker.answerFor({ url: APP + "nothing-here.html", mode: "navigate" }, 30);
  assert.equal(other.url, APP + "index.html");
});

test("what arrives in time is kept without the sign-in code in its address", async () => {
  const caches = cachesWith({});
  const worker = loadWorker({ caches, fetch: (request) => Promise.resolve(ok(request.url)) });
  await worker.answerFor({ url: APP + "index.html?code=secret", mode: "navigate" }, 500);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(caches.put, [APP + "index.html"]);
});

test("both pages try once more by themselves when a file doesn't arrive", () => {
  for (const [page, script] of [["index.html", "js/app.js"], ["share.html", "js/share-view.js"]]) {
    const html = readFileSync(new URL("../" + page, import.meta.url), "utf8");
    assert.ok(html.indexOf("brownbag:retried") !== -1 && html.indexOf("brownbag:retried") < html.indexOf(script), page + " watches before its script");
    assert.match(readFileSync(new URL("../" + script, import.meta.url), "utf8"), /window\.brownBagStarted = true/);
  }
});

// A card joined from two sources, as reconcile builds it.
const GROUP_CARD = {
  key: "rx:314077", name: "lisinopril 20 MG Oral Tablet", status: "current", dose: "20 mg", frequency: "once a day",
  group: {
    id: "29046", sources: ["SMART sandbox", "Valley Clinic (test records)"], verdicts: ["dose"], fingerprint: "[{\"sourceId\":\"smart-sandbox\"}]", notes: [],
    sides: [
      { sourceId: "smart-sandbox", sourceName: "SMART sandbox", kind: "records", asOf: "2026-03-02", name: "lisinopril 10 MG Oral Tablet", dose: "10 mg", frequency: "once a day", status: "current", key: "rx:314076" },
      { sourceId: "valley-clinic-demo", sourceName: "Valley Clinic (test records)", kind: "records", asOf: "2026-10-05", name: "lisinopril 20 MG Oral Tablet", dose: "20 mg", frequency: "once a day", status: "current", key: "rx:314077" }
    ]
  }
};

test("a saved copy keeps its groups", async () => {
  const storage = memoryStorage();
  const split = {
    current: [GROUP_CARD], older: [], failed: false, placeholders: 0, heldBack: false, claims: null, ingredientOf: new Map([["1", { rxcui: "1" }]]),
    keptOut: [{ id: "x", name: "Mercy Health", why: "someone-else" }],
    sourceStatus: [{ id: "smart-sandbox", name: "SMART sandbox", loaded: true, complete: true }, { id: "valley-clinic-demo", name: "Valley Clinic (test records)", loaded: true, complete: true }]
  };
  await saveRecords(storage, await key(), Object.assign({ patientId: SAVED.patientId, patient: SAVED.patient, savedAt: SAVED.savedAt }, splitToSave(split)));
  const opened = splitFromSaved(await loadLastRecords(storage, await key()));
  assert.deepEqual(opened.current[0].group, GROUP_CARD.group);
  assert.deepEqual(opened.keptOut, split.keptOut);
  assert.deepEqual(opened.sourceStatus, split.sourceStatus);
  assert.equal(opened.failed, false);
  assert.equal(arrangeList(opened, {}).toCheck.length, 1, "still asks");
});

test("a saved copy from before groups opens", async () => {
  const storage = memoryStorage();
  await saveRecords(storage, await key(), SAVED);
  const opened = splitFromSaved(await loadLastRecords(storage, await key()));
  assert.deepEqual(opened, { current: SAVED.current, older: [], failed: false, placeholders: 0, heldBack: false, claims: null, keptOut: [], sourceStatus: [] });
  const arranged = arrangeList(opened, {});
  assert.deepEqual(arranged.current, SAVED.current);
  assert.deepEqual(arranged.toCheck, []);
});

test("the test source opens with no signal, and its records are never kept", () => {
  const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.ok(worker.includes('"./js/demo-source.js"'));
  assert.match(worker, /var CACHE = "brownbag-v91";/);
  assert.equal(loadWorker().routeFor("https://burroclurse.github.io/BrownBag/_home/demo-source.json"), "network");
  assert.equal(loadWorker().routeFor("https://burroclurse.github.io/BrownBag/js/demo-source.js"), "app");
});
