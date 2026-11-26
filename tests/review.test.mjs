// The review: one card per screen when the records disagree (spec, section 6).
// What it says and what an answer keeps; the screen itself is in app.js.
import test from "node:test";
import assert from "node:assert/strict";
import { logChange } from "../js/view.js";
import { answerChanges, checkText, choicesFor, answerFor, applyAnswer, questionText, reviewButton, REVIEW_SPOT, saveSpot, spotFrom, clearSpot } from "../js/review.js";
import { isMarkFingerprint } from "../js/reconcile.js";
import { readFileSync } from "node:fs";
import { arrangeList } from "../js/view.js";

const CLINIC = "Valley Clinic (test records)";

function side(key, sourceId, sourceName, more) {
  return Object.assign({ sourceId, sourceName, kind: "records", asOf: "2026-03-10", name: "lisinopril 10 MG Oral Tablet", dose: "10 mg", route: null, frequency: "once a day", status: "current", recordStatus: "active", key }, more || {});
}

// Riley's lisinopril: the sandbox says 10 mg in March, the clinic 20 mg in October.
function lisinopril() {
  const sides = [
    side("rx:314076", "smart-sandbox", "SMART sandbox"),
    side("rx:314077", "valley-clinic-demo", CLINIC, { asOf: "2026-10-26", name: "lisinopril 20 MG Oral Tablet", dose: "20 mg" })
  ];
  return {
    key: "rx:314077", name: "lisinopril 20 MG Oral Tablet", status: "current", sourceId: "valley-clinic-demo", source: CLINIC,
    group: { id: "29046", sources: ["SMART sandbox", CLINIC], verdicts: ["dose"], sides, fingerprint: "fp-lisinopril", notes: [] }
  };
}

// Riley's atorvastatin: current in the sandbox, stopped at the clinic, filled since.
function atorvastatin(fills) {
  const sides = [
    side("rx:617310", "smart-sandbox", "SMART sandbox", { asOf: "2026-01-29", name: "atorvastatin 20 MG Oral Tablet", dose: "1 tablet" }),
    side("rx:617310", "valley-clinic-demo", CLINIC, { asOf: "2026-10-11", name: "atorvastatin 20 MG Oral Tablet", dose: "1 tablet", status: "not-current", recordStatus: "stopped" })
  ];
  return {
    key: "rx:617310", name: "atorvastatin 20 MG Oral Tablet", status: "current", sourceId: "smart-sandbox", source: "SMART sandbox",
    fills: fills || { count: 0, last: null, insurers: [] },
    group: { id: "83367", sources: ["SMART sandbox", CLINIC], verdicts: ["status"], sides, fingerprint: "fp-atorvastatin", notes: [] }
  };
}

const asked = (card, data) => arrangeList({ current: [card], older: [] }, data || {}).toCheck[0];

test("the box counts what to check", () => {
  assert.deepEqual(checkText(1), { line: "Your records don't agree on 1 thing", button: "Check it" });
  assert.deepEqual(checkText(2), { line: "Your records don't agree on 2 things", button: "Check them" });
});

test("dose choices", () => {
  const choices = choicesFor(asked(lisinopril()), "2026-11-25");
  assert.deepEqual(choices.map((c) => c.label), ["10 mg, once a day", "20 mg, once a day", "I don't take this anymore", "Not sure, ask my doctor"]);
  assert.deepEqual(choices.map((c) => c.detail), ["SMART sandbox, Mar 2026", CLINIC + ", Oct 2026", "", ""]);
  assert.deepEqual(choices.map((c) => c.value), ["smart-sandbox", "valley-clinic-demo", "not-taking", "not-sure"]);
});

test("schedule choices are each source's, oldest first", () => {
  const card = lisinopril();
  card.group.verdicts = ["schedule"];
  card.group.sides = [
    side("rx:105585", "valley-clinic-demo", CLINIC, { asOf: "2026-10-16", name: "methotrexate 2.5 MG Oral Tablet", dose: "4 tablet", frequency: "once a day" }),
    side("rx:105585", "smart-sandbox", "SMART sandbox", { asOf: "2026-06-28", name: "methotrexate 2.5 MG Oral Tablet", dose: "4 tablet", frequency: "once a week" })
  ];
  const choices = choicesFor(asked(card), "2026-11-25");
  assert.deepEqual(choices.map((c) => c.label), ["2.5 MG, 4 tablet, once a week", "2.5 MG, 4 tablet, once a day", "I don't take this anymore", "Not sure, ask my doctor"]);
  assert.deepEqual(choices.map((c) => c.detail), ["SMART sandbox, Jun 2026", CLINIC + ", Oct 2026", "", ""]);
});

