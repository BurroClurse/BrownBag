// How real sources write a patient's name and birth date (docs/superpowers/
// research/2026-11-25-messy-data-findings.md, "Fixtures to build" 40-54), with
// The developer's answers: names are read as real ones, a birth date as written, and
// placeholder dates count as none. A wrong join (two people made one) is the
// dangerous mistake; a wrong split keeps a whole source out, said to the
// patient. If a test here starts failing because more join, check nothing
// different joined.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { personOf, samePerson, reconcile } from "../js/reconcile.js";
import { sourceNotices } from "../js/view.js";
import { splitToSave, splitFromSaved } from "../js/offline.js";
import { demoSource } from "../js/demo-source.js";

const fixture = (name) => JSON.parse(readFileSync(new URL("./fixtures/messy/people/" + name + ".json", import.meta.url), "utf8"));
const NAMES = fixture("names");
const DATES = fixture("birth-dates");

const same = (a, b) => samePerson(personOf(a), personOf(b));
const empty = () => ({ current: [], older: [], failed: false, placeholders: 0, noMedicines: [], heldBack: false });
const source = (id, name, patient) => ({ id, name, kind: "records", refreshes: true, patient, split: empty() });
const keptOut = (first, second) => reconcile([source("a", "Clinic", first), source("b", "Valley Clinic", second)], new Map()).keptOut;

test("case 40: US Core's old name first: the usual name is compared", () => {
  assert.equal(personOf(NAMES.oldNameFirst).family, "Baxter");
  assert.equal(same(NAMES.oldNameFirst, NAMES.baxter), true);
  assert.equal(same(NAMES.oldNameFirst, NAMES.shaw), false);
  // Only old and maiden names: nobody to compare.
  assert.equal(personOf(NAMES.onlyOldNames), null);
});

test("case 41: a nickname first: the official name is compared", () => {
  assert.deepEqual(personOf(NAMES.nicknameFirst), { family: "Chalmers", given: "Peter", middle: "James", birthDate: "1974-12-25" });
  assert.equal(same(NAMES.nicknameFirst, NAMES.chalmers), true);
});

test("case 42: text written LAST, FIRST is read as the family name first", () => {
  assert.deepEqual(personOf(NAMES.lastCommaFirst), { family: "SMART", given: "JOE", birthDate: "1976-04-29" });
  assert.equal(same(NAMES.lastCommaFirst, NAMES.smartJoe), true);
  assert.equal(same(NAMES.lastCommaFirstMiddle, NAMES.smartJoe), true);
  assert.deepEqual(keptOut(NAMES.smartJoe, NAMES.lastCommaFirst), []);
});

test("case 43: a suffix in the text is moved out of the family name", () => {
  assert.deepEqual(personOf(NAMES.textWithSuffix), { family: "Smith", given: "John", suffix: "jr", birthDate: "1960-03-04" });
  assert.equal(same(NAMES.textWithSuffix, NAMES.johnSmith), true);
  assert.equal(same(NAMES.epicDisplaySuffix, NAMES.johnSmith), true);
  // A suffix field beside a name written only as text still counts.
  assert.equal(personOf({ name: [{ text: "John Smith", suffix: ["Sr."] }], birthDate: "1960-03-04" }).suffix, "sr");
});

test("case 44: a middle name or initial inside the first given name isn't compared", () => {
  assert.equal(same(NAMES.middleInGiven, NAMES.middleApart), true);
  assert.equal(same(NAMES.initialInGiven, NAMES.baxter), true);
});

// R27: a middle name left off or cut to its initial never keeps two records
// apart, but two different middle names do.
test("case 44: twins who share a first name stay apart when their middle names differ", () => {
  const person = (given) => ({ name: [{ family: "Baxter", given }], birthDate: "1987-02-20" });
  assert.equal(same(person(["Mary Ann"]), person(["Mary Beth"])), false);
  assert.equal(same(person(["Mary", "Ann"]), person(["Mary", "Beth"])), false);
  assert.deepEqual(keptOut(person(["Mary", "Ann"]), person(["Mary Beth"])), [{ id: "b", name: "Valley Clinic", why: "no-match" }]);
  assert.equal(same(person(["Amy V."]), person(["Amy"])), true);
  assert.equal(same(person(["Amy V."]), person(["Amy Victoria"])), true);
  assert.equal(same(person(["Amy", "V"]), person(["Amy", "Victoria"])), true);
  assert.equal(same(person(["Amy V."]), person(["Amy W."])), false);
  assert.equal(same(person(["Amy V."]), person(["Amy Wendy"])), false);
  assert.equal(same(person(["Roelof Olaf"]), person(["Roelof", "Olaf"])), true);
  assert.equal(same(person(["Peter James"]), person(["Peter"])), true);
  assert.equal(same(person(["Peter James Paul"]), person(["Peter", "James"])), true);
  assert.equal(same(person(["Peter James Paul"]), person(["Peter", "John"])), false);
  // In text too, either way round.
  assert.equal(same({ name: [{ text: "BAXTER, MARY ANN" }], birthDate: "1987-02-20" }, { name: [{ text: "Mary Beth Baxter" }], birthDate: "1987-02-20" }), false);
  assert.equal(same({ name: [{ text: "BAXTER, AMY V" }], birthDate: "1987-02-20" }, { name: [{ text: "Amy Victoria Baxter" }], birthDate: "1987-02-20" }), true);
  // The first word is never an initial.
  assert.equal(same(person(["A."]), person(["Amy"])), false);
  // By hand, as the older tests call it.
  assert.equal(samePerson({ family: "Baxter", given: "Mary Ann", birthDate: "1987-02-20" }, { family: "Baxter", given: "Mary Beth", birthDate: "1987-02-20" }), false);
});

