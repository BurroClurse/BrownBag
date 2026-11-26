import test from "node:test";
import assert from "node:assert/strict";
import { formatName, arrangeList, shareListFrom, makeAddition, localDate, latestOnly, emptyRecordsText, medicineCount, medicinesButtonText, noticesFor , logChange, changeAlert, backToList, draftStarted, unsavedText, keepChanges, updateDoneText, updatedToast, UPDATED_SHOWS_MS, UPDATED_FADE_MS, swooshFrom, foundText, keysOf } from "../js/view.js";

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

test("arrangeList keeps As needed medicines current and marks them", () => {
  var arranged = arrangeList(
    { current: [item("rx:1", "Lisinopril"), item("rx:2", "Oxycodone"), item("rx:3", "Both")], older: [] },
    { additions: [], stopped: { "rx:3": "2026-11-21" }, asNeeded: { "rx:2": "2026-11-20", "rx:3": "2026-11-19" } }
  );
  assert.deepEqual(arranged.current.map((i) => [i.key, i.asNeededAt || null]), [["rx:1", null], ["rx:2", "2026-11-20"]]);
  // Not taking wins over As needed.
  assert.deepEqual(arranged.stopped.map((i) => i.key), ["rx:3"]);
  assert.equal(medicineCount(arranged, []), 2);
});