test("a stopped source's dose is never a choice for how much", () => {
  const card = lisinopril();
  card.group.sides = card.group.sides.concat(side("rx:1", "county", "County Clinic", { asOf: "2025-01-02", dose: "40 mg", name: "lisinopril 40 MG Oral Tablet", status: "not-current" }));
  assert.deepEqual(choicesFor(asked(card), "2026-11-25").map((c) => c.value), ["smart-sandbox", "valley-clinic-demo", "not-taking", "not-sure"]);
});

test("a side with no date says only its source", () => {
  const card = lisinopril();
  card.group.sides[0] = side("rx:314076", "smart-sandbox", "SMART sandbox", { asOf: null });
  // And goes after the dated one.
  const choices = choicesFor(asked(card), "2026-11-25");
  assert.deepEqual(choices.slice(0, 2).map((c) => [c.value, c.detail]), [["valley-clinic-demo", CLINIC + ", Oct 2026"], ["smart-sandbox", "SMART sandbox"]]);
});

test("status choices with a fill", () => {
  const card = asked(atorvastatin({ count: 1, last: "2026-10-03", insurers: ["Test Health Plan"] }));
  const choices = choicesFor(card, "2026-11-25");
  assert.deepEqual(choices.map((c) => c.label), ["Yes, I take it", "No, I stopped", "Not sure, ask my doctor"]);
  assert.match(choices[0].detail, /Filled Oct 2026$/);
  assert.equal(choices[0].detail, "SMART sandbox says current, Jan 2026. Filled Oct 2026");
  assert.equal(choices[1].detail, CLINIC + " says stopped, Oct 2026");
  assert.equal(choices[2].detail, "");
  assert.deepEqual(choices.map((c) => c.value), ["smart-sandbox", "not-taking", "not-sure"]);
});

test("a fill more than a year old isn't said", () => {
  const card = asked(atorvastatin({ count: 1, last: "2025-10-03", insurers: ["Test Health Plan"] }));
  assert.equal(choicesFor(card, "2026-11-25")[0].detail, "SMART sandbox says current, Jan 2026");
});

test("with two sources saying current, Yes is the newest one's", () => {
  const card = atorvastatin();
  card.group.sides.push(side("rx:617310", "county", "County Clinic", { asOf: "2026-08-01", name: "atorvastatin 20 MG Oral Tablet", dose: "1 tablet" }));
  const choices = choicesFor(asked(card), "2026-11-25");
  assert.equal(choices[0].value, "county");
  assert.equal(choices[0].detail, "County Clinic says current, Aug 2026");
});

test("a mark against a newer prescription is asked about the mark", () => {
  const card = { key: "rx:1", name: "Lisinopril", status: "current", source: "SMART sandbox", lastDate: "2026-10-02" };
  const question = asked(card, { stopped: { "rx:1": "2026-03-03" } });
  const choices = choicesFor(question, "2026-11-25");
  assert.deepEqual(choices.map((c) => c.label), ["Yes, I take it", "No, I stopped", "Not sure, ask my doctor"]);
  assert.deepEqual(choices.map((c) => c.value), ["taking", "not-taking", "not-sure"]);
  assert.deepEqual(choices.map((c) => c.detail), ["SMART sandbox says current, Oct 2026", "", ""]);
  assert.equal(questionText(question), "Do you still take it?");
  // R2: the mark's own group id and fingerprint, and no sides with no group.
  assert.deepEqual(answerFor(question, "not-sure", "2026-11-25"), { groupId: "rx:1", fingerprint: "mark:2026-03-03>2026-10-02", sides: [], choice: "not-sure", answeredAt: "2026-11-25" });
});

test("a mark on one source's copy names the other source", () => {
  const card = lisinopril();
  card.group.verdicts = [];
  const question = asked(card, { stopped: { "rx:314076": "2026-03-03" } });
  assert.equal(question.question.why, "You marked this Not taking on Mar 3. " + CLINIC + " lists it current, Oct 2026.");
  const choices = choicesFor(question, "2026-11-25");
  assert.deepEqual(choices.map((c) => c.value), ["taking", "not-taking", "not-sure"]);
  assert.equal(choices[0].detail, CLINIC + " says current, Oct 2026");
  const answer = answerFor(question, "not-taking", "2026-11-25");
  assert.equal(answer.groupId, "29046");
  assert.equal(answer.fingerprint, question.question.fingerprint);
  assert.deepEqual(answer.sides, card.group.sides);
});

