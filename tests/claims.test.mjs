import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillsFromClaims, attachFills, completedLine, claimsLabel, fillNote, suggestNote, readClaims, mergeClaims } from "../js/claims.js";

const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const NOW = new Date("2026-11-21T12:00:00Z");

// Shaped like the SMART sandbox's own pharmacy claims.
function claim(code, name, date, insurer = "Aetna", type = "pharmacy") {
  return {
    resourceType: "ExplanationOfBenefit",
    type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: type }] },
    insurer: { display: insurer },
    billablePeriod: { start: date + "T07:26:42+00:00" },
    item: [{
      productOrService: { coding: [{ system: RXNORM, code, display: name }], text: name },
      servicedPeriod: { start: date + "T07:11:42+00:00" }
    }]
  };
}

function item(key, rxcui, name, status = "current", start = "2026-01-01") {
  return { key, rxcui, name, status, start, lastDate: start, source: "SMART sandbox", origin: "records" };
}

test("fillsFromClaims keeps pharmacy claims and reads drug, date and insurer", () => {
  const fills = fillsFromClaims([
    claim("314076", "lisinopril 10 MG Oral Tablet", "2026-09-21"),
    claim("999", "office visit", "2026-09-21", "Aetna", "professional"),
    claim("308191", "amoxicillin 500 MG Oral Capsule", "2026-10-10", "NO_INSURANCE")
  ]);
  assert.deepEqual(fills, [
    { rxcui: "314076", name: "lisinopril 10 MG Oral Tablet", date: "2026-09-21", insurer: "Aetna", cash: false, quantity: null, daysSupply: null },
    { rxcui: "308191", name: "amoxicillin 500 MG Oral Capsule", date: "2026-10-10", insurer: null, cash: true, quantity: null, daysSupply: null }
  ]);
});

test("fillsFromClaims falls back to the billing date", () => {
  const c = claim("314076", "lisinopril", "2026-09-21");
  delete c.item[0].servicedPeriod;
  assert.equal(fillsFromClaims([c])[0].date, "2026-09-21");
});

test("attachFills counts exact-code fills on the matching medicine", () => {
  const split = { current: [item("rx:314076", "314076", "Lisinopril")], older: [], failed: false };
  const fills = fillsFromClaims([
    claim("314076", "lisinopril", "2026-05-01"),
    claim("314076", "lisinopril", "2026-07-23"),
    claim("314076", "lisinopril", "2026-09-21")
  ]);
  const out = attachFills(split, fills, new Map(), NOW);
  assert.equal(out.claims, "loaded");
  assert.deepEqual(out.current[0].fills, { count: 3, last: "2026-09-21", insurers: ["Aetna"], cash: false, sizedOn: null, suggests: null });
});

// Task 6c: the form has to match too, so these names say theirs.
test("attachFills matches by ingredient when the codes differ", () => {
  const split = { current: [item("rx:1", "1", "Lisinopril 10 MG Oral Tablet")], older: [], failed: false };
  const ingredients = new Map([["1", { rxcui: "29046" }], ["2", { rxcui: "29046" }]]);
  const out = attachFills(split, fillsFromClaims([claim("2", "lisinopril 20 MG Oral Tablet", "2026-09-21")]), ingredients, NOW);
  assert.equal(out.current[0].fills.count, 1);
  assert.equal(out.current.length, 1);
});

test("an ingredient match that fits two medicines goes to the later one", () => {
  const split = {
    current: [item("rx:1", "1", "Metoprolol A 25 MG Oral Tablet", "current", "2020-01-01"), item("rx:2", "2", "Metoprolol B 50 MG Oral Tablet", "current", "2025-06-01")],
    older: [],
    failed: false
  };
  const ingredients = new Map([["1", { rxcui: "6918" }], ["2", { rxcui: "6918" }], ["3", { rxcui: "6918" }]]);
  const out = attachFills(split, fillsFromClaims([claim("3", "metoprolol 100 MG Oral Tablet", "2026-09-21")]), ingredients, NOW);
  assert.equal(out.current.find((i) => i.key === "rx:2").fills.count, 1);
  assert.equal(out.current.find((i) => i.key === "rx:1").fills.count, 0);
});