test("an As needed mark and its undo cancel out in the change log", () => {
  var log = logChange([], "as-needed", "Oxycodone");
  assert.deepEqual(log, [{ kind: "as-needed", name: "Oxycodone" }]);
  assert.deepEqual(logChange(log, "regular", "Oxycodone"), []);
  const at = new Date(2026, 10, 21, 8, 0).toISOString();
  assert.deepEqual(changeAlert(log, { medicines: at, allergies: null }, new Date(2026, 10, 21, 12, 0)).lines, ["Marked Oxycodone As needed"]);
  assert.deepEqual(changeAlert([{ kind: "regular", name: "Oxycodone" }], { medicines: at, allergies: null }, new Date(2026, 10, 21, 12, 0)).lines, ["Took Oxycodone off As needed"]);
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

test("emptyRecordsText explains why From your records is empty", () => {
  assert.equal(emptyRecordsText({ current: [], older: [] }, { current: [], stopped: [] }), "No medicines in your records.");
  assert.equal(emptyRecordsText({ current: [], older: [item("rx:2", "y")] }, { current: [], stopped: [] }), "No current medicines in your records.");
  assert.equal(emptyRecordsText({ current: [item("rx:1", "x")], older: [] }, { current: [], stopped: [item("rx:1", "x")] }), "You've marked all the medicines from your records Not taking.");
  assert.equal(emptyRecordsText({ current: [item("rx:1", "x")], older: [] }, { current: [item("rx:1", "x", { asNeededAt: "2026-11-20" })], stopped: [] }), "Your current medicines are under As needed.");
  assert.equal(emptyRecordsText({ current: [item("rx:1", "x")], older: [] }, { current: [item("rx:1", "x")], stopped: [] }), null);
});

test("medicineCount counts current records not marked stopped, plus additions", () => {
  const arranged = { current: [item("rx:1", "a"), item("rx:2", "b")], older: [item("rx:9", "z")], stopped: [item("rx:3", "c")] };
  assert.equal(medicineCount(arranged, [{ id: "1" }, { id: "2" }, { id: "3" }]), 5);
  assert.equal(medicineCount({ current: [], older: [], stopped: [] }, []), 0);
});

test("medicinesButtonText shows the count", () => {
  assert.equal(medicinesButtonText(0), "My medicines (0)");
  assert.equal(medicinesButtonText(8), "My medicines (8)");
});

test("a finished update floats a check for long enough to read, only when it worked", () => {
  assert.deepEqual(updatedToast({ allergyStatus: "loaded" }), { kind: "updated", text: "Up to date with your health records." });
  assert.deepEqual(updatedToast({ allergyStatus: "failed" }), { kind: "updated", text: "Your medicines are up to date. Your allergies couldn't be updated." });
  assert.equal(updatedToast({ offline: true, allergyStatus: "loaded" }), null);
  assert.equal(updatedToast({ needsSignIn: true, allergyStatus: "loaded" }), null);
  assert.equal(UPDATED_SHOWS_MS, 3000);
  assert.ok(UPDATED_FADE_MS >= 1000);
});

test("noticesFor gives one short line for each note", () => {
  const at = new Date(2026, 10, 21, 8, 0).toISOString();
  const now = new Date(2026, 10, 21, 9, 0);
  const tip = "Add Brown Bag to your Home Screen.";
  assert.deepEqual(noticesFor({ updating: true, savedAt: at, now }), [{ kind: "updating", text: "Checking your health records…" }]);
  assert.deepEqual(noticesFor({ savedAt: at, offline: true, now }), [{ kind: "offline", text: "No connection. List from Nov 21." }]);
  assert.deepEqual(noticesFor({ savedAt: at, needsSignIn: true, now }), [{ kind: "sign-in", text: "List from Nov 21. Sign in again to update it." }]);
  assert.deepEqual(noticesFor({ failed: true, now }), [{ kind: "failed", text: "Some records didn't load." }]);
  assert.deepEqual(noticesFor({ installTip: tip, now }), [{ kind: "install", text: tip }]);
  assert.deepEqual(noticesFor({ now }), []);
});

test("noticesFor puts updating first and hides the date line while updating", () => {
  const at = new Date(2026, 10, 21, 8, 0).toISOString();
  const now = new Date(2026, 10, 21, 9, 0);
  const tip = "Add Brown Bag to your Home Screen.";
  assert.deepEqual(noticesFor({ updating: true, savedAt: at, offline: true, needsSignIn: true, failed: true, installTip: tip, now }).map((n) => n.kind), ["updating", "failed", "install"]);
  assert.deepEqual(noticesFor({ savedAt: at, offline: true, needsSignIn: true, failed: true, installTip: tip, now }).map((n) => n.kind), ["offline", "failed", "install"]);
});

test("logChange keeps what changed and cancels a change that's undone", () => {
  const names = (c) => c.map((x) => x.kind + ":" + x.name);
  let c = [];
  c = logChange(c, "stopped", "Lasix 40mg");
  c = logChange(c, "added", "Vitamin D", { checked: false });
  assert.deepEqual(names(c), ["stopped:Lasix 40mg", "added:Vitamin D"]);
  c = logChange(c, "unstopped", "Lasix 40mg");
  assert.deepEqual(names(c), ["added:Vitamin D"]);
  c = logChange(c, "removed", "Vitamin D");
  assert.deepEqual(c, []);
  c = logChange(c, "removed", "Fish oil");
  assert.deepEqual(names(c), ["removed:Fish oil"]);
  c = logChange(undefined, "stopped", "Simvastatin");
  assert.deepEqual(names(c), ["stopped:Simvastatin"]);
});

test("changeAlert says exactly what changed and to get a connection", () => {
  const now = new Date(2026, 10, 21, 12, 0);
  const at = new Date(2026, 10, 21, 8, 0).toISOString();
  const alert = changeAlert([
    { kind: "stopped", name: "Lasix 40mg" },
    { kind: "added", name: "Vitamin D", checked: false },
    { kind: "removed", name: "Fish oil" },
    { kind: "unstopped", name: "Simvastatin" }
  ], { medicines: at, allergies: null }, now);
  assert.equal(alert.title, "This code isn't fully up to date");
  assert.equal(alert.intro, "It includes the changes you made since your records were last updated on Nov 21:");
  assert.deepEqual(alert.lines, [
    "Marked Lasix 40mg Not taking",
    "Added Vitamin D (name not checked)",
    "Removed Fish oil",
    "Put Simvastatin back on your list"
  ]);
  assert.equal(alert.advice, "Your medicines from your records are from Nov 21. Get a connection and open Brown Bag again to update them, then show a new code.");
});

test("changeAlert says nothing with no changes or a fresh list", () => {
  const now = new Date(2026, 10, 21, 12, 0);
  const at = new Date(2026, 10, 21, 8, 0).toISOString();
  assert.equal(changeAlert([], { medicines: at, allergies: null }, now), null);
  assert.equal(changeAlert(undefined, { medicines: at, allergies: null }, now), null);
  assert.equal(changeAlert([{ kind: "removed", name: "Fish oil" }], { medicines: null, allergies: null }, now), null);
});

test("makeAddition keeps picked amounts and schedules, null when typed", () => {
  const when = new Date("2026-11-22T12:00:00Z");
  const a = makeAddition({ name: "Lisinopril", dose: "1 tablet", frequency: "Once a day", quantity: { value: 1, unit: "tablet" }, schedule: { frequency: 1, period: 1, periodUnit: "d" } }, when);
  assert.deepEqual(a.quantity, { value: 1, unit: "tablet" });
  assert.deepEqual(a.schedule, { frequency: 1, period: 1, periodUnit: "d" });
  const b = makeAddition({ name: "Fish oil", dose: "2 gummies", frequency: "with lunch" }, when);
  assert.equal(b.quantity, null);
  assert.equal(b.schedule, null);
});

test("arrangeList keeps a stopped mark saved under another of the card's keys", () => {
  const entry = { key: "fill:1", otherKeys: ["fill:2"], name: "Sertraline", status: "current" };
  const arranged = arrangeList({ current: [entry], older: [] }, { stopped: { "fill:2": "2026-11-01" } });
  assert.equal(arranged.current.length, 0);
  assert.equal(arranged.stopped[0].stoppedAt, "2026-11-01");
  // Put back deletes the mark by this key, so it must be the marked one.
  assert.equal(arranged.stopped[0].key, "fill:2");
});

test("an As needed mark under a fill card's other key still counts", () => {
  var arranged = arrangeList(
    { current: [item("claims:1", "Sertraline", { origin: "claims", otherKeys: ["rx:312940"] })], older: [] },
    { additions: [], stopped: {}, asNeeded: { "rx:312940": "2026-11-20" } }
  );
  assert.deepEqual(arranged.current.map((i) => [i.key, i.asNeededAt]), [["rx:312940", "2026-11-20"]]);
});

test("emptyRecordsText looks only at the records, not the insurance-only medicines", () => {
  const fill = item("fill:1", "sertraline", { origin: "claims" });
  assert.equal(emptyRecordsText({ current: [fill], older: [] }, { current: [fill], stopped: [] }), "No medicines in your records.");
  assert.equal(emptyRecordsText({ current: [fill], older: [item("rx:2", "y")] }, { current: [fill], stopped: [] }), "No current medicines in your records.");
  assert.equal(emptyRecordsText({ current: [], older: [Object.assign({}, fill)] }, { current: [], stopped: [] }), "No medicines in your records.");
  assert.equal(emptyRecordsText({ current: [fill], older: [] }, { current: [], stopped: [fill] }), "No medicines in your records.");
  assert.equal(emptyRecordsText({ current: [fill, item("rx:1", "x")], older: [] }, { current: [fill], stopped: [item("rx:1", "x")] }), "You've marked all the medicines from your records Not taking.");
});

test("backToList names the list a medicine goes back to", () => {
  assert.deepEqual(backToList({ origin: "claims" }), { name: "Filled, not in your records", focusId: "fills-heading" });
  assert.deepEqual(backToList({ origin: "records" }), { name: "From your records", focusId: "records-heading" });
});

test("a draft counts as started once anything is typed or chosen", () => {
  const draft = (extra) => Object.assign({ name: "", picked: null, dose: { choice: "", other: "" }, often: { choice: "", other: "" } }, extra);
  assert.equal(draftStarted(null), false);
  assert.equal(draftStarted(draft()), false);
  assert.equal(draftStarted(draft({ name: "  " })), false);
  assert.equal(draftStarted(draft({ name: "zinc" })), true);
  assert.equal(draftStarted(draft({ dose: { choice: "1 tablet", other: "" } })), true);
  assert.equal(draftStarted(draft({ often: { choice: "other", other: "Sundays" } })), true);
});

test("unsavedText says what isn't saved and where to finish it", () => {
  assert.equal(unsavedText({ name: " zinc ", dose: {}, often: {} }), "zinc isn't saved yet. Open My medicines to finish adding it.");
  assert.equal(unsavedText({ name: "", dose: { choice: "1 tablet" }, often: {} }), "The medicine you were adding isn't saved yet. Open My medicines to finish adding it.");
});

test("an allergy change and its opposite cancel out", () => {
  let c = logChange([], "allergy-added", "Penicillin", { part: "allergies" });
  c = logChange(c, "allergy-removed", "Penicillin", { part: "allergies" });
  assert.deepEqual(c, []);
  c = logChange([], "none-said", "No known allergies", { part: "allergies" });
  assert.deepEqual(logChange(c, "none-unsaid", "No known allergies", { part: "allergies" }), []);
  // A medicine and an allergy of one name don't cancel each other.
  c = logChange([], "added", "Aspirin");
  assert.equal(logChange(c, "allergy-removed", "Aspirin", { part: "allergies" }).length, 2);
});

test("changeAlert speaks only for the part that is a saved copy", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const changes = [{ kind: "added", name: "Zinc" }, { kind: "allergy-added", name: "Penicillin", part: "allergies" }, { kind: "reaction-added", name: "Mold", part: "allergies" }, { kind: "none-said", name: "x", part: "allergies" }];
  const onlyAllergies = changeAlert(changes, { medicines: null, allergies: "2026-11-21T18:00:00Z" }, now);
  assert.deepEqual(onlyAllergies.lines, ["Added the allergy Penicillin", "Added a reaction to Mold", "Said you have no known allergies"]);
  assert.match(onlyAllergies.intro, /Nov 21/);
  assert.match(onlyAllergies.advice, /^Your allergies from your records are from Nov 21\./);
  const both = changeAlert(changes, { medicines: "2026-11-20T18:00:00Z", allergies: "2026-11-21T18:00:00Z" }, now);
  assert.equal(both.lines.length, 4);
  assert.match(both.intro, /Nov 20/);
  assert.match(both.advice, /^Your medicines and allergies from your records are from Nov 20\./);
  const onlyMeds = changeAlert(changes, { medicines: "2026-11-20T18:00:00Z", allergies: null }, now);
  assert.deepEqual(onlyMeds.lines, ["Added Zinc"]);
  assert.equal(changeAlert([changes[1]], { medicines: "2026-11-20T18:00:00Z", allergies: null }, now), null);
});

test("the log of reaction changes says what really changed", () => {
  const p = { part: "allergies" };
  const log = (...kinds) => kinds.reduce((list, kind) => logChange(list, kind, "Mold", p), []).map((c) => c.kind);
  assert.deepEqual(log("reaction-added", "reaction-removed"), []);
  assert.deepEqual(log("reaction-added", "reaction-changed"), ["reaction-added"]);
  assert.deepEqual(log("reaction-changed", "reaction-changed"), ["reaction-changed"]);
  assert.deepEqual(log("reaction-changed", "reaction-removed"), ["reaction-removed"]);
  assert.deepEqual(log("reaction-removed", "reaction-restored"), []);
  assert.deepEqual(log("reaction-added", "reaction-removed", "reaction-restored"), ["reaction-added"]);
  assert.deepEqual(log("reaction-changed", "reaction-removed", "reaction-restored"), ["reaction-changed"]);
  assert.deepEqual(log("reaction-removed", "reaction-added"), ["reaction-removed", "reaction-added"]);
  const alert = changeAlert(logChange([], "reaction-changed", "Mold", p), { medicines: null, allergies: "2026-11-21T18:00:00Z" }, new Date("2026-11-23T12:00:00Z"));
  assert.deepEqual(alert.lines, ["Changed your reaction to Mold"]);
});

test("updateDoneText never says up to date when the allergies didn't load", () => {
  assert.equal(updateDoneText("loaded"), "Up to date with your health records.");
  assert.equal(updateDoneText("failed"), "Your medicines are up to date. Your allergies couldn't be updated.");
});

test("keepChanges drops only the part that was updated", () => {
  const changes = [{ kind: "added", name: "Zinc" }, { kind: "allergy-added", name: "Penicillin", part: "allergies" }];
  assert.deepEqual(keepChanges(changes, "medicines"), [changes[1]]);
  assert.deepEqual(keepChanges(changes, "allergies"), [changes[0]]);
  assert.deepEqual(keepChanges(undefined, "allergies"), []);
});

test("a sign-in that can't read allergies gets one sign-in note, never two", () => {
  const at = new Date(2026, 10, 21, 8, 0).toISOString();
  const now = new Date(2026, 10, 21, 9, 0);
  assert.deepEqual(noticesFor({ allergiesRefused: true, now }), [{ kind: "sign-in", text: "Sign in again to add your allergies." }]);
  assert.deepEqual(noticesFor({ allergiesRefused: true, needsSignIn: true, savedAt: at, now }).map((n) => n.text), ["List from Nov 21. Sign in again to update it."]);
  assert.deepEqual(noticesFor({ allergiesRefused: true, offline: true, savedAt: at, now }).map((n) => n.kind), ["offline"]);
  assert.deepEqual(noticesFor({ allergiesRefused: true, updating: true, now }).map((n) => n.kind), ["updating"]);
  assert.deepEqual(noticesFor({ allergiesRefused: true, installTip: "x", now }).map((n) => n.kind), ["sign-in", "install"]);
});

test("sign-in asks to read allergies, and How it works says so", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["launch.html", "docs/HOW-IT-WORKS.md"]) {
    assert.ok(readFileSync(new URL("../" + file, import.meta.url), "utf8").includes("patient/AllergyIntolerance.read"), file);
  }
});

