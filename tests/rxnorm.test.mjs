import test from "node:test";
import assert from "node:assert/strict";
import { searchDrugs, ingredientsFor, RxNormError } from "../js/rxnorm.js";

// Fake fetch: answers by URL prefix with RxNav-shaped JSON, and records calls.
function fakeFetch(routes) {
  var calls = [];
  var fn = async function (url) {
    calls.push(url);
    var match = Object.keys(routes).find(function (prefix) { return url.indexOf(prefix) === 0; });
    if (!match) {
      throw new Error("no route for " + url);
    }
    var answer = routes[match];
    if (answer instanceof Error) {
      throw answer;
    }
    return { ok: answer.ok !== false, json: async function () { return answer.body; } };
  };
  fn.calls = calls;
  return fn;
}

var DRUGS = "https://rxnav.nlm.nih.gov/REST/drugs.json?name=";
var APPROX = "https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=";

function concept(rxcui, name, tty) {
  return { rxcui: rxcui, name: name, tty: tty, language: "ENG", suppress: "N" };
}

test("drugs.json results come back as rxcui and name", async () => {
  var fetchFn = fakeFetch({
    [DRUGS + "ibuprofen"]: { body: { drugGroup: { conceptGroup: [
      { tty: "BPCK" },
      { tty: "SBD", conceptProperties: [concept("206878", "ibuprofen 200 MG Oral Tablet [Advil]", "SBD")] },
      { tty: "SCD", conceptProperties: [concept("310965", "ibuprofen 200 MG Oral Tablet", "SCD")] }
    ] } } }
  });
  var results = await searchDrugs("ibuprofen", fetchFn);
  assert.deepEqual(results, [
    { rxcui: "310965", name: "ibuprofen 200 MG Oral Tablet" },
    { rxcui: "206878", name: "ibuprofen 200 MG Oral Tablet [Advil]" }
  ]);
});

test("falls back to approximateTerm when drugs.json has nothing", async () => {
  var fetchFn = fakeFetch({
    [DRUGS]: { body: { drugGroup: { name: null } } },
    [APPROX]: { body: { approximateGroup: { candidate: [
      { rxcui: "11253", name: "cholecalciferol", rank: "1" },
      { rxcui: "999", rank: "2" }
    ] } } }
  });
  var results = await searchDrugs("vitamin d3", fetchFn);
  assert.deepEqual(results, [{ rxcui: "11253", name: "cholecalciferol" }]);
  assert.equal(fetchFn.calls[1], APPROX + "vitamin%20d3&maxEntries=8");
});

test("blank term does not call fetch", async () => {
  var fetchFn = fakeFetch({});
  assert.deepEqual(await searchDrugs("   ", fetchFn), []);
  assert.equal(fetchFn.calls.length, 0);
});

test("network failure throws RxNormError", async () => {
  await assert.rejects(searchDrugs("ibuprofen", fakeFetch({ [DRUGS]: new TypeError("Failed to fetch") })), RxNormError);
  await assert.rejects(searchDrugs("ibuprofen", fakeFetch({ [DRUGS]: { ok: false, body: {} } })), RxNormError);
});

test("duplicates are removed and the list is capped at 10", async () => {
  var many = Array.from({ length: 14 }, function (unused, i) { return concept(String(100 + i), "drug " + i, "SCD"); });
  many.push(concept("100", "drug 0 again", "SCD"));
  var fetchFn = fakeFetch({ [DRUGS]: { body: { drugGroup: { conceptGroup: [{ tty: "SCD", conceptProperties: many }] } } } });
  var results = await searchDrugs("drug", fetchFn);
  assert.equal(results.length, 10);
  assert.equal(new Set(results.map((r) => r.rxcui)).size, 10);
});

function related(ingredientRxcui, name) {
  return { body: { relatedGroup: { conceptGroup: [{ tty: "IN", conceptProperties: [concept(ingredientRxcui, name, "IN")] }] } } };
}

test("ingredientsFor maps two lisinopril strengths to the same ingredient", async () => {
  var fetchFn = fakeFetch({
    "https://rxnav.nlm.nih.gov/REST/rxcui/314076/related.json?tty=IN": related("29046", "lisinopril"),
    "https://rxnav.nlm.nih.gov/REST/rxcui/314077/related.json?tty=IN": related("29046", "lisinopril")
  });
  var map = await ingredientsFor(["314076", "314077"], fetchFn);
  assert.deepEqual(map.get("314076"), { rxcui: "29046", name: "lisinopril" });
  assert.deepEqual(map.get("314077"), { rxcui: "29046", name: "lisinopril" });
});