test("a completed prescription filled recently moves to the current list", () => {
  const split = { current: [], older: [item("rx:861007", "861007", "Metformin", "older", "2023-01-10")], failed: false };
  const out = attachFills(split, fillsFromClaims([claim("861007", "metformin", "2026-09-21")]), new Map(), NOW);
  assert.equal(out.older.length, 0);
  assert.equal(out.current[0].completedButFilled, "2026-09-21");
  assert.equal(out.current[0].status, "current");
});

test("fills with no medicine become their own items, current if recent", () => {
  const split = { current: [], older: [], failed: false };
  const out = attachFills(split, fillsFromClaims([
    claim("312940", "sertraline 50 MG Oral Tablet", "2026-10-21"),
    claim("197806", "ibuprofen 600 MG Oral Tablet", "2023-11-21")
  ]), new Map(), NOW);
  assert.equal(out.current.length, 1);
  assert.equal(out.current[0].key, "fill:312940");
  assert.equal(out.current[0].origin, "claims");
  assert.equal(out.current[0].source, "Aetna claims");
  assert.equal(out.current[0].fills.count, 1);
  assert.equal(out.older[0].key, "fill:197806");
});

test("medicines with no fill get a count of zero", () => {
  const split = { current: [item("rx:617312", "617312", "Atorvastatin")], older: [], failed: false };
  const out = attachFills(split, fillsFromClaims([claim("312940", "sertraline", "2026-10-21")]), new Map(), NOW);
  assert.equal(out.current.find((i) => i.key === "rx:617312").fills.count, 0);
});

test("claimsLabel names who paid", () => {
  assert.equal(claimsLabel({ insurers: ["Aetna"], cash: false }), "Aetna claims");
  assert.equal(claimsLabel({ insurers: [], cash: true }), "paid without insurance");
});

test("completedLine says the record and the fill disagree", () => {
  assert.equal(completedLine("2025-12-24", "completed"), "Marked completed in your records, but filled Dec 24, 2025");
  assert.equal(completedLine("2025-12-24", "stopped"), "Marked stopped in your records, but filled Dec 24, 2025");
  assert.equal(completedLine("2025-12-24", "cancelled"), "Marked canceled in your records, but filled Dec 24, 2025");
  assert.equal(completedLine("2025-12-24", "not-taken"), "Marked not taken in your records, but filled Dec 24, 2025");
  assert.equal(completedLine("2025-12-24", "draft"), "Not current in your records, but filled Dec 24, 2025");
  assert.equal(completedLine("2025-12-24"), "Not current in your records, but filled Dec 24, 2025");
});

test("fillNote is the short line for the QR code", () => {
  assert.equal(fillNote({ count: 3, last: "2025-07-23", insurers: ["Aetna"], cash: false }), "Last filled 2025-07-23 (Aetna claims), 3 fills");
  assert.equal(fillNote({ count: 0 }), "No fill found in claims");
});

test("the claims module is kept for offline use", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/claims.js"'));
});

test("a finished course filled the day it was written stays with the older prescriptions", () => {
  const split = { current: [], older: [item("rx:308191", "308191", "Amoxicillin", "older", "2026-10-10")], failed: false };
  const out = attachFills(split, fillsFromClaims([claim("308191", "amoxicillin", "2026-10-10")]), new Map(), NOW);
  assert.equal(out.current.length, 0);
  assert.equal(out.older[0].fills.count, 1);
  assert.equal(out.older[0].completedButFilled, undefined);
});

// A pretend FHIR server: each page is a Bundle with a "next" link, like the sandbox's.
function pages(list, { slowFrom = Infinity, delayMs = 0 } = {}) {
  const asked = [];
  const request = (url) => {
    asked.push(url);
    const n = asked.length - 1;
    const bundle = {
      resourceType: "Bundle",
      entry: list[n].map((resource) => ({ resource })),
      link: n + 1 < list.length ? [{ relation: "next", url: "page" + (n + 1) }] : []
    };
    const wait = n >= slowFrom ? delayMs : 0;
    return new Promise((resolve) => setTimeout(() => resolve(bundle), wait));
  };
  return { request, asked };
}
const noLookup = async () => new Map();