test("the swoosh always starts on the screen", () => {
  assert.deepEqual(swooshFrom({ left: 100, top: 200, width: 200, height: 300 }, 400, 800), { x: 0, y: -95 });
  assert.deepEqual(swooshFrom({ left: 100, top: -900, width: 200, height: 300 }, 400, 800), { x: 0, y: -400 });
  assert.deepEqual(swooshFrom({ left: 100, top: 2000, width: 200, height: 300 }, 400, 800), { x: 0, y: 400 });
});

// On a long list the button scrolled out of reach below the last medicine. If
// this fails, the patient has to find it at the bottom again.
test("adding comes before the medicines and stays at the top of the screen", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const drawn = /function drawMedicines\(arranged\) \{[\s\S]*?\n\}/.exec(read("js/app.js"))[0];
  assert.ok(drawn.includes("drawAdd(block)") && drawn.indexOf("drawAdd(block)") < drawn.indexOf("drawRecords("));
  assert.match(read("css/brownbag.css"), /\.add-bar \{[^}]*position: sticky; top: 0;/);
});

test("the name search says match for one, matches for more", () => {
  assert.equal(foundText(0), "No matches. You can still add it.");
  assert.equal(foundText(1), "1 match. Pick it, or keep what you typed.");
  assert.equal(foundText(4), "4 matches. Pick one, or keep what you typed.");
});