// Found in Chromium: every copy marked in March, both newer. "Yes" names
// the record the sentence names, not another one.
test("a mark on every copy names the same record as its sentence", () => {
  const card = lisinopril();
  card.group.verdicts = [];
  card.group.sides[0] = side("rx:314076", "smart-sandbox", "SMART sandbox", { asOf: "2026-07-28" });
  const question = asked(card, { stopped: { "rx:314076": "2026-03-01", "rx:314077": "2026-03-01" } });
  assert.equal(question.question.why, "You marked Not taking on Mar 1. Your records have a newer prescription, Oct 26.");
  assert.equal(choicesFor(question, "2026-11-25")[0].detail, CLINIC + " says current, Oct 2026");
  // Only the newer copy marked: the older one that still lists it is named.
  const one = asked(card, { stopped: { "rx:314077": "2026-11-01" } });
  assert.equal(one.question.why, "You marked this Not taking on Nov 1. SMART sandbox lists it current, Jul 2026.");
  assert.equal(choicesFor(one, "2026-11-25")[0].detail, "SMART sandbox says current, Jul 2026");
});

test("an answer remembers the sides", () => {
  const card = asked(lisinopril());
  assert.deepEqual(answerFor(card, "valley-clinic-demo", "2026-11-25"), { groupId: card.group.id, fingerprint: card.group.fingerprint, sides: card.group.sides, choice: "valley-clinic-demo", answeredAt: "2026-11-25" });
  // A copy, so a later change to the card's sides isn't the answer's.
  assert.notEqual(answerFor(card, "valley-clinic-demo", "2026-11-25").sides, card.group.sides);
});

test("an answer settles its card", () => {
  for (const make of [lisinopril, atorvastatin]) {
    const card = asked(make());
    for (const choice of choicesFor(card, "2026-11-25")) {
      const answers = [answerFor(card, choice.value, "2026-11-25")];
      assert.deepEqual(arrangeList({ current: [make()], older: [] }, { answers }).toCheck, [], card.name + " " + choice.value);
    }
  }
});

test("each question in words", () => {
  assert.equal(questionText(asked(lisinopril())), "How much do you take?");
  const schedule = lisinopril();
  schedule.group.verdicts = ["schedule"];
  assert.equal(questionText(asked(schedule)), "How often do you take it?");
  assert.equal(questionText(asked(atorvastatin())), "Do you still take it?");
});

test("the review spot holds only the position", () => {
  const kept = {};
  const storage = { getItem: (key) => (key in kept ? kept[key] : null), setItem: (key, value) => { kept[key] = String(value); }, removeItem: (key) => { delete kept[key]; } };
  assert.equal(REVIEW_SPOT, "brownbag-review-spot");
  assert.equal(spotFrom(storage), null);
  saveSpot(storage, 2);
  assert.deepEqual(kept, { "brownbag-review-spot": "2" });
  assert.equal(spotFrom(storage), 2);
  kept[REVIEW_SPOT] = "nonsense";
  assert.equal(spotFrom(storage), null);
  kept[REVIEW_SPOT] = "0";
  assert.equal(spotFrom(storage), null);
  saveSpot(storage, 3);
  clearSpot(storage);
  assert.deepEqual(kept, {});
});

test("the review spot never throws when storage is blocked", () => {
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal(spotFrom(blocked), null);
  assert.doesNotThrow(() => saveSpot(blocked, 1));
  assert.doesNotThrow(() => clearSpot(blocked));
  assert.equal(spotFrom(undefined), null);
});

// The developer, 2026-11-25: each card with an open question can be checked on its
// own; an answered one can be changed.
test("a card's own review button", () => {
  const open = asked(lisinopril());
  assert.deepEqual(reviewButton(open), { text: "Check this", label: "Check this: Lisinopril", id: "card-review-29046" });
  assert.deepEqual(reviewButton(asked(atorvastatin())), { text: "Check this", label: "Check this: atorvastatin 20 MG Oral Tablet", id: "card-review-83367" });
  const answers = [answerFor(open, "valley-clinic-demo", "2026-11-25")];
  const answered = arrangeList({ current: [lisinopril()], older: [] }, { answers }).current[0];
  assert.deepEqual(reviewButton(answered), { text: "Change", label: "Change: lisinopril 20 MG Oral Tablet", id: "card-review-29046" });
  // A key as a group id still makes a usable id.
  const marked = asked({ key: "rx:1", name: "Lisinopril", status: "current", source: "SMART sandbox", lastDate: "2026-10-02" }, { stopped: { "rx:1": "2026-03-03" } });
  assert.equal(reviewButton(marked).id, "card-review-rx-1");
  assert.equal(reviewButton({ key: "rx:9", name: "Metformin", status: "current" }), null);
});