test("readClaims follows every page and looks up the fill codes", async () => {
  const server = pages([[claim("314076", "lisinopril", "2026-09-21")], [claim("312941", "sertraline", "2026-10-21")]]);
  let looked;
  const out = await readClaims(server.request, "p1", async (codes) => { looked = codes; return new Map([["314076", { rxcui: "29046" }]]); }, 1000);
  assert.equal(out.status, "loaded");
  assert.equal(server.asked[0], "ExplanationOfBenefit?patient=p1");
  assert.equal(out.fills.length, 2);
  assert.deepEqual(looked, ["314076", "312941"]);
  assert.equal(out.ingredientOf.get("314076").rxcui, "29046");
});

test("readClaims stops asking for pages once its time is up", async () => {
  const server = pages([[claim("314076", "a", "2026-09-21")], [claim("314076", "a", "2026-09-22")], [claim("314076", "a", "2026-09-23")]], { slowFrom: 1, delayMs: 80 });
  const out = await readClaims(server.request, "p1", noLookup, 40);
  assert.equal(out.status, "failed");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(server.asked.length, 2);
});

test("readClaims says refused when the sign-in can't read claims", async () => {
  const request = async () => { const e = new Error("Forbidden"); e.status = 403; throw e; };
  assert.equal((await readClaims(request, "p1", noLookup, 1000)).status, "refused");
});

test("readClaims says none when there are no pharmacy claims", async () => {
  const server = pages([[claim("999", "office visit", "2026-09-21", "Aetna", "professional")]]);
  assert.equal((await readClaims(server.request, "p1", noLookup, 1000)).status, "none");
});

test("mergeClaims keeps the medicines and only marks the claims when they didn't load", () => {
  const split = { current: [item("rx:314076", "314076", "Lisinopril")], older: [], failed: false };
  const out = mergeClaims(split, { status: "failed" }, NOW);
  assert.equal(out.claims, "failed");
  assert.equal(out.current[0].fills, undefined);
});

test("mergeClaims uses both ingredient lists to match fills", () => {
  const split = { current: [item("rx:1", "1", "Lisinopril 10 MG Oral Tablet")], older: [], failed: false, ingredientOf: new Map([["1", { rxcui: "29046" }]]) };
  const result = { status: "loaded", fills: fillsFromClaims([claim("2", "lisinopril 20 MG Oral Tablet", "2026-09-21")]), ingredientOf: new Map([["2", { rxcui: "29046" }]]) };
  const out = mergeClaims(split, result, NOW);
  assert.equal(out.current.length, 1);
  assert.equal(out.current[0].fills.count, 1);
});

test("claims that were canceled, entered in error, drafts or only asked about are not fills", () => {
  const withStatus = (extra) => Object.assign(claim("314076", "lisinopril", "2026-09-21"), extra);
  assert.deepEqual(fillsFromClaims([
    withStatus({ status: "cancelled" }),
    withStatus({ status: "entered-in-error" }),
    withStatus({ status: "draft" }),
    withStatus({ status: "active", use: "preauthorization" }),
    withStatus({ status: "active", use: "predetermination" })
  ]), []);
  assert.equal(fillsFromClaims([withStatus({ status: "active", use: "claim" })]).length, 1);
});

test("a fill with no date still reads well in the code", () => {
  assert.equal(fillNote({ count: 1, last: null, insurers: ["Aetna"], cash: false }), "Filled, date not given (Aetna claims), 1 fill");
  assert.equal(fillNote({ count: 2, last: null, insurers: ["Aetna"], cash: false }), "Filled, dates not given (Aetna claims), 2 fills");
});

test("a fill dated only by month counts as recent", () => {
  const out = attachFills({ current: [], older: [] }, [{ rxcui: "1", name: "sertraline", date: "2026-10", insurer: "Aetna", cash: false }], new Map(), NOW);
  assert.equal(out.current.length, 1);
});

