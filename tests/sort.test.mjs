// The order of My medicines, and the short name on home. If these fail, the
// patient's choice is ignored, a medicine can drop out of the list, or the
// full name shows on home where others can read it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SORTS, savedSort, saveSort, shortName, sortArranged } from "../js/sort.js";

test("home shows the first name and last initial", () => {
  for (const [full, short] of [
    ["Avery Brownbag", "Avery B."],
    ["Avery Jean Brownbag", "Avery B."],
    ["Chantell123 Bartell456", "Chantell123 B."],
    ["Mrs. Avery Brownbag", "Avery B."],
    ["Dr Avery Brownbag, MD", "Avery B."],
    ["Avery Brownbag Jr.", "Avery B."],
    ["Avery Brownbag III", "Avery B."],
    ["Brownbag, Avery Jean", "Avery B."],
    ["Joates, Test O", "Test J."],
    ["  Avery   Brownbag ", "Avery B."],
    ["Élise Ångström", "Élise Å."],
    ["Avery", "Avery"],
    ["Name not recorded", "Name not recorded"],
    ["", "Name not recorded"]
  ]) assert.equal(shortName(full), short, full);
});

const med = (name, o) => Object.assign({ key: name, name, origin: "records" }, o);
const LIST = {
  current: [
    med("atorvastatin", { start: "2024-05-01T10:00:00Z", prescriber: "Dr. Patel" }),
    med("lisinopril", { start: "2026-03-02", prescriber: "Amy Chen" }),
    med("metformin", {}),
    med("sertraline", { origin: "claims", fills: { last: "2025-10-22" } }),
    med("warfarin", { start: "2025", prescriber: "Dr. Patel" })
  ],
  stopped: [med("a", { start: "2020-01-01" }), med("b", { start: "2021-01-01" })],
  older: [med("c", { start: "2019-01-01" }), med("d", { start: "2022-01-01" })]
};
const ADDED = [{ id: "1", name: "Zinc", addedAt: "2026-11-01" }, { id: "2", name: "aspirin", addedAt: "2026-11-20" }];
const names = (list) => list.map((m) => m.name);

test("A to Z", () => {
  const out = sortArranged(LIST, ADDED, "name");
  assert.deepEqual(names(out.arranged.current), ["atorvastatin", "lisinopril", "metformin", "sertraline", "warfarin"]);
  assert.deepEqual(names(out.additions), ["aspirin", "Zinc"]);
});

test("newest first, with no date last", () => {
  const out = sortArranged(LIST, ADDED, "newest");
  assert.deepEqual(names(out.arranged.current), ["lisinopril", "sertraline", "warfarin", "atorvastatin", "metformin"]);
  assert.deepEqual(names(out.arranged.stopped), ["b", "a"]);
  assert.deepEqual(names(out.arranged.older), ["d", "c"]);
  assert.deepEqual(names(out.additions), ["aspirin", "Zinc"]);
});

test("by who prescribed it, then by name, with nobody named last", () => {
  const out = sortArranged(LIST, ADDED, "prescriber");
  assert.deepEqual(names(out.arranged.current), ["lisinopril", "atorvastatin", "warfarin", "metformin", "sertraline"]);
});

// The QR code and saving use the real lists, so sorting must not touch them.
test("sorting never drops, adds or changes anything", () => {
  const before = JSON.stringify([LIST, ADDED]);
  for (const how of ["name", "newest", "prescriber", "nonsense", null]) {
    const out = sortArranged(LIST, ADDED, how);
    for (const part of ["current", "stopped", "older"]) assert.deepEqual(names(out.arranged[part]).sort(), names(LIST[part]).sort());
    assert.equal(out.additions.length, 2);
    assert.ok(out.arranged.current.every((m) => LIST.current.includes(m)), "the same entries, so their buttons still work");
  }
  assert.equal(JSON.stringify([LIST, ADDED]), before);
});

test("the phone remembers the choice, and an odd or blocked one is A to Z", () => {
  const map = new Map();
  const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
  assert.equal(savedSort(storage), "name");
  saveSort(storage, "newest");
  assert.equal(savedSort(storage), "newest");
  assert.ok([...map.keys()].every((k) => k.startsWith("brownbag:")), "Start over erases it");
  saveSort(storage, "made up");
  assert.equal(savedSort(storage), "name");
  const blocked = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } };
  assert.equal(savedSort(blocked), "name");
  saveSort(blocked, "newest");
  assert.deepEqual(SORTS.map((s) => s.text), ["A to Z", "Newest first", "Prescribed by"]);
});

test("home draws only the short name, and it works with no signal", () => {
  const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const home = /function drawHome\(arranged\) \{[\s\S]*?\n\}/.exec(read("js/app.js"))[0];
  assert.match(home, /shortName\(state\.patient\.name\)/);
  assert.doesNotMatch(home.replace("shortName(state.patient.name)", ""), /patient\.name/);
  assert.ok(read("sw.js").includes('"./js/sort.js"'));
});

// Staff need the whole name to know it's the right person.
test("the QR code keeps the full name", async () => {
  const { shareListFrom } = await import("../js/view.js");
  assert.equal(shareListFrom({ name: "Avery Brownbag", birthDate: "1950-03-14" }, LIST, ADDED).patient.name, "Avery Brownbag");
});
