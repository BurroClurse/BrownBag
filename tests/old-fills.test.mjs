// "Last filled over a year ago." (Tyler, 2026-11-26): a medicine whose newest
// fill is more than a year before the day the list is opened says so, for the
// patient and on the staff page. It is worked out on screen from the fill
// date, never put in the QR code or the FHIR file. Nothing moves or hides.
//
// "Over a year" is by the calendar: the newest fill is before the same day
// one year earlier (Feb 28 when today is Feb 29). So 365 days back is a year
// to the day, not over it, and a fill 366 days back is over a year unless a
// Feb 29 falls between.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { OLD_FILL, oldFillText, patientCard } from "../js/card.js";
import { buildShareBundle, groupShareBundle } from "../js/share.js";
import { patientSummary } from "../js/ips.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const TODAY = "2026-11-26";

test("the words", () => {
  assert.equal(OLD_FILL, "Last filled over a year ago.");
});

test("364 and 365 days back aren't over a year; 366 is", () => {
  assert.equal(oldFillText("2025-11-27", TODAY), null, "364 days");
  assert.equal(oldFillText("2025-11-26", TODAY), null, "365 days, a year to the day");
  assert.equal(oldFillText("2025-11-25", TODAY), OLD_FILL, "366 days");
  assert.equal(oldFillText("1979-02-15", TODAY), OLD_FILL);
  assert.equal(oldFillText("2026-11-26", TODAY), null, "today");
});

test("a leap day in between, or as today, goes by the calendar", () => {
  // 2027-03-01 to 2028-03-01 is 366 days, with Feb 29: a year to the day.
  assert.equal(oldFillText("2027-03-01", "2028-03-01"), null);
  assert.equal(oldFillText("2027-02-28", "2028-03-01"), OLD_FILL);
  // Today Feb 29: a year back is Feb 28.
  assert.equal(oldFillText("2027-02-28", "2028-02-29"), null);
  assert.equal(oldFillText("2027-02-27", "2028-02-29"), OLD_FILL);
  // A fill on Feb 29, a year later.
  assert.equal(oldFillText("2028-02-29", "2029-02-28"), null);
  assert.equal(oldFillText("2028-02-28", "2029-03-01"), OLD_FILL);
});

test("a fill date with less in it says so only when all of it is over a year back", () => {
  assert.equal(oldFillText("2025-11", TODAY), null, "Nov 2025 could be the 30th");
  assert.equal(oldFillText("2025-10", TODAY), OLD_FILL);
  assert.equal(oldFillText("2025", TODAY), null);
  assert.equal(oldFillText("2024", TODAY), OLD_FILL);
  // A date and time: the date as written.
  assert.equal(oldFillText("2025-11-25T23:59:00-10:00", TODAY), OLD_FILL);
  assert.equal(oldFillText("2025-11-26T00:00:00Z", TODAY), null);
  for (const odd of [null, undefined, "", "soon", "2025-13-01"]) assert.equal(oldFillText(odd, TODAY), null, String(odd));
  // No day to count from: nothing.
  assert.equal(oldFillText("1979-02-15", null), null);
});

const ITEM = { key: "rx:1", name: "Penicillin V Potassium 250 MG Oral Tablet", rxcui: "834060", dose: null, route: null, frequency: null, prescriber: null, source: "SMART sandbox", count: 1, origin: "records" };
const item = (o) => Object.assign({}, ITEM, o);
const OLD = { count: 1, last: "1979-02-15", insurers: ["Humana"], cash: false };
const RECENT = { count: 2, last: "2026-09-10", insurers: ["Humana"], cash: false };

test("the patient's card says it, beside the fills, only for an old fill", () => {
  const card = patientCard(item({ fills: OLD }), true, TODAY);
  assert.ok(card.flags.includes(OLD_FILL), JSON.stringify(card.flags));
  assert.deepEqual(card.facts.find(([label]) => label === "Filled"), ["Filled", "Once, Feb 15, 1979"]);
  assert.ok(!patientCard(item({ fills: RECENT }), true, TODAY).flags.includes(OLD_FILL));
  // Prescription only: no fills, no note.
  assert.ok(!patientCard(item({}), true, TODAY).flags.includes(OLD_FILL));
  assert.ok(!patientCard(item({ fills: { count: 0, last: null, insurers: [], cash: false } }), true, TODAY).flags.includes(OLD_FILL));
  // Claims that didn't load show no fills, so nothing about them.
  assert.ok(!patientCard(item({ fills: OLD }), false, TODAY).flags.includes(OLD_FILL));
  // A medicine only insurance knows about.
  const claimsOnly = { key: "claims:1", name: "sertraline", origin: "claims", source: "Humana claims", fills: OLD };
  assert.ok(patientCard(claimsOnly, true, TODAY).flags.includes(OLD_FILL));
});