// A card from two sources (reconcile.js): one side each, oldest first.
function side(key, sourceId, sourceName, extra = {}) {
  return Object.assign({
    sourceId, sourceName, kind: "refreshing", asOf: "2026-03-01", dose: "10 mg", route: "Oral", frequency: null,
    status: "current", recordStatus: "active", key, name: "Lisinopril 10 MG Oral Tablet"
  }, extra);
}
function twoSources(verdicts = ["dose"], sides) {
  sides = sides || [
    side("rx:1", "clinic-a", "Valley Clinic"),
    side("rx:2", "clinic-b", "Mercy Health", { asOf: "2026-10-01", dose: "20 mg", name: "Lisinopril 20 MG Oral Tablet" })
  ];
  return item("rx:2", "Lisinopril 20 MG Oral Tablet", {
    group: { id: "29046", sources: ["Valley Clinic", "Mercy Health"], verdicts, sides, fingerprint: "fp-now", notes: [] }
  });
}

test("keysOf gives every key a card answers to, once each, in order", () => {
  assert.deepEqual(keysOf({ key: "fill:1", otherKeys: ["rx:2"], group: { sides: [{ key: "rx:2" }, { key: "rx:3" }] } }), ["fill:1", "rx:2", "rx:3"]);
  assert.deepEqual(keysOf({ key: "rx:1" }), ["rx:1"]);
});