test("ingredientsFor leaves out an rxcui whose request fails", async () => {
  var fetchFn = fakeFetch({
    "https://rxnav.nlm.nih.gov/REST/rxcui/314076/related.json?tty=IN": related("29046", "lisinopril"),
    "https://rxnav.nlm.nih.gov/REST/rxcui/1/related.json?tty=IN": new TypeError("Failed to fetch")
  });
  var map = await ingredientsFor(["314076", "1"], fetchFn);
  assert.equal(map.size, 1);
  assert.ok(map.has("314076"));
});

test("ingredientsFor keeps every ingredient of a combination product", async () => {
  var fetchFn = fakeFetch({
    "https://rxnav.nlm.nih.gov/REST/rxcui/1049221/related.json?tty=IN": { body: { relatedGroup: { conceptGroup: [{ tty: "IN", conceptProperties: [concept("161", "acetaminophen", "IN"), concept("7804", "oxycodone", "IN")] }] } } },
    "https://rxnav.nlm.nih.gov/REST/rxcui/313782/related.json?tty=IN": related("161", "acetaminophen")
  });
  var map = await ingredientsFor(["1049221", "313782"], fetchFn);
  assert.deepEqual(map.get("1049221"), { rxcui: "161+7804", name: "acetaminophen / oxycodone" });
  assert.deepEqual(map.get("313782"), { rxcui: "161", name: "acetaminophen" });
});

// A connection that never answers, the way weak Wi-Fi behaves.
function stalledFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.signal) options.signal.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
  });
}

test("a stalled RxNav lookup gives up instead of hanging the list", { timeout: 3000 }, async () => {
  var started = Date.now();
  var map = await ingredientsFor(["314076"], stalledFetch, { timeoutMs: 50 });
  assert.equal(map.size, 0);
  assert.ok(Date.now() - started < 2000);
});

test("a stalled name search throws RxNormError", { timeout: 3000 }, async () => {
  await assert.rejects(searchDrugs("ibuprofen", stalledFetch, { timeoutMs: 50 }), RxNormError);
});

test("plain generic matches come first, combinations and brands after", async () => {
  var fetchFn = fakeFetch({
    [DRUGS]: { body: { drugGroup: { conceptGroup: [
      { tty: "SBD", conceptProperties: [
        concept("1", "famotidine 26.6 MG / ibuprofen 800 MG Oral Tablet [Duexis]", "SBD"),
        concept("2", "ibuprofen 200 MG Oral Tablet [Advil]", "SBD")
      ] },
      { tty: "SCD", conceptProperties: [
        concept("3", "ibuprofen 400 MG / oxycodone hydrochloride 5 MG Oral Tablet", "SCD"),
        concept("4", "ibuprofen 200 MG Oral Tablet", "SCD")
      ] }
    ] } } }
  });
  var results = await searchDrugs("ibuprofen", fetchFn);
  assert.deepEqual(results.map((r) => r.rxcui), ["4", "2", "3", "1"]);
});

test("the generic comes before a brand, even a shorter brand name", async () => {
  var fetchFn = fakeFetch({
    [DRUGS]: { body: { drugGroup: { conceptGroup: [
      { tty: "SBD", conceptProperties: [concept("9", "ibuprofen 200 MG [X]", "SBD")] },
      { tty: "SCD", conceptProperties: [concept("8", "ibuprofen 200 MG Oral Tablet", "SCD")] }
    ] } } }
  });
  assert.deepEqual((await searchDrugs("ibuprofen", fetchFn)).map((r) => r.rxcui), ["8", "9"]);
});

test("ingredientsFor says which codes have no ingredient, and not which failed", async () => {
  const none = new Set();
  const fetchFn = async (url) => {
    if (url.includes("/1/")) return { ok: true, json: async () => ({ relatedGroup: { conceptGroup: [{ tty: "IN" }] } }) };
    if (url.includes("/2/")) throw new Error("offline");
    return { ok: true, json: async () => ({ relatedGroup: { conceptGroup: [{ tty: "IN", conceptProperties: [{ rxcui: "29046", name: "lisinopril" }] }] } }) };
  };
  const map = await ingredientsFor(["1", "2", "3"], fetchFn, { none });
  assert.deepEqual([...none], ["1"]);
  assert.deepEqual([...map.keys()], ["3"]);
});