// The answer logic, in one place with no page (review fix 3). The six mark
// cases: a newer prescription (no group) and a mark on one source's copy,
// each answered taking, not taking and not sure.
const TODAY = "2026-11-25";
const lone = () => ({ key: "rx:1", otherKeys: ["fill:1"], name: "Lisinopril", status: "current", source: "SMART sandbox", lastDate: "2026-10-02" });
const oneSide = () => Object.assign(lisinopril(), { group: Object.assign(lisinopril().group, { verdicts: [] }) });
const arrange = (card, data) => arrangeList({ current: [card], older: [] }, data);

test("a newer prescription answered Yes takes the marks away and saves nothing", () => {
  const data = { stopped: { "rx:1": "2026-03-03", "fill:1": "2026-03-03" }, asNeeded: {}, answers: [] };
  const after = applyAnswer(data, asked(lone(), data), "taking", TODAY);
  assert.deepEqual(after.stopped, {});
  assert.deepEqual(after.answers, []);
  assert.deepEqual(arrange(lone(), after).current.map((c) => [c.key, c.question, c.answer]), [["rx:1", undefined, undefined]]);
  // Nothing changed in what was passed in.
  assert.deepEqual(data.stopped, { "rx:1": "2026-03-03", "fill:1": "2026-03-03" });
});

test("a newer prescription answered No keeps it stopped, marked under every key", () => {
  const data = { stopped: { "rx:1": "2026-03-03" }, asNeeded: {}, answers: [] };
  const card = asked(lone(), data);
  const after = applyAnswer(data, card, "not-taking", TODAY);
  assert.deepEqual(after.stopped, { "rx:1": "2026-03-03", "fill:1": "2026-03-03" });
  assert.deepEqual(after.answers, [answerFor(card, "not-taking", TODAY)]);
  const arranged = arrange(lone(), after);
  assert.deepEqual(arranged.toCheck, []);
  assert.equal(arranged.stopped[0].answer.choice, "not-taking");
});

test("a newer prescription answered Not sure stays on the list, asked no more", () => {
  const data = { stopped: { "rx:1": "2026-03-03" }, asNeeded: {}, answers: [] };
  const after = applyAnswer(data, asked(lone(), data), "not-sure", TODAY);
  assert.deepEqual(after.stopped, { "rx:1": "2026-03-03" });
  const arranged = arrange(lone(), after);
  assert.deepEqual(arranged.toCheck, []);
  assert.equal(arranged.current[0].answer.choice, "not-sure");
});

test("a mark on one copy answered Yes takes every copy's mark away", () => {
  const data = { stopped: { "rx:314076": "2026-03-03" }, asNeeded: {}, answers: [] };
  const after = applyAnswer(data, asked(oneSide(), data), "taking", TODAY);
  assert.deepEqual(after.stopped, {});
  assert.deepEqual(after.answers, []);
  assert.deepEqual(arrange(oneSide(), after).toCheck, []);
});

test("a mark on one copy answered No marks every copy and clears As needed", () => {
  const data = { stopped: { "rx:314076": "2026-03-03" }, asNeeded: { "rx:314077": "2026-11-01" }, answers: [] };
  const card = asked(oneSide(), data);
  const after = applyAnswer(data, card, "not-taking", TODAY);
  assert.deepEqual(after.stopped, { "rx:314076": "2026-03-03", "rx:314077": "2026-03-03" });
  assert.deepEqual(after.asNeeded, {});
  assert.deepEqual(data.asNeeded, { "rx:314077": "2026-11-01" });
  const arranged = arrange(oneSide(), after);
  assert.deepEqual(arranged.toCheck, []);
  assert.equal(arranged.stopped.length, 1);
  assert.equal(arranged.stopped[0].answer.choice, "not-taking");
});

test("a mark on one copy answered Not sure keeps the marks and the card", () => {
  const data = { stopped: { "rx:314076": "2026-03-03" }, asNeeded: {}, answers: [] };
  const after = applyAnswer(data, asked(oneSide(), data), "not-sure", TODAY);
  assert.deepEqual(after.stopped, { "rx:314076": "2026-03-03" });
  const arranged = arrange(oneSide(), after);
  assert.deepEqual(arranged.toCheck, []);
  assert.equal(arranged.current[0].answer.choice, "not-sure");
});