test("an ingredient match goes to the current medicine before a finished one", () => {
  const split = {
    current: [item("rx:1", "1", "Metoprolol A 25 MG Oral Tablet", "current", "2020-01-01"), item("rx:4", "4", "Metoprolol C 75 MG Oral Tablet", "current", "2021-01-01")],
    older: [item("rx:2", "2", "Metoprolol B 50 MG Oral Tablet", "older", "2025-06-01")],
    failed: false
  };
  const same = { rxcui: "6918" };
  const ingredients = new Map([["1", same], ["2", same], ["3", same], ["4", same]]);
  const out = attachFills(split, fillsFromClaims([claim("3", "metoprolol 100 MG Oral Tablet", "2026-09-21")]), ingredients, NOW);
  assert.equal(out.current.length, 2);
  assert.equal(out.current.find((i) => i.key === "rx:4").fills.count, 1);
  assert.equal(out.older[0].fills.count, 0);
});

test("a fill with no record joins one card when only the code, case or brand differs", () => {
  const out = attachFills({ current: [], older: [] }, [
    { rxcui: "312941", name: "sertraline 50 MG Oral Tablet", date: "2026-08-21", insurer: "Aetna", cash: false },
    { rxcui: "208149", name: "sertraline 50 MG Oral Tablet [Zoloft]", date: "2026-10-21", insurer: "Aetna", cash: false },
    { rxcui: null, name: "Sertraline 50 mg  Oral Tablet", date: "2026-09-21", insurer: null, cash: true }
  ], new Map(), NOW);
  assert.equal(out.current.length, 1);
  assert.equal(out.current[0].key, "fill:312941");
  assert.equal(out.current[0].name, "sertraline 50 MG Oral Tablet [Zoloft]");
  assert.equal(out.current[0].fills.count, 3);
  assert.deepEqual(out.current[0].otherKeys.sort(), ["fill:208149", "fill:sertraline 50 mg  oral tablet"]);
});

test("fills that share a code share a card even when the names differ", () => {
  const out = attachFills({ current: [], older: [] }, [
    { rxcui: "312941", name: "sertraline 50 MG Oral Tablet", date: "2026-10-21", insurer: "Aetna", cash: false },
    { rxcui: "312941", name: "SERTRALINE HCL 50MG TAB", date: "2026-08-21", insurer: "Aetna", cash: false }
  ], new Map(), NOW);
  assert.equal(out.current.length, 1);
  assert.equal(out.current[0].name, "sertraline 50 MG Oral Tablet");
});

test("the card's key doesn't depend on the order the claims arrive in", () => {
  const a = { rxcui: "312941", name: "sertraline 50 MG Oral Tablet", date: "2026-08-21", insurer: "Aetna", cash: false };
  const b = { rxcui: "208149", name: "sertraline 50 MG Oral Tablet [Zoloft]", date: "2026-10-21", insurer: "Aetna", cash: false };
  const key = (fills) => attachFills({ current: [], older: [] }, fills, new Map(), NOW).current[0].key;
  assert.equal(key([a, b]), key([b, a]));
});

test("a fill that links two cards by code and by name joins them into one", () => {
  const out = attachFills({ current: [], older: [] }, [
    { rxcui: "1", name: "Alpha 5 MG", date: "2026-08-21", insurer: "Aetna", cash: false },
    { rxcui: "2", name: "Beta 5 MG", date: "2026-08-22", insurer: "Aetna", cash: false },
    { rxcui: "1", name: "Beta 5 MG", date: "2026-08-23", insurer: "Aetna", cash: false }
  ], new Map(), NOW);
  assert.equal(out.current.length, 1);
  assert.equal(out.current[0].fills.count, 3);
});

test("different strengths with no record keep their own cards", () => {
  const same = { rxcui: "36437" };
  const out = attachFills({ current: [], older: [] }, [
    { rxcui: "312941", name: "sertraline 50 MG Oral Tablet", date: "2026-10-21", insurer: "Aetna", cash: false },
    { rxcui: "312940", name: "sertraline 25 MG Oral Tablet", date: "2026-10-21", insurer: "Aetna", cash: false }
  ], new Map([["312941", same], ["312940", same]]), NOW);
  assert.equal(out.current.length, 2);
});

