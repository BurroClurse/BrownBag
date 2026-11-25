import test from "node:test";
import assert from "node:assert/strict";
import { personOf, samePerson, matchOf, plainName, GROUPS } from "../js/reconcile.js";

function item(name, rxcui) {
  return { name: name, rxcui: rxcui || null, key: rxcui ? "rx:" + rxcui : "text:" + name.toLowerCase() };
}
function map(pairs) {
  var m = new Map();
  pairs.forEach(function (p) { m.set(p[0], { rxcui: p[1], name: p[2] || "x" }); });
  return m;
}

test("samePerson ignores case, accents and endings", () => {
  var a = { family: "Núñez Jr.", given: "Ana", birthDate: "1950-02-03" };
  assert.equal(samePerson(a, { family: "nunez", given: "ANA", birthDate: "1950-02-03" }), true);
  assert.equal(samePerson(a, { family: "nunez", given: "ANA", birthDate: "1950-02-04" }), false);
  assert.equal(samePerson(a, null), false);
});

test("personOf reads a name written as text", () => {
  assert.deepEqual(personOf({ name: [{ text: "Loria Jenkins" }], birthDate: "1971-05-01" }),
    { family: "Jenkins", given: "Loria", birthDate: "1971-05-01" });
  assert.equal(personOf({ name: [{ text: "Loria Jenkins" }] }), null);
  assert.deepEqual(personOf({ name: [{ family: "Ng", given: ["Al", "B"] }], birthDate: "2000-01-01" }),
    { family: "Ng", given: "Al", birthDate: "2000-01-01" });
  assert.equal(personOf(null), null);
});

test("matchOf levels", () => {
  var ing = map([["29046", "29046"], ["208161", "36437"], ["312940", "36437"], ["6809", "6809"],
    ["860975", "6809"], ["1", "29046+5487"], ["2", "29046"], ["3", "29046"], ["4", "29046"]]);
  assert.equal(matchOf(item("Sertraline 50 MG Oral Tablet [Zoloft]", "208161"), item("sertraline 50 MG Oral Tablet", "312940"), ing), "name");
  assert.equal(matchOf(item("lisinopril 10 MG Oral Tablet", "2"), item("lisinopril 20 MG Oral Tablet", "3"), ing), "ingredients");
  assert.equal(matchOf(item("metformin hydrochloride 500 MG Oral Tablet", "6809"), item("24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet", "860975"), ing), "form");
  assert.equal(matchOf(item("lisinopril / hydrochlorothiazide", "1"), item("lisinopril", "29046"), ing), "combo");
  assert.equal(matchOf(item("Lisinopril"), item("lisinopril 10 MG Oral Tablet", "2"), ing), "name-only");
  assert.equal(matchOf(item("Hydroxyzine"), item("Hydralazine"), ing), null);
  assert.equal(matchOf(item("a", "5"), item("b", "5"), ing), "rxcui");
});

test("with no ingredient map only rxcui, name and name-only are possible", () => {
  assert.equal(matchOf(item("lisinopril 10 MG Oral Tablet", "2"), item("lisinopril 20 MG Oral Tablet", "3"), new Map()), "name-only");
  assert.equal(matchOf(item("lisinopril 10 MG Oral Tablet", "2"), item("lisinopril 20 MG Oral Tablet", "3")), "name-only");
});

test("plainName and GROUPS", () => {
  assert.equal(plainName("Sertraline 50 MG  Oral Tablet [Zoloft]"), "sertraline 50 mg oral tablet");
  assert.deepEqual(GROUPS, ["rxcui", "name", "ingredients"]);
});