test("a chosen side replaces the group's old answer, and leaves the marks", () => {
  const old = { groupId: "29046", fingerprint: "old", sides: [], choice: "not-sure", answeredAt: "2026-10-01" };
  const other = { groupId: "1998", fingerprint: "x", sides: [], choice: "not-sure", answeredAt: "2026-10-01" };
  const data = { stopped: {}, asNeeded: { "rx:314077": "2026-11-01" }, answers: [old, other] };
  const card = asked(lisinopril(), data);
  const after = applyAnswer(data, card, "valley-clinic-demo", TODAY);
  assert.deepEqual(after.answers, [other, answerFor(card, "valley-clinic-demo", TODAY)]);
  assert.deepEqual(after.asNeeded, { "rx:314077": "2026-11-01" });
  assert.deepEqual(after.stopped, {});
  assert.deepEqual(data.answers, [old, other]);
});

test("data saved before answers or marks existed still takes an answer", () => {
  const after = applyAnswer({ additions: [] }, asked(lisinopril()), "not-sure", TODAY);
  assert.equal(after.answers.length, 1);
  assert.deepEqual(after.additions, []);
});

// Review fixes 2, 6 and 7, in app.js and the other files' own code.
const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("a second tap on Save is ignored", () => {
  const app = source("js/app.js");
  assert.match(app, /function keepAnswer\(card, value\) \{\n  if \(!state\.review \|\| state\.review\.saving\) return;\n  state\.review\.saving = true;/);
  assert.match(app, /saveButton\.disabled = true;\n    if \(picked\) keepAnswer/);
});

test("a saved review spot is used or cleared on every way in", () => {
  const app = source("js/app.js");
  const body = (name) => app.slice(app.indexOf("async function " + name), app.indexOf("\n}\n", app.indexOf("async function " + name)));
  assert.match(body("openSavedList"), /clearSpot\(sessionStorage\)/);
  assert.match(body("signInUnavailable"), /resumeReview\(\);\n    render\(\);/);
});

test("one helper says whether an answer is about a mark", () => {
  assert.equal(isMarkFingerprint("mark:2026-03-03>2026-10-02"), true);
  assert.equal(isMarkFingerprint("[{}]"), false);
  assert.equal(isMarkFingerprint(undefined), false);
  for (const file of ["js/review.js", "js/card.js", "js/share.js", "js/view.js"]) {
    assert.doesNotMatch(source(file), /indexOf\("mark:"\)/, file);
  }
  // The day and newest-date helpers are view.js's own.
  assert.doesNotMatch(source("js/review.js"), /function dayOf|function newer\b/);
  assert.match(source("js/review.js"), /import \{[^}]*\bdayOf\b[^}]*\bnewer\b[^}]*\} from "\.\/view\.js";/);
});

test("the review opens with no signal", () => {
  assert.ok(source("sw.js").includes('"./js/review.js"'));
});

// Final review, minor 7: the review's "Filled <Mon YYYY>" and the card's
// "Last filled over a year ago." count a year the same way, so on
// 2028-03-01 a fill on 2027-03-01 is said in the review (and isn't old).
test("a fill a year ago to the day is still said", () => {
  const detail = (last) => choicesFor(asked(atorvastatin({ count: 1, last, insurers: ["Test Health Plan"] })), "2028-03-01")[0].detail;
  assert.equal(detail("2027-03-01"), "SMART sandbox says current, Jan 2026. Filled Mar 2027");
  assert.equal(detail("2027-02-28"), "SMART sandbox says current, Jan 2026");
  assert.equal(detail("2027-03"), "SMART sandbox says current, Jan 2026. Filled Mar 2027");
});