test("a Not taking mark doesn't hide a newer prescription", () => {
  const card = item("rx:1", "Lisinopril", { lastDate: "2026-10-02" });
  const arranged = arrangeList({ current: [card], older: [] }, { stopped: { "rx:1": "2026-03-03" } });
  assert.deepEqual(arranged.current.map((i) => i.key), ["rx:1"]);
  assert.equal(arranged.stopped.length, 0);
  assert.deepEqual(arranged.toCheck.map((i) => i.key), ["rx:1"]);
  assert.equal(arranged.toCheck[0].question.kind, "status");
  assert.equal(arranged.toCheck[0].question.why, "You marked Not taking on Mar 3. Your records have a newer prescription, Oct 2.");
});

test("a newer prescription's question is answered by its mark and date", () => {
  const card = item("rx:1", "Lisinopril", { lastDate: "2026-10-02" });
  const answer = (choice) => ({ groupId: "rx:1", fingerprint: "mark:2026-03-03>2026-10-02", sides: [], choice, answeredAt: "2026-11-25" });
  const no = arrangeList({ current: [card], older: [] }, { stopped: { "rx:1": "2026-03-03" }, answers: [answer("not-taking")] });
  assert.deepEqual(no.stopped.map((i) => [i.key, i.stoppedAt]), [["rx:1", "2026-03-03"]]);
  assert.deepEqual(no.toCheck, []);
  const unsure = arrangeList({ current: [card], older: [] }, { stopped: { "rx:1": "2026-03-03" }, answers: [answer("not-sure")] });
  assert.deepEqual(unsure.current.map((i) => i.key), ["rx:1"]);
  assert.deepEqual(unsure.toCheck, []);
  assert.equal(unsure.current[0].answer.choice, "not-sure");
  assert.equal(unsure.current[0].question, undefined);
  // A still newer prescription asks again.
  const newer = arrangeList({ current: [Object.assign({}, card, { lastDate: "2026-11-20" })], older: [] }, { stopped: { "rx:1": "2026-03-03" }, answers: [answer("not-taking")] });
  assert.equal(newer.toCheck.length, 1);
  assert.equal(newer.toCheck[0].question.why, "You marked Not taking on Mar 3. Your records have a newer prescription, Nov 20.");
});