test("case 45: particles stay part of the family name, in text or not", () => {
  assert.deepEqual(personOf(NAMES.particlesInText), { family: "van de Heuvel", given: "Pieter", birthDate: "1944-11-17" });
  assert.equal(same(NAMES.particlesInText, NAMES.particlesInFamily), true);
  // A degree in suffix says nothing about who it is.
  assert.equal(same(NAMES.particlesInFamily, { name: [{ family: "Van de Heuvel", given: ["Pieter"] }], birthDate: "1944-11-17" }), true);
  // A compound surname must match in full.
  assert.equal(same(NAMES.compound, NAMES.firstPartOnly), false);
  assert.equal(same(NAMES.compound, { name: [{ family: "Garcia Lopez", given: ["Ana"] }], birthDate: "1950-02-03" }), true);
});

test("case 46: Synthea's numbers at the end of a name word don't count", () => {
  assert.equal(same(NAMES.synthea, NAMES.plain), true);
  assert.deepEqual(keptOut(NAMES.plain, NAMES.synthea), []);
  // Only at the end of a word: digits inside still count.
  assert.equal(samePerson({ family: "Jen4kins", given: "Loria", birthDate: "1971-05-01" }, { family: "Jenkins", given: "Loria", birthDate: "1971-05-01" }), false);
});

test("case 47: names in other alphabets are compared, and different ones stay apart", () => {
  assert.equal(same(NAMES.cyrillic, NAMES.cyrillic), true);
  assert.equal(same(NAMES.cyrillic, NAMES.cyrillicOther), false);
  assert.deepEqual(keptOut(NAMES.cyrillic, NAMES.cyrillic), []);
  assert.equal(same(NAMES.chinese, NAMES.chinese), true);
  assert.equal(samePerson({ family: "张", given: "无忌", birthDate: "1980-01-02" }, { family: "张", given: "三丰", birthDate: "1980-01-02" }), false);
});

test("case 47: ü and ue, ß and ss, and a dropped accent are the same letters", () => {
  assert.equal(same(NAMES.umlaut, NAMES.umlautWritten), true);
  assert.equal(same(NAMES.umlaut, NAMES.umlautDropped), true);
  assert.equal(same(NAMES.eszett, NAMES.eszettWritten), true);
  // The two ways of writing it never make each other's plain letters match.
  assert.equal(same(NAMES.umlautWritten, NAMES.umlautDropped), false);
  for (const [a, b] of [["Göbel", "Goebel"], ["Bäcker", "Baecker"], ["Núñez", "Nunez"]]) {
    assert.equal(samePerson({ family: a, given: "Al", birthDate: "1950-02-03" }, { family: b, given: "Al", birthDate: "1950-02-03" }), true, a);
  }
});

test("case 48: a placeholder birth date counts as no birth date", () => {
  for (const date of DATES.placeholder) {
    const patient = Object.assign({ birthDate: date }, DATES.commonName);
    assert.equal(personOf(patient), null, date);
    assert.equal(samePerson({ family: "Smith", given: "Mary", birthDate: date }, { family: "Smith", given: "Mary", birthDate: date }), false, date);
    assert.deepEqual(keptOut(Object.assign({}, patient, { birthDate: "1950-02-03" }), patient), [{ id: "b", name: "Valley Clinic", why: "no-identity" }], date);
  }
});

test("case 49: Jr. and Sr. are two people, and so are II and III; a suffix on one side only is ignored", () => {
  assert.equal(same(NAMES.junior, NAMES.senior), false);
  assert.equal(same(NAMES.second, NAMES.third), false);
  assert.equal(same(NAMES.junior, NAMES.second), false);
  assert.equal(same(NAMES.junior, NAMES.textWithSuffix), true);
  assert.equal(same(NAMES.junior, NAMES.johnSmith), true);
  assert.equal(same(NAMES.senior, NAMES.johnSmith), true);
  assert.deepEqual(keptOut(NAMES.junior, NAMES.senior), [{ id: "b", name: "Valley Clinic", why: "no-match" }]);
  assert.equal(samePerson({ family: "Smith Jr.", given: "Al", birthDate: "1950-02-03" }, { family: "Smith, Sr.", given: "Al", birthDate: "1950-02-03" }), false);
});

test("case 50: a day and month swapped is kept out as not matching", () => {
  assert.equal(same(DATES.newborn, DATES.newbornSwapped), false);
  const out = keptOut(DATES.newborn, DATES.newbornSwapped);
  assert.deepEqual(out, [{ id: "b", name: "Valley Clinic", why: "no-match" }]);
  assert.deepEqual(sourceNotices({ keptOut: out }), ["Records from Valley Clinic don't match your name and birth date, so they aren't on your list."]);
});

