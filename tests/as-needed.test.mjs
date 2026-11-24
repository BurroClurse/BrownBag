// What's under As needed, and adding an older prescription still taken. If these
// fail, a medicine taken every day can read as "only when needed", a medicine can
// lose who said so, or an old dose can be saved without being read.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromMedicationRequest, dedupe } from "../js/meds.js";
import { arrangeList, backToList, emptyRecordsText, isAsNeeded, makeAddition } from "../js/view.js";
import { patientCard } from "../js/card.js";
import { buildShareBundle, emptyPartText, groupShareBundle, shareBundleFor } from "../js/share.js";
import { draftFromOlder, editedAddition, olderFrom } from "../js/edit.js";
import { olderQuestion, takenOlder } from "../js/older.js";
import { patientSummary } from "../js/ips.js";

const RX = "http://www.nlm.nih.gov/research/umls/rxnorm";
const NOW = new Date("2026-11-24T12:00:00Z");
const PATIENT = { name: "Avery Brownbag", birthDate: "1950-03-14" };
const med = (dosageInstruction, o = {}) => fromMedicationRequest({ resourceType: "MedicationRequest", id: "r", status: "active", authoredOn: "2026-09-01", medicationCodeableConcept: { text: "albuterol", coding: [{ system: RX, code: "745679" }] }, dosageInstruction, ...o }, "SMART sandbox");
const DAILY = { timing: { repeat: { frequency: 1, period: 1, periodUnit: "d" } } };
const PRN = { asNeededBoolean: true };
const share = (list, level) => groupShareBundle(JSON.parse(JSON.stringify(buildShareBundle({ patient: PATIENT, current: [], additions: [], stopped: [], ...list }, NOW, {}, level))));

test("a record is as needed only when every one of its directions says so in a field", () => {
  assert.equal(isAsNeeded(med([PRN])), true);
  assert.equal(isAsNeeded(med([{ asNeededCodeableConcept: { text: "pain" } }])), true);
  assert.equal(isAsNeeded(med([PRN, PRN])), true);
  assert.equal(isAsNeeded(med([PRN, DAILY])), false);
  assert.equal(isAsNeeded(med([DAILY])), false);
  assert.equal(isAsNeeded(med([{ asNeededBoolean: false, ...DAILY }])), false);
  // Words alone don't move it.
  assert.equal(isAsNeeded(med([{ text: "Take 1 as needed" }])), false);
  assert.equal(isAsNeeded(med([])), false);
  assert.equal(isAsNeeded(med(undefined)), false);
});

test("two current records of one medicine: as needed only when both say so", () => {
  const newer = { authoredOn: "2026-10-01" };
  assert.equal(isAsNeeded(dedupe([med([DAILY]), med([PRN], newer)])[0]), false);
  assert.equal(isAsNeeded(dedupe([med([PRN]), med([DAILY], newer)])[0]), false);
  assert.equal(isAsNeeded(dedupe([med([PRN]), med([PRN], newer)])[0]), true);
  // A finished one doesn't count.
  assert.equal(isAsNeeded(dedupe([med([DAILY], { status: "completed" }), med([PRN], newer)])[0]), true);
  assert.equal(isAsNeeded(dedupe([med([PRN], newer), med([DAILY], { status: "completed" })])[0]), true);
});

test("marked and added ones are as needed too; only the picked answer counts", () => {
  assert.equal(isAsNeeded({ asNeededAt: "2026-11-01" }), true);
  assert.equal(isAsNeeded(makeAddition({ name: "x", frequency: "As needed", schedule: { asNeeded: true } }, NOW)), true);
  assert.equal(isAsNeeded(makeAddition({ name: "x", frequency: "not as needed" }, NOW)), false);
});

test("each card says who said it", () => {
  const says = (e) => patientCard(e, false).facts.filter(([l]) => l === "Who says");
  assert.deepEqual(says(med([PRN])), [["Who says", "Your records say as needed"]]);
  assert.deepEqual(says(makeAddition({ name: "x", frequency: "As needed", schedule: { asNeeded: true } }, NOW)), [["Who says", "You added this"]]);
  assert.deepEqual(patientCard({ asNeededAt: "2026-11-01", origin: "records" }, false).facts, [["You marked", "As needed, Nov 1, 2026"]]);
  assert.deepEqual(says(med([DAILY])), []);
});

