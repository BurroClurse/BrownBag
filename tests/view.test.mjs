import test from "node:test";
import assert from "node:assert/strict";
import { formatName, arrangeList, shareListFrom, detailLine, sourceLine, countLine, makeAddition, localDate, latestOnly, emptyRecordsText } from "../js/view.js";

function item(key, name, extra = {}) {
  return Object.assign({
    key, rxcui: null, name, dose: "1 tablet", route: "Oral", frequency: "once a day",
    start: "2023-03-02", end: null, prescriber: "Dr. Patel", source: "SMART sandbox",
    status: "current", origin: "records", lastDate: "2023-03-02", count: 1
  }, extra);
}

test("formatName prefers the official name and handles missing parts", () => {
  assert.equal(formatName({ name: [{ use: "usual", text: "Jan" }, { use: "official", given: ["Jane", "Q"], family: "Example" }] }), "Jane Q Example");
  assert.equal(formatName({ name: [{ text: "Abdul Koepp" }] }), "Abdul Koepp");
  assert.equal(formatName({}), "Name not recorded");
});

test("arrangeList moves stopped medicines out of the current list", () => {
  var arranged = arrangeList(
    { current: [item("rx:1", "Lisinopril"), item("rx:2", "Metformin")], older: [item("rx:3", "Old one", { status: "older" })] },
    { additions: [], stopped: { "rx:2": "2026-10-01" } }
  );
  assert.deepEqual(arranged.current.map((i) => i.key), ["rx:1"]);
  assert.deepEqual(arranged.stopped.map((i) => [i.key, i.stoppedAt]), [["rx:2", "2026-10-01"]]);
  assert.deepEqual(arranged.older.map((i) => i.key), ["rx:3"]);
});

test("arrangeList ignores stopped marks for medicines no longer current", () => {
  var arranged = arrangeList({ current: [], older: [] }, { additions: [], stopped: { "rx:9": "2026-10-01" } });
  assert.equal(arranged.stopped.length, 0);
});

test("shareListFrom leaves older prescriptions off", () => {
  var arranged = arrangeList(
    { current: [item("rx:1", "Lisinopril")], older: [item("rx:3", "Old one", { status: "older" })] },
    { additions: [], stopped: {} }
  );
  var addition = makeAddition({ name: "Vitamin D3", rxcui: null, dose: "1 capsule", frequency: "daily" }, new Date("2026-11-20T12:00:00Z"));
  var list = shareListFrom({ name: "Jane Example", birthDate: "1961-04-02" }, arranged, [addition]);
  assert.deepEqual(list.current.map((i) => i.name), ["Lisinopril"]);
  assert.deepEqual(list.additions.map((a) => a.name), ["Vitamin D3"]);
  assert.equal(list.stopped.length, 0);
  assert.deepEqual(list.patient, { name: "Jane Example", birthDate: "1961-04-02" });
});

test("detailLine joins what is known and skips what isn't", () => {
  assert.equal(detailLine(item("rx:1", "x")), "1 tablet · Oral · once a day");
  assert.equal(detailLine(item("rx:1", "x", { dose: null, route: null, frequency: null })), "");
});

test("sourceLine names the prescriber, start date and source", () => {
  assert.equal(sourceLine(item("rx:1", "x")), "Dr. Patel · since 2023-03-02 · SMART sandbox");
  assert.equal(sourceLine(item("rx:1", "x", { prescriber: null, start: null })), "SMART sandbox");
});

test("countLine only speaks up for repeats", () => {
  assert.equal(countLine(item("rx:1", "x")), null);
  assert.equal(countLine(item("rx:1", "x", { count: 6 })), "In your records 6 times");
});

test("makeAddition trims the name and stamps the date", () => {
  var addition = makeAddition({ name: "  Fish oil ", rxcui: "", dose: "", frequency: "daily" }, new Date("2026-11-20T12:00:00Z"));
  assert.equal(addition.name, "Fish oil");
  assert.equal(addition.rxcui, null);
  assert.equal(addition.dose, null);
  assert.equal(addition.addedAt, "2026-11-20");
  assert.match(addition.id, /^[a-z0-9]{8,}$/);
});

test("makeAddition refuses an empty name", () => {
  assert.throws(() => makeAddition({ name: "   " }, new Date()), /name/);
});

test("sourceLine shows the start date only, not the time", () => {
  assert.equal(sourceLine(item("rx:1", "x", { start: "2023-11-21T20:36:37+00:00" })), "Dr. Patel · since 2023-11-21 · SMART sandbox");
});

test("localDate uses the phone's own date, not UTC", () => {
  // 8:30 PM local on Nov 20 is already Nov 21 in UTC west of Greenwich.
  assert.equal(localDate(new Date(2026, 10, 20, 20, 30)), "2026-11-20");
});

test("makeAddition stamps the local date", () => {
  assert.equal(makeAddition({ name: "Fish oil" }, new Date(2026, 10, 20, 23, 59)).addedAt, "2026-11-20");
});

test("latestOnly drops an older search that finishes after a newer one started", async () => {
  var release = {};
  var search = latestOnly((term) => new Promise((resolve) => { release[term] = () => resolve(term); }));
  var shown = [];
  var older = search("ibupro").then((r) => { if (r.isLatest) shown.push(r.value); });
  var newer = search("ibuprofen").then((r) => { if (r.isLatest) shown.push(r.value); });
  release["ibupro"]();
  release["ibuprofen"]();
  await Promise.all([older, newer]);
  assert.deepEqual(shown, ["ibuprofen"]);
});

test("latestOnly can be told the typing changed, so nothing in flight is shown", async () => {
  var release;
  var search = latestOnly(() => new Promise((resolve) => { release = resolve; }));
  var pending = search("ibu");
  search.cancel();
  release("x");
  assert.equal((await pending).isLatest, false);
});

test("latestOnly quietly drops an older search that fails", async () => {
  var fail;
  var search = latestOnly((term) => term === "ibu" ? new Promise((resolve, reject) => { fail = reject; }) : Promise.resolve(term));
  var older = search("ibu");
  await search("ibuprofen");
  fail(new Error("network"));
  assert.equal((await older).isLatest, false);
});

test("countLine says how long a medicine has been prescribed", () => {
  assert.equal(countLine(item("rx:1", "x", { count: 6, firstDate: "2019-06-01T10:00:00Z" })), "Prescribed 6 times since 2019");
});

test("sourceLine shows an end date when there is one", () => {
  assert.equal(sourceLine(item("rx:1", "x", { end: "2024-05-01" })), "Dr. Patel · since 2023-03-02 · until 2024-05-01 · SMART sandbox");
});

test("emptyRecordsText explains why From your records is empty", () => {
  assert.equal(emptyRecordsText({ current: [], older: [] }, { current: [], stopped: [] }), "No medicines in your records.");
  assert.equal(emptyRecordsText({ current: [], older: [item("rx:2", "y")] }, { current: [], stopped: [] }), "No current medicines in your records.");
  assert.equal(emptyRecordsText({ current: [item("rx:1", "x")], older: [] }, { current: [], stopped: [item("rx:1", "x")] }), "You've marked all your current medicines stopped.");
  assert.equal(emptyRecordsText({ current: [item("rx:1", "x")], older: [] }, { current: [item("rx:1", "x")], stopped: [] }), null);
});