test("case 51: a birth date written as a datetime is its first 10 characters", () => {
  assert.equal(personOf(DATES.asDateTime).birthDate, "1950-01-02");
  // Never turned into local time, which would move it a day.
  assert.equal(personOf(DATES.lateDateTime).birthDate, "1950-01-02");
  assert.equal(same(DATES.asDateTime, DATES.asDate), true);
  assert.equal(same(DATES.lateDateTime, DATES.asDate), true);
  assert.deepEqual(keptOut(DATES.asDate, DATES.asDateTime), []);
  assert.equal(personOf({ name: DATES.asDate.name, birthDate: "1950-01-02 garbage" }), null);
  assert.equal(personOf({ name: DATES.asDate.name, birthDate: "1950-01" }), null);
});

test("case 52: a date shifted a day by a converter is kept out as not matching", () => {
  assert.equal(same(DATES.shifted, DATES.asDate), false);
  assert.deepEqual(keptOut(DATES.asDate, DATES.shifted), [{ id: "b", name: "Valley Clinic", why: "no-match" }]);
});

test("case 53: _birthDate with a data-absent-reason is no birth date", () => {
  assert.equal(personOf(DATES.absent), null);
  assert.equal(personOf(DATES.absentBeside), null);
  assert.deepEqual(keptOut(DATES.asDate, DATES.absent), [{ id: "b", name: "Valley Clinic", why: "no-identity" }]);
  assert.deepEqual(sourceNotices({ keptOut: keptOut(DATES.asDate, DATES.absent) }), ["Valley Clinic didn't share a name and birth date, so its records aren't on your list."]);
  // A birth time beside the date is ignored.
  assert.equal(personOf(DATES.newborn).birthDate, "2017-09-05");
});

test("case 54: a given name written as a string is one name, not its letters", () => {
  assert.equal(personOf(NAMES.givenString).given, "Ann");
  assert.equal(same(NAMES.givenString, NAMES.givenArray), true);
  assert.equal(same(NAMES.givenString, NAMES.givenInitial), false);
});

test("the kept-out line says the records don't match, and an old saved list reads the same", () => {
  const notice = "Records from Valley Clinic don't match your name and birth date, so they aren't on your list.";
  assert.deepEqual(sourceNotices({ keptOut: [{ id: "b", name: "Valley Clinic", why: "no-match" }] }), [notice]);
  // Saved before the new wording.
  const saved = splitToSave(Object.assign(empty(), { keptOut: [{ id: "b", name: "Valley Clinic", why: "someone-else" }] }));
  const opened = splitFromSaved(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(opened.keptOut, [{ id: "b", name: "Valley Clinic", why: "no-match" }]);
  assert.deepEqual(sourceNotices(opened), [notice]);
  assert.deepEqual(sourceNotices({ keptOut: [{ id: "b", name: "Valley Clinic", why: "someone-else" }] }), [notice]);
  assert.ok(!sourceNotices(opened).some((line) => /someone else/.test(line)));
});

test("the home server's someone-else test clinic is kept out as not matching", () => {
  const signedIn = { name: [{ text: "Loria Jenkins" }], birthDate: "1971-05-01" };
  const demo = { patient: {}, requests: [], statements: [] };
  const out = reconcile([source("a", "SMART sandbox", signedIn), demoSource(demo, signedIn, "?demo=someone-else")], new Map());
  assert.deepEqual(out.keptOut.map((kept) => kept.why), ["no-match"]);
});

// R28: suffixes spelled out or as ordinals tell father from son too.
test("Junior and Senior are two people; 2nd is II", () => {
  const person = (suffix, family = "Smith") => ({ name: [{ family, given: ["John"], suffix: [suffix] }], birthDate: "1960-03-04" });
  assert.equal(same(person("Junior"), person("Senior")), false);
  assert.equal(same(person("JUNIOR."), person("Sr")), false);
  assert.equal(same(person("2nd"), person("3rd")), false);
  assert.equal(same(person("2nd"), person("II")), true);
  assert.equal(same(person("4th."), person("IV")), true);
  assert.equal(same(person("Junior"), person("Jr.")), true);
  // Degrees say nothing about who it is.
  assert.equal(same(person("MD"), person("PhD")), true);
  assert.equal(same(person("RN"), person("Jr.")), true);
});

test("an official name with no parts falls through to the usual one", () => {
  const patient = { name: [{ use: "official" }, { use: "usual", family: "Baxter", given: ["Amy"] }], birthDate: "1987-02-20" };
  assert.deepEqual(personOf(patient), { family: "Baxter", given: "Amy", birthDate: "1987-02-20" });
  assert.equal(same(patient, NAMES.baxter), true);
  // An official name with only a first name falls through too.
  assert.equal(personOf({ name: [{ use: "official", given: ["Amy"] }, { family: "Baxter", given: ["Amy"] }], birthDate: "1987-02-20" }).family, "Baxter");
});
