import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillsFromClaims, attachFills, fillLine, completedLine, claimsLabel, fillNote, readClaims, mergeClaims } from "../js/claims.js";

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
    { rxcui: "314076", name: "lisinopril 10 MG Oral Tablet", date: "2026-09-21", insurer: "Aetna", cash: false },
    { rxcui: "308191", name: "amoxicillin 500 MG Oral Capsule", date: "2026-10-10", insurer: null, cash: true }
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
  assert.deepEqual(out.current[0].fills, { count: 3, last: "2026-09-21", insurers: ["Aetna"], cash: false });
});

test("attachFills matches by ingredient when the codes differ", () => {
  const split = { current: [item("rx:1", "1", "Lisinopril 10 MG")], older: [], failed: false };
  const ingredients = new Map([["1", { rxcui: "29046" }], ["2", { rxcui: "29046" }]]);
  const out = attachFills(split, fillsFromClaims([claim("2", "lisinopril 20 MG", "2026-09-21")]), ingredients, NOW);
  assert.equal(out.current[0].fills.count, 1);
  assert.equal(out.current.length, 1);
});

test("an ingredient match that fits two medicines goes to the later one", () => {
  const split = {
    current: [item("rx:1", "1", "Metoprolol A", "current", "2020-01-01"), item("rx:2", "2", "Metoprolol B", "current", "2025-06-01")],
    older: [],
    failed: false
  };
  const ingredients = new Map([["1", { rxcui: "6918" }], ["2", { rxcui: "6918" }], ["3", { rxcui: "6918" }]]);
  const out = attachFills(split, fillsFromClaims([claim("3", "metoprolol", "2026-09-21")]), ingredients, NOW);
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

test("fillLine says how often, when last and who paid", () => {
  assert.equal(fillLine({ count: 3, last: "2025-07-23", insurers: ["Aetna"], cash: false }), "Filled 3 times · last Jul 23, 2025 · Aetna claims");
  assert.equal(fillLine({ count: 1, last: "2025-07-23", insurers: ["Aetna"], cash: false }), "Filled once · Jul 23, 2025 · Aetna claims");
  assert.equal(fillLine({ count: 1, last: "2026-10-10", insurers: [], cash: true }), "Filled once · Oct 10, 2026 · paid without insurance");
  assert.equal(fillLine({ count: 2, last: "2026-10-10", insurers: ["Aetna", "Medicare"], cash: false }), "Filled 2 times · last Oct 10, 2026 · Aetna and Medicare claims");
  assert.equal(fillLine({ count: 0 }), "No fill found in your claims");
  assert.equal(fillLine(undefined), null);
});

test("claimsLabel names who paid", () => {
  assert.equal(claimsLabel({ insurers: ["Aetna"], cash: false }), "Aetna claims");
  assert.equal(claimsLabel({ insurers: [], cash: true }), "paid without insurance");
});

test("completedLine says the record and the fill disagree", () => {
  assert.equal(completedLine("2025-12-24"), "Marked completed in your records, but filled Dec 24, 2025");
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
  const split = { current: [item("rx:1", "1", "Lisinopril 10 MG")], older: [], failed: false, ingredientOf: new Map([["1", { rxcui: "29046" }]]) };
  const result = { status: "loaded", fills: fillsFromClaims([claim("2", "lisinopril 20 MG", "2026-09-21")]), ingredientOf: new Map([["2", { rxcui: "29046" }]]) };
  const out = mergeClaims(split, result, NOW);
  assert.equal(out.current.length, 1);
  assert.equal(out.current[0].fills.count, 1);
});
