import test from "node:test";
import assert from "node:assert/strict";
import { searchDrugs, ingredientsFor, rxcuisForNdcs, RxNormError } from "../js/rxnorm.js";

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
    { rxcui: "206878", name: "ibuprofen 200 MG Oral Tablet [Advil]" },
    { rxcui: "310965", name: "ibuprofen 200 MG Oral Tablet" }
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

var NDC_STATUS = "https://rxnav.nlm.nih.gov/REST/ndcstatus.json?ndc=";

// Shapes copied from real ndcstatus.json answers (2026-11-18).
function ndcStatus(fields) {
  return { body: { ndcStatus: Object.assign({ ndc11: "", status: "UNKNOWN", rxcui: "", conceptName: "" }, fields) } };
}

test("rxcuisForNdcs maps an active NDC to its RxNorm product", async () => {
  var fetchFn = fakeFetch({
    [NDC_STATUS + "0071-0156-23"]: ndcStatus({ ndc11: "00071015623", status: "ACTIVE", rxcui: "617318", conceptName: "atorvastatin 20 MG Oral Tablet [Lipitor]" })
  });
  var map = await rxcuisForNdcs(["0071-0156-23"], fetchFn);
  assert.deepEqual(map.get("0071-0156-23"), { rxcui: "617318", name: "atorvastatin 20 MG Oral Tablet [Lipitor]" });
});

test("rxcuisForNdcs maps an obsolete NDC that rxcui.json would miss", async () => {
  var fetchFn = fakeFetch({
    [NDC_STATUS + "00071015630"]: ndcStatus({ ndc11: "00071015630", status: "OBSOLETE", rxcui: "617318", conceptName: "atorvastatin 20 MG Oral Tablet [Lipitor]" })
  });
  var map = await rxcuisForNdcs(["00071015630"], fetchFn);
  assert.equal(map.get("00071015630").rxcui, "617318");
});

test("rxcuisForNdcs falls back to the newest history entry when rxcui is blank", async () => {
  var fetchFn = fakeFetch({
    [NDC_STATUS + "11111-2222-33"]: ndcStatus({ ndc11: "11111222233", status: "OBSOLETE", ndcHistory: [
      { activeRxcui: "100", originalRxcui: "100", startDate: "200701", endDate: "201001" },
      { activeRxcui: "200", originalRxcui: "150", startDate: "201002", endDate: "201512" }
    ] })
  });
  var map = await rxcuisForNdcs(["11111-2222-33"], fetchFn);
  assert.deepEqual(map.get("11111-2222-33"), { rxcui: "200", name: null });
});

test("rxcuisForNdcs leaves out unknown NDCs and failed requests", async () => {
  var fetchFn = fakeFetch({
    [NDC_STATUS + "0071-0156-23"]: ndcStatus({ status: "ACTIVE", rxcui: "617318", conceptName: "atorvastatin 20 MG Oral Tablet [Lipitor]" }),
    [NDC_STATUS + "0071015623"]: ndcStatus({}),
    [NDC_STATUS + "99999-9999-99"]: new TypeError("Failed to fetch")
  });
  var map = await rxcuisForNdcs(["0071-0156-23", "0071015623", "99999-9999-99"], fetchFn);
  assert.deepEqual(Array.from(map.keys()), ["0071-0156-23"]);
});

test("rxcuisForNdcs asks once per NDC and encodes it", async () => {
  var fetchFn = fakeFetch({ [NDC_STATUS]: ndcStatus({}) });
  await rxcuisForNdcs(["1 2", "1 2", ""], fetchFn);
  assert.deepEqual(fetchFn.calls, [NDC_STATUS + "1%202"]);
});