test("a record's one put under Not taking goes back to As needed; From your records says where they went", () => {
  const item = med([PRN]);
  const arranged = arrangeList({ current: [item], older: [] }, { stopped: { [item.key]: "2026-11-01" } });
  assert.deepEqual(backToList(arranged.stopped[0]), { name: "As needed", focusId: "as-needed-heading" });
  assert.equal(emptyRecordsText({ current: [item], older: [] }, arrangeList({ current: [item], older: [] }, {})), "Your current medicines are under As needed.");
});

test("staff get one As needed part, each with who said it, at every size of code", () => {
  const added = makeAddition({ name: "ibuprofen", frequency: "As needed", schedule: { asNeeded: true } }, NOW);
  for (const level of [0, 1, 2]) {
    const g = share({ current: [med([PRN]), Object.assign(med([DAILY]), { name: "oxycodone", asNeededAt: "2026-11-01" }), Object.assign(med([DAILY]), { name: "lisinopril" })], additions: [added] }, level);
    assert.deepEqual(g.asNeeded.map((r) => [r.name, r.facts.find(([l]) => l === "Who says")[1]]), [["albuterol", "Records say as needed"], ["oxycodone", "Patient says as needed"], ["ibuprofen", "Added by patient"]]);
    assert.deepEqual(g.fromRecords.map((r) => r.name), ["lisinopril"]);
    assert.deepEqual(g.addedByPatient, []);
    // No raw note left over.
    assert.ok(!JSON.stringify(g).includes("Records say: "));
  }
});

test("the code's FHIR says as needed, and a mixed one isn't moved for staff", () => {
  const statement = (item) => buildShareBundle({ patient: PATIENT, current: [item], additions: [], stopped: [] }, NOW, {}, 0).entry[1].resource;
  assert.equal(statement(med([PRN])).dosage[0].asNeededBoolean, true);
  const mixed = dedupe([med([DAILY]), med([PRN], { authoredOn: "2026-10-01" })])[0];
  assert.equal(share({ current: [mixed] }, 2).asNeeded.length, 0);
  assert.equal(share({ current: [mixed] }, 2).fromRecords.length, 1);
});

test("an empty part never says none when they're under As needed", () => {
  const added = makeAddition({ name: "ibuprofen", frequency: "As needed", schedule: { asNeeded: true } }, NOW);
  const g = share({ current: [med([PRN])], additions: [added] });
  assert.equal(emptyPartText(g, "records"), "All under As needed.");
  assert.equal(emptyPartText(g, "added"), "All under As needed.");
  assert.equal(emptyPartText(share({ additions: [added] }), "records"), "No medicines from records.");
  assert.equal(emptyPartText(share({ current: [med([PRN])] }), "added"), "Nothing added by the patient.");
});

test("a record put under Not taking stays there for staff", () => {
  const g = share({ stopped: [Object.assign(med([PRN]), { stoppedAt: "2026-11-01" })] });
  assert.equal(g.patientSaysStopped.length, 1);
  assert.equal(g.asNeeded.length, 0);
});

// Older prescriptions.
const OLD = Object.assign(med([DAILY], { status: "completed", authoredOn: "2019-03-04T10:00:00Z", requester: { display: "Dr. Patel" } }), { name: "lisinopril 10 MG Oral Tablet", rxcui: "314076", key: "rx:314076" });

test("the question names the medicine, what the records say and when", () => {
  assert.deepEqual(olderQuestion(OLD), ["lisinopril 10 MG Oral Tablet", "Your records say completed. Prescribed Mar 4, 2019."]);
  assert.deepEqual(olderQuestion(Object.assign({}, OLD, { prescriber: null, recordStatus: "stopped" }))[1], "Your records say stopped. From Mar 4, 2019.");
  assert.deepEqual(olderQuestion(Object.assign({}, OLD, { recordStatus: "unknown", lastDate: null, start: null })), ["lisinopril 10 MG Oral Tablet", "It isn't current in your records."]);
  assert.deepEqual(olderQuestion({ name: "x", origin: "claims", fills: { last: "2024-05-01" } })[1], "Last filled May 1, 2024.");
});

