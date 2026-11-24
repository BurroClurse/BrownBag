import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ICONS, optionGroups, recordsLine } from "../js/options.js";

const STATUS = { rows: [["Meds last updated", "Nov 23"], ["Allergies last updated", "Nov 23"]], note: null, signIn: false };
const ids = (groups) => groups.map((group) => group.rows.map((row) => row.id));

// Signing out is the only one that can't be taken back, so it's last, on its
// own and marked; the one people come for is first.
test("options are grouped, records first and signing out last", () => {
  const groups = optionGroups({ status: STATUS, homeScreen: false });
  assert.deepEqual(ids(groups), [["open-records"], ["save-backup", "restore-backup"], ["open-privacy"], ["sign-out"]]);
  assert.equal(groups[3].rows[0].kind, "stop");
  assert.ok(groups.slice(0, 3).every((group) => group.rows.every((row) => row.kind !== "stop")));
});

test("the Home Screen steps show only where they help", () => {
  assert.deepEqual(ids(optionGroups({ status: STATUS, homeScreen: true })), [["open-records"], ["save-backup", "restore-backup"], ["open-install", "open-privacy"], ["sign-out"]]);
});

test("every option says what it does and has an icon", () => {
  for (const group of optionGroups({ status: STATUS, homeScreen: true })) {
    for (const row of group.rows) {
      assert.ok(row.name && row.detail, row.id);
      assert.ok(ICONS[row.icon], row.id);
    }
  }
});

// What signing out does, all of it: it's for everyone, and lists stay.
test("signing out says it's for everyone and that saved lists stay, locked", () => {
  const out = optionGroups({ status: STATUS, homeScreen: false })[3].rows[0];
  assert.match(out.detail, /everyone who signed in on this phone/);
  assert.match(out.detail, /Saved lists stay on this phone, locked/);
});

test("Health records says how current they are, or what to do", () => {
  assert.equal(recordsLine(STATUS), "Meds last updated: Nov 23");
  assert.equal(recordsLine({ rows: [["Meds", "Some didn't load"]], note: null }), "Meds: Some didn't load");
  assert.equal(recordsLine(Object.assign({}, STATUS, { note: "Sign in again to update your list." })), "Sign in again to update your list.");
});

test("the options work with no signal", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/options.js"'));
});

test("Privacy opens its own page", () => {
  assert.match(readFileSync(new URL("../js/app.js", import.meta.url), "utf8"), /"open-privacy": function \(\) \{ location\.href = "\.\/privacy\.html"; \}/);
});