test("a mark on one side of a group asks", () => {
  const arranged = arrangeList({ current: [twoSources([])], older: [] }, { stopped: { "rx:1": "2026-03-03" } });
  assert.equal(arranged.stopped.length, 0);
  assert.deepEqual(arranged.current.map((i) => i.key), ["rx:2"]);
  assert.equal(arranged.toCheck.length, 1);
  assert.deepEqual([arranged.toCheck[0].question.kind, arranged.toCheck[0].question.why], ["status", "You marked this Not taking on Mar 3. Mercy Health lists it current, Oct 2026."]);
});

test("marks on every side stop the group", () => {
  const arranged = arrangeList({ current: [twoSources()], older: [] }, { stopped: { "rx:1": "2026-11-01", "rx:2": "2026-11-01" } });
  assert.equal(arranged.current.length, 0);
  assert.deepEqual(arranged.stopped.map((i) => [i.name, i.stoppedAt]), [["Lisinopril 20 MG Oral Tablet", "2026-11-01"]]);
  assert.deepEqual(arranged.toCheck, []);
});

test("a side's mark from before its record still asks", () => {
  // Mercy Health's record is newer than the mark on it.
  const arranged = arrangeList({ current: [twoSources()], older: [] }, { stopped: { "rx:1": "2026-11-01", "rx:2": "2026-09-01" } });
  assert.equal(arranged.stopped.length, 0);
  assert.equal(arranged.toCheck[0].question.why, "You marked Not taking on Sep 1. Your records have a newer prescription, Oct 1.");
});

test("a group asks one question, in the order status, dose, schedule", () => {
  const ask = (verdicts) => arrangeList({ current: [twoSources(verdicts)], older: [] }, {}).toCheck.map((i) => i.question);
  assert.deepEqual(ask(["dose"]), [{ kind: "dose", why: null, groupId: "29046", fingerprint: "fp-now" }]);
  assert.deepEqual(ask(["dose", "schedule"]).map((q) => q.kind), ["dose"]);
  assert.deepEqual(ask(["status", "dose"]).map((q) => q.kind), ["status"]);
  assert.deepEqual(ask(["schedule", "worded"]).map((q) => q.kind), ["schedule"]);
  assert.deepEqual(ask(["worded"]), []);
  assert.deepEqual(ask([]), []);
});

test("an answer holds while the fingerprint matches", () => {
  const card = twoSources();
  const answers = [{ groupId: "29046", fingerprint: "fp-now", sides: card.group.sides, choice: "clinic-b", answeredAt: "2026-11-25" }];
  const arranged = arrangeList({ current: [card], older: [] }, { answers });
  assert.deepEqual(arranged.toCheck, []);
  assert.equal(arranged.current[0].answer.choice, "clinic-b");
  assert.equal(arranged.current[0].question, undefined);
  // Another group's answer never moves to this one.
  const other = arrangeList({ current: [card], older: [] }, { answers: [Object.assign({}, answers[0], { groupId: "1998" })] });
  assert.equal(other.toCheck.length, 1);
  assert.equal(other.toCheck[0].question.why, null);
});

test("I don't take this anymore puts the group under Not taking", () => {
  const card = twoSources();
  const answers = [{ groupId: "29046", fingerprint: "fp-now", sides: card.group.sides, choice: "not-taking", answeredAt: "2026-11-25" }];
  const arranged = arrangeList({ current: [card], older: [] }, { answers });
  assert.deepEqual(arranged.stopped.map((i) => [i.key, i.stoppedAt]), [["rx:2", "2026-11-25"]]);
  assert.deepEqual(arranged.toCheck, []);
});

test("a changed side asks again and says what changed", () => {
  const then = [
    side("rx:1", "clinic-a", "Valley Clinic"),
    side("rx:2", "clinic-b", "Mercy Health", { asOf: "2026-10-01", dose: "20 mg", name: "Lisinopril 20 MG Oral Tablet" })
  ];
  const now = [then[0], side("rx:2", "clinic-b", "Mercy Health", { asOf: "2026-11-01", dose: "40 mg", name: "Lisinopril 40 MG Oral Tablet" })];
  const answers = [{ groupId: "29046", fingerprint: "fp-then", sides: then, choice: "clinic-b", answeredAt: "2026-10-20" }];
  const changed = arrangeList({ current: [twoSources(["dose"], now)], older: [] }, { answers });
  assert.equal(changed.toCheck.length, 1);
  assert.equal(changed.toCheck[0].answer, undefined);
  assert.equal(changed.toCheck[0].question.why, "Mercy Health now says 40 mg.");
  // The source the answer named is gone.
  const county = side("rx:3", "clinic-c", "County Clinic", { asOf: "2026-09-01", dose: "20 mg", name: "Lisinopril 20 MG Oral Tablet" });
  const gone = arrangeList({ current: [twoSources(["dose"], [then[0], county])], older: [] }, { answers: [Object.assign({}, answers[0], { sides: then.concat(county) })] });
  assert.equal(gone.toCheck[0].question.why, "Mercy Health didn't load.");
});