// Ruling R40: on a partial list the box stays, with no number, as the
// Medicines heading drops its count there.
test("on a partial list the box doesn't count", () => {
  assert.deepEqual(checkText(1, true), { line: "Some of your records don't agree.", button: "Check them" });
  assert.deepEqual(checkText(3, true), { line: "Some of your records don't agree.", button: "Check them" });
  assert.deepEqual(checkText(2, false), checkText(2));
  const app = source("js/app.js");
  const box = app.slice(app.indexOf("function drawCheckBox"), app.indexOf("\n}\n", app.indexOf("function drawCheckBox")));
  assert.match(box, /checkText\(count, medicinesPartial\(state\)\)/);
  assert.match(box, /setAttribute\("aria-describedby", "check-line"\)/);
  // Home still hides its line on a partial list.
  assert.match(app, /if \(arranged\.toCheck\.length && !medicinesPartial\(state\)\) \{\n    button\(actions, checkText\(arranged\.toCheck\.length\)\.line/);
});

// The developer, 2026-11-26: answers made on a saved copy are listed with the
// QR code's other changes. A mark's Yes and No are the Not taking button's.
test("an answer is a change for the QR code's list", () => {
  const dose = asked(lisinopril());
  assert.deepEqual(answerChanges(dose, "smart-sandbox", {}, TODAY), [{ kind: "answered", name: "Lisinopril", extra: { said: "10 mg, once a day", stopped: false } }]);
  assert.deepEqual(answerChanges(dose, "not-taking", {}, TODAY), [{ kind: "answered", name: "Lisinopril", extra: { said: "I don't take this anymore", stopped: true } }]);
  assert.deepEqual(answerChanges(dose, "not-sure", {}, TODAY), [{ kind: "answered", name: "Lisinopril", extra: { said: "Not sure, ask my doctor", stopped: false } }]);
  const status = asked(atorvastatin());
  assert.deepEqual(answerChanges(status, "not-taking", {}, TODAY), [{ kind: "answered", name: "atorvastatin 20 MG Oral Tablet", extra: { said: "No, I stopped", stopped: true } }]);
  assert.deepEqual(answerChanges(status, "smart-sandbox", {}, TODAY), [{ kind: "answered", name: "atorvastatin 20 MG Oral Tablet", extra: { said: "Yes, I take it", stopped: false } }]);
  // Stopping one the records disagreed on both whether and how much: named
  // as Undo names it after, so Undo takes the line back (final re-review N1).
  const both = atorvastatin();
  both.group = Object.assign({}, both.group, { verdicts: ["status", "dose"] });
  const askedBoth = asked(both);
  const [line] = answerChanges(askedBoth, "not-taking", {}, TODAY);
  assert.equal(line.name, "Atorvastatin");
  assert.deepEqual(logChange(logChange([], line.kind, line.name, line.extra), "unstopped", "Atorvastatin"), []);
  // A mark's question: as the buttons log it.
  const card = { key: "rx:1", name: "Lisinopril", status: "current", source: "SMART sandbox", lastDate: "2026-10-02" };
  const mark = asked(card, { stopped: { "rx:1": "2026-03-03" } });
  assert.deepEqual(answerChanges(mark, "taking", {}, TODAY), [{ kind: "unstopped", name: "Lisinopril" }]);
  assert.deepEqual(answerChanges(mark, "not-taking", {}, TODAY), [{ kind: "stopped", name: "Lisinopril" }]);
  assert.deepEqual(answerChanges(mark, "not-taking", { asNeeded: { "rx:1": "2026-01-01" } }, TODAY), [{ kind: "regular", name: "Lisinopril" }, { kind: "stopped", name: "Lisinopril" }]);
  assert.deepEqual(answerChanges(mark, "not-sure", {}, TODAY), [{ kind: "answered", name: "Lisinopril", extra: { said: "Not sure, ask my doctor", stopped: false } }]);
  // app.js logs them all, not only a mark's.
  const app = source("js/app.js");
  const keep = app.slice(app.indexOf("function keepAnswer"), app.indexOf("\n}\n", app.indexOf("function keepAnswer")));
  assert.match(keep, /answerChanges\(card, value, before, today\(\)\)\.forEach\(function \(change\) \{ recordChange\(change\.kind, change\.name, change\.extra\); \}\);/);
  assert.doesNotMatch(keep, /question\.mark && value/);
});

// Final review, minor 3: Save on one card (Check this or Change) goes back
// to that card's own button when it's still there, as Do this later does;
// else to the My medicines heading.
test("saving one card goes back to its own button", () => {
  const app = source("js/app.js");
  const keep = app.slice(app.indexOf("function keepAnswer"), app.indexOf("\n}\n", app.indexOf("function keepAnswer")));
  assert.match(keep, /focusId: returnTo \|\| "medicines-heading", focusElse: "medicines-heading"/);
  const render = app.slice(app.indexOf("function render()"), app.indexOf("\n}\n", app.indexOf("function render()")));
  assert.match(render, /document\.getElementById\(state\.focusId\) \|\| \(state\.focusElse && document\.getElementById\(state\.focusElse\)\)/);
});