// The fill hint (Task 8): how much a fill was for, and for how many days,
// as CARIN Blue Button writes it. Staff see it; it never settles anything.
const CARIN = "http://hl7.org/fhir/us/carin-bb/CodeSystem/C4BBSupportingInfoType";
function sized(date, quantity, days, more = {}) {
  const c = claim("314076", "lisinopril 10 MG Oral Tablet", date);
  if (quantity !== null) c.item[0].quantity = { value: quantity };
  if (days !== null) {
    c.item[0].informationSequence = [1];
    c.supportingInfo = [{ sequence: 1, category: { coding: [{ code: "dayssupply" }] }, valueQuantity: { value: days } }];
  }
  return Object.assign(c, more);
}
const summary = (claims) => attachFills({ current: [item("rx:314076", "314076", "Lisinopril")], older: [] }, fillsFromClaims(claims), new Map(), NOW).current[0].fills;

test("60 for 30 days suggests 2 a day", () => {
  const fills = fillsFromClaims([sized("2026-09-21", 60, 30)]);
  assert.equal(fills[0].quantity, 60);
  assert.equal(fills[0].daysSupply, 30);
  const out = summary([sized("2026-09-21", 60, 30)]);
  assert.deepEqual(out.suggests, { perDay: 2, quantity: 60, days: 30 });
  assert.equal(suggestNote(out), "Fill suggests about 2 a day (60 for 30 days)");
  // To the nearest half: 50 for 30 days is about 1.5.
  assert.equal(suggestNote(summary([sized("2026-09-21", 50, 30)])), "Fill suggests about 1.5 a day (50 for 30 days)");
});

test("the days supply is the item's own, else the claim's only one, from any system", () => {
  const carin = sized("2026-09-21", 60, 30);
  carin.supportingInfo[0].category.coding[0].system = CARIN;
  assert.equal(fillsFromClaims([carin])[0].daysSupply, 30);
  // The item points to the second one.
  const two = sized("2026-09-21", 60, 30);
  two.supportingInfo.push({ sequence: 2, category: { coding: [{ system: CARIN, code: "dayssupply" }] }, valueQuantity: { value: 90 } });
  two.item[0].informationSequence = [2];
  assert.equal(fillsFromClaims([two])[0].daysSupply, 90);
  // Not pointed to, but the only one on the claim.
  const only = sized("2026-09-21", 60, 30);
  delete only.item[0].informationSequence;
  assert.equal(fillsFromClaims([only])[0].daysSupply, 30);
  // Two and none pointed to: no guess.
  two.item[0].informationSequence = [];
  assert.equal(fillsFromClaims([two])[0].daysSupply, null);
  // Another kind of supporting info isn't a days supply.
  const other = sized("2026-09-21", 60, 30);
  other.supportingInfo[0].category.coding[0].code = "refillnum";
  assert.equal(fillsFromClaims([other])[0].daysSupply, null);
});

test("the newest fill with both numbers is the one that counts", () => {
  const out = summary([sized("2026-10-21", 30, 30), sized("2026-11-01", 90, null), sized("2026-08-21", 60, 30)]);
  assert.deepEqual(out.suggests, { perDay: 1, quantity: 30, days: 30 });
  // The newest says nothing sensible: no hint, not an older one instead.
  assert.equal(summary([sized("2026-10-21", 1, 90), sized("2026-08-21", 60, 30)]).suggests, null);
});

test("no hint without days supply, or out of range", () => {
  assert.equal(suggestNote(summary([sized("2026-09-21", 60, null)])), null);
  assert.equal(suggestNote(summary([sized("2026-09-21", null, 30)])), null);
  assert.equal(suggestNote(summary([sized("2026-09-21", 1, 90)])), null);
  assert.equal(suggestNote(summary([sized("2026-09-21", 400, 30)])), null);
  assert.equal(suggestNote(summary([sized("2026-09-21", 360, 30)])), "Fill suggests about 12 a day (360 for 30 days)");
  assert.equal(suggestNote(summary([sized("2026-09-21", 15, 30)])), "Fill suggests about 0.5 a day (15 for 30 days)");
  assert.equal(suggestNote(summary([sized("2026-09-21", 0, 30)])), null);
  // A list saved before the hint, and no fills at all.
  assert.equal(suggestNote({ count: 3, last: "2026-09-21", insurers: ["Aetna"], cash: false }), null);
  assert.equal(suggestNote(null), null);
  assert.equal(fillNote(summary([sized("2026-09-21", 60, 30)])), "Last filled 2026-09-21 (Aetna claims), 1 fill");
});