test("As needed stays with a question", () => {
  const arranged = arrangeList({ current: [twoSources()], older: [] }, { asNeeded: { "rx:1": "2026-11-20" } });
  assert.deepEqual(arranged.current.map((i) => i.asNeededAt), ["2026-11-20"]);
  assert.equal(arranged.toCheck.length, 1);
  assert.equal(arranged.toCheck[0].asNeededAt, "2026-11-20");
  assert.equal(arranged.toCheck[0].question.kind, "dose");
});

test("a card with no group never gets a question", () => {
  const arranged = arrangeList({ current: [item("rx:1", "Lisinopril"), item("rx:2", "Metformin")], older: [item("rx:3", "Old one", { status: "older" })] }, { stopped: { "rx:2": "2026-10-01" } });
  assert.deepEqual(arranged.toCheck, []);
  arranged.current.concat(arranged.stopped, arranged.older).forEach((card) => assert.equal(card.question, undefined));
});

test("a marked copy still answers to all the card's keys", () => {
  const entry = { key: "fill:1", otherKeys: ["fill:2"], name: "Sertraline", status: "current" };
  const stopped = arrangeList({ current: [entry], older: [] }, { stopped: { "fill:1": "2026-10-01", "fill:2": "2026-11-01" } }).stopped[0];
  // The newest mark names it; Undo clears both.
  assert.equal(stopped.key, "fill:2");
  assert.deepEqual(keysOf(stopped).sort(), ["fill:1", "fill:2"]);
  const needed = arrangeList({ current: [entry], older: [] }, { asNeeded: { "fill:2": "2026-11-01" } }).current[0];
  assert.deepEqual(keysOf(needed).sort(), ["fill:1", "fill:2"]);
});

test("a marked side's newer record asks again after an answer", () => {
  const card = twoSources([]);
  const marks = { stopped: { "rx:1": "2026-03-03" } };
  const asked = arrangeList({ current: [card], older: [] }, marks).toCheck[0].question;
  assert.equal(asked.fingerprint, "mark:2026-03-03>2026-10-01");
  const answers = [{ groupId: "29046", fingerprint: asked.fingerprint, sides: card.group.sides, choice: "not-taking", answeredAt: "2026-11-01" }];
  assert.equal(arrangeList({ current: [card], older: [] }, Object.assign({ answers }, marks)).stopped.length, 1);
  // Valley Clinic, the marked one, writes it again.
  const renewed = twoSources([], [
    side("rx:2", "clinic-b", "Mercy Health", { asOf: "2026-10-01", dose: "20 mg", name: "Lisinopril 20 MG Oral Tablet" }),
    side("rx:1", "clinic-a", "Valley Clinic", { asOf: "2026-11-20" })
  ]);
  const again = arrangeList({ current: [renewed], older: [] }, Object.assign({ answers }, marks));
  assert.equal(again.stopped.length, 0);
  assert.equal(again.toCheck.length, 1);
  assert.equal(again.toCheck[0].question.fingerprint, "mark:2026-03-03>2026-11-20");
});

test("the sentence names the newest dated source still listing it", () => {
  const card = twoSources([], [
    side("rx:1", "clinic-a", "Valley Clinic"),
    side("rx:2", "clinic-b", "Mercy Health", { asOf: "2026-10-01", dose: "20 mg", name: "Lisinopril 20 MG Oral Tablet" }),
    side("rx:3", "clinic-c", "County Clinic", { asOf: null })
  ]);
  const question = arrangeList({ current: [card], older: [] }, { stopped: { "rx:1": "2026-03-03" } }).toCheck[0].question;
  assert.equal(question.why, "You marked this Not taking on Mar 3. Mercy Health lists it current, Oct 2026.");
  assert.equal(question.fingerprint, "mark:2026-03-03>2026-10-01");
});