const LIST = {
  patient: { name: "Chantell Bartell", birthDate: "1974-05-08" },
  current: [item({ fills: OLD }), item({ key: "rx:2", name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", fills: RECENT }), item({ key: "rx:3", name: "metformin", rxcui: "861007" }), { key: "claims:1", name: "sertraline", rxcui: "312941", origin: "claims", source: "Humana claims", fills: OLD }],
  additions: [],
  stopped: [],
  allergies: { cards: [], statements: [], saidNone: null, unspecified: 0 }
};
const NOW = new Date("2026-11-26T12:00:00Z");
const WARNINGS = { recordsUpdatedAt: "2026-11-26T11:00:00.000Z", claims: "loaded", allergies: { status: "loaded", savedAt: null, updatedAt: "2026-11-26T11:00:00.000Z" } };
const bundle = () => JSON.parse(JSON.stringify(buildShareBundle(LIST, NOW, WARNINGS, 2)));

test("staff see it from the fill dates the code already has, in the same part", () => {
  const groups = groupShareBundle(bundle(), TODAY);
  const flagged = (row) => row.flags.includes(OLD_FILL);
  assert.deepEqual(groups.fromRecords.map((row) => [row.name, flagged(row)]), [["Penicillin V Potassium 250 MG Oral Tablet", true], ["lisinopril 10 MG Oral Tablet", false], ["metformin", false]]);
  assert.deepEqual(groups.fromClaims.map((row) => [row.name, flagged(row)]), [["sertraline", true]]);
  // The same words as the patient's card, from the same helper.
  const staff = groups.fromRecords[0];
  const mine = patientCard(LIST.current[0], true, TODAY);
  assert.deepEqual(staff.flags, mine.flags);
  assert.deepEqual(staff.facts.filter(([label]) => label === "Filled"), mine.facts.filter(([label]) => label === "Filled"));
  // Counted from the day it's opened.
  assert.ok(!groupShareBundle(bundle(), "1979-03-01").fromRecords[0].flags.includes(OLD_FILL));
});

test("it's never in the QR code or the FHIR file", () => {
  const code = bundle();
  assert.ok(!JSON.stringify(code).includes("over a year"));
  // Read with no day, as the file's maker reads it.
  assert.ok(groupShareBundle(code).fromRecords.every((row) => !row.flags.includes(OLD_FILL)));
  const file = JSON.stringify(patientSummary(code, { now: NOW, uuid: () => "00000000-0000-4000-8000-000000000001" }));
  assert.ok(!file.includes("over a year"));
  assert.match(read("js/ips.js"), /groupShareBundle\(bundle\);/);
});

test("the staff page, My medicines and See what's inside count from today", () => {
  assert.match(read("js/share-view.js"), /groupShareBundle\(bundle, localDate\(new Date\(\)\)\)/);
  const app = read("js/app.js");
  assert.match(app, /groupShareBundle\(opened, today\(\)\)/);
  const calls = app.match(/patientCard\([^;]*\)\)?;/g).filter((text) => text.includes("claims"));
  assert.equal(calls.length, 2);
  for (const call of calls) assert.match(call, /, today\(\)\)/, call);
});

test("west of UTC, today is the phone's own day", () => {
  // 03:00 UTC on Nov 26 is still Nov 25 in Los Angeles.
  const script = 'import { localDate } from "./js/card.js"; console.log(localDate(new Date("2026-11-26T03:00:00Z")))';
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: new URL("..", import.meta.url), env: Object.assign({}, process.env, { TZ: "America/Los_Angeles" }), encoding: "utf8" }).trim();
  assert.equal(out, "2026-11-25");
});