test("the form opens with the name only, never the old dose", () => {
  const draft = draftFromOlder(OLD);
  assert.equal(draft.name, OLD.name);
  assert.deepEqual(draft.picked, { rxcui: "314076", name: OLD.name });
  assert.deepEqual([draft.dose, draft.often], [{ choice: "", other: "" }, { choice: "", other: "" }]);
  assert.deepEqual(draft.older, { key: "rx:314076", name: OLD.name, date: "2019-03-04", said: "once a day" });
});

test("it's remembered only while it's the same medicine, and through an edit", () => {
  const older = draftFromOlder(OLD).older;
  assert.deepEqual(olderFrom(older, OLD.name), { key: "rx:314076", date: "2019-03-04" });
  assert.equal(olderFrom(older, "something else"), null);
  assert.equal(olderFrom(undefined, "x"), null);
  const a = makeAddition({ name: OLD.name, rxcui: "314076", older: olderFrom(older, OLD.name) }, NOW);
  assert.deepEqual(a.older, { key: "rx:314076", date: "2019-03-04" });
  const edited = (name) => editedAddition(a, { name, rxcui: "314076", dose: "1 tablet", frequency: null });
  assert.deepEqual(edited(OLD.name).older, a.older);
  assert.equal(edited("metformin").older, undefined);
  assert.ok(!("older" in makeAddition({ name: "x" }, NOW)));
});

test("the older one shows it's being taken, until that's removed", () => {
  const a = { name: OLD.name, older: { key: "rx:314076", date: "2019-03-04" } };
  assert.equal(takenOlder(OLD, [a]), true);
  assert.equal(takenOlder(OLD, []), false);
  assert.equal(takenOlder(OLD, [{ name: OLD.name }]), false);
});

test("the patient and staff see where it came from; it's still the patient's word", () => {
  const a = makeAddition({ name: OLD.name, rxcui: "314076", dose: "1 tablet", older: { key: "rx:314076", date: "2019-03-04" } }, NOW);
  assert.ok(patientCard(a, false).facts.some(([l, t]) => l === "From" && t === "An older prescription, Mar 4, 2019"));
  const g = share({ additions: [a] });
  assert.deepEqual(g.addedByPatient[0].facts, [["From", "An older prescription, Mar 4, 2019"]]);
  assert.deepEqual(share({ additions: [Object.assign({}, a, { older: { key: "k", date: null } })] }).addedByPatient[0].facts, [["From", "An older prescription"]]);
  // Nothing about the record itself goes.
  const statement = buildShareBundle({ patient: PATIENT, current: [], additions: [a], stopped: [] }, NOW).entry[1].resource;
  assert.deepEqual(statement.informationSource, { reference: "resource:0" });
  assert.ok(!JSON.stringify(statement).includes("rx:314076"));
});

test("the file for other systems still saves with all of it", async () => {
  const a = makeAddition({ name: OLD.name, rxcui: "314076", dose: "1 tablet", frequency: "As needed", schedule: { asNeeded: true }, older: { key: "rx:314076", date: "2019-03-04" } }, NOW);
  const b = buildShareBundle({ patient: PATIENT, current: [med([PRN])], additions: [a], stopped: [], allergies: { cards: [], statements: [], saidNone: null, unspecified: 0 } }, NOW, { claims: "loaded", allergies: { status: "loaded", savedAt: null, updatedAt: NOW.toISOString() } }, 2);
  const text = JSON.stringify(patientSummary(b, { now: NOW, uuid: () => "00000000-0000-4000-8000-000000000000" }));
  assert.match(text, /As needed/);
  assert.match(text, /An older prescription, Mar 4, 2019/);
});

test("the popup asks before anything opens, starting on Cancel", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const body = app.slice(app.indexOf("function askOlder")).split("\n}\n")[0];
  assert.match(body, /Are you taking this now\?/);
  assert.match(body, /Only add it if you take it now\. To restart a medicine, ask your care team first\./);
  assert.match(body, /cancel\.focus\(\)/);
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/older.js"'));
});