test("a side that isn't current is never said to list it current", () => {
  const card = twoSources([], [
    side("rx:1", "clinic-a", "Valley Clinic", { status: "not-current" }),
    side("rx:2", "clinic-b", "Mercy Health", { asOf: "2026-10-01", status: "unknown" })
  ]);
  const arranged = arrangeList({ current: [card], older: [] }, { stopped: { "rx:1": "2026-11-01" } });
  assert.deepEqual(arranged.toCheck, []);
  assert.equal(arranged.stopped.length, 1);
});

test("what changed is never read from a mark's answer", () => {
  const then = [
    side("rx:1", "clinic-a", "Valley Clinic"),
    side("rx:2", "clinic-b", "Mercy Health", { asOf: "2026-10-01", dose: "20 mg", name: "Lisinopril 20 MG Oral Tablet" })
  ];
  const now = [then[0], side("rx:2", "clinic-b", "Mercy Health", { asOf: "2026-11-01", dose: "40 mg", name: "Lisinopril 40 MG Oral Tablet" })];
  const answers = [{ groupId: "29046", fingerprint: "mark:2026-03-03>2026-10-01", sides: then, choice: "not-sure", answeredAt: "2026-10-20" }];
  const arranged = arrangeList({ current: [twoSources(["dose"], now)], older: [] }, { answers });
  assert.equal(arranged.toCheck.length, 1);
  assert.equal(arranged.toCheck[0].question.why, null);
});

// Two sources with the same code share a key. Only the card's own record
// answers to its other keys, so a mark under one of them never stops the
// other source's copy.
test("a mark counts each side with the same key separately", () => {
  const card = twoSources([], [
    side("rx:1", "clinic-a", "Valley Clinic", { asOf: "2026-09-01" }),
    side("rx:1", "clinic-b", "Mercy Health", { asOf: "2026-10-01" })
  ]);
  const shown = Object.assign({}, card, { key: "rx:1", sourceId: "clinic-b", source: "Mercy Health", otherKeys: ["fill:9"], lastDate: "2026-10-01" });
  const arranged = arrangeList({ current: [shown], older: [] }, { stopped: { "fill:9": "2026-11-01" } });
  assert.equal(arranged.stopped.length, 0, "Valley Clinic's copy wasn't marked");
  assert.equal(arranged.toCheck[0].question.why, "You marked this Not taking on Nov 1. Valley Clinic lists it current, Sep 2026.");
  // A side's own date, never the shown record's.
  const older = Object.assign({}, shown, { otherKeys: [], lastDate: "2026-11-20" });
  const renewed = arrangeList({ current: [older], older: [] }, { stopped: { "rx:1": "2026-11-01" } });
  assert.equal(renewed.toCheck[0].question.why, "You marked Not taking on Nov 1. Your records have a newer prescription, Nov 20.");
});

// Tyler, 2026-11-26: an answer made on a saved copy is in the QR code's list,
// in the words picked. A Change says the newest; Undo on a card an answer
// stopped takes the answer's line away, as it does a Not taking mark's.
test("answers made on a saved copy are listed", () => {
  const now = new Date(2026, 10, 21, 12, 0);
  const at = new Date(2026, 10, 21, 8, 0).toISOString();
  let c = logChange([], "answered", "Lisinopril", { said: "I don't take this anymore", stopped: true });
  c = logChange(c, "answered", "atorvastatin 20 MG Oral Tablet", { said: "Yes, I take it", stopped: false });
  assert.deepEqual(changeAlert(c, { medicines: at, allergies: null }, now).lines, [
    "Answered Lisinopril: I don't take this anymore",
    "Answered atorvastatin 20 MG Oral Tablet: Yes, I take it"
  ]);
  // A Change: one line, the newest answer.
  c = logChange(c, "answered", "Lisinopril", { said: "10 mg, once a day", stopped: false });
  assert.deepEqual(changeAlert(c, { medicines: at, allergies: null }, now).lines, [
    "Answered atorvastatin 20 MG Oral Tablet: Yes, I take it",
    "Answered Lisinopril: 10 mg, once a day"
  ]);
  // Undo on a card an answer stopped: back as it was, nothing to list.
  let s = logChange([], "answered", "Lisinopril", { said: "I don't take this anymore", stopped: true });
  assert.deepEqual(logChange(s, "unstopped", "Lisinopril"), []);
  // Undo on one stopped by an answer made before the saved copy: listed.
  assert.deepEqual(changeAlert(logChange([], "unstopped", "Lisinopril"), { medicines: at, allergies: null }, now).lines, ["Put Lisinopril back on your list"]);
  // An answer that didn't stop it isn't undone by Undo.
  s = logChange([], "answered", "Lisinopril", { said: "10 mg, once a day", stopped: false });
  assert.equal(logChange(s, "unstopped", "Lisinopril").length, 2);
});
