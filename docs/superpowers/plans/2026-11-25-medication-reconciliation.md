# When Sources Disagree: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every source's medicines go through one reconciliation core. It keeps each source's version, works out disagreements fresh on every update, asks the patient only what they do, and gives staff both sides of anything unresolved, in the QR code, on the staff page and in the FHIR file.

**Architecture:**
- A new pure module, `js/reconcile.js`, takes a list of sources, each a split as `loadMedicines` makes today plus who it's for. It returns one split whose cards carry a `group` when more than one source has the medicine.
- `js/view.js` `arrangeList` lays the patient's marks and answers over it.
- `js/share.js`, `js/share-list.js` and `js/ips.js` write out each side of a disagreement.
- A new `js/review.js` holds the review cards' words and answers. `js/app.js` draws them.
- With one source, the output equals today's apart from the two approved behavior changes.

**Tech Stack:** Static ES modules on GitHub Pages, FHIR R4, RxNorm through RxNav (already allowed), and Node's test runner. No new libraries.

**Spec:** `docs/superpowers/specs/2026-11-25-medication-reconciliation-design.md` (approved 2026-11-25).

## Decisions Tyler made on this plan (2026-11-25)

Asked one at a time, each confirmed as proposed:
1. The test source is served only by the home server at `/_home/demo-source.json`, when started with `BROWN_BAG_DEMO=two-clinics`, and the app asks only on port 8443.
2. Only the review's card number is kept in session storage across the lock.
3. Fill hint: nearest half, shown only from 0.5 to 12 a day, newest fill with both numbers.
4. The fingerprint is plain text inside the encrypted data, not a hash.
5. A second source that didn't load is named for the patient and for staff (a new Brown Bag tag in the QR code).
6. HL7's FHIR validator may be downloaded and run on test data only.
7. Wording: "Valley Clinic (test records)" and "Saved. Your list is up to date."

## Global Constraints

- Tests: `node --test "tests/*.test.mjs"`. Node 22, nothing to install. Every task ends with the whole suite passing.
- No DOM in `meds.js`, `claims.js`, `reconcile.js`, `review.js`, `view.js`, `share.js` or `ips.js`. Never `innerHTML` for anything from records or the patient.
- No new SMART scopes and no change to any page's content security policy.
- The QR Bundle stays `type: "collection"` with Patient, MedicationStatement and AllergyIntolerance only, prefix `v3.`, and fits version 40-M (`fitsInQr`).
- The FHIR file stays IPS 2.0.1. Its one new resource type is `DetectedIssue`, and only in the file.
- Statuses follow the spec, section 1:
  - **current:** request `active`/`on-hold`; statement `active`/`intended`; statement `unknown` with no end.
  - **not current:** `completed`, `stopped`, `cancelled`, `not-taken`.
  - **unknown:** everything else.
  - `entered-in-error` is left out (`usableRecord`).
- Hospital order: MedicationRequest `category` coding with system `http://terminology.hl7.org/CodeSystem/medicationrequest-category` and code `inpatient`.
- Weekly or longer: `periodUnit` `wk`, `mo` or `a`, or `d` with `period` >= 7.
- Copy, exactly (`N` is a number; `<…>` is filled in):
  - Card line: "Your records don't agree on how much you take." / "Your records don't agree on how often you take it." / "Your records don't agree on whether you still take it."
  - Side line: "<Source>, <Mon YYYY>: <dose and how often>"
  - Hospital flag: "Hospital order"
  - My medicines box: "Your records don't agree on N things" (1: "on 1 thing"), button "Check them" (1: "Check it")
  - Home line: "Your records don't agree on N things" (1: "on 1 thing"), a link-style button
  - Questions: "How much do you take?" / "How often do you take it?" / "Do you still take it?"
  - Choices: each side's words with "<Source>, <Mon YYYY>"; "I don't take this anymore"; "Not sure, ask my doctor"; for status, "Yes, I take it" with "<Source> says current, <Mon YYYY>" and "No, I stopped" with "<Source> says stopped, <Mon YYYY>"; a recent fill beside them as "Filled <Mon YYYY>"
  - Buttons "Save" and "Do this later"; progress "N of M"
  - After an answer: fact ["You said", "<words> (<Mon D>)"], button "Change"
  - Newer prescription: "You marked Not taking on <Mon D>. Your records have a newer prescription, <Mon D>."
  - Mark beside another source: "You marked this Not taking on <Mon D>. <Source> lists it current, <Mon YYYY>."
  - Changed: "<Source> now says <words>."
  - Kept out: "Records from <Source> are for someone else, so they aren't on your list." / "<Source> didn't share a name and birth date, so its records aren't on your list."
  - Staff part: "Records disagree: ask the patient"; a source that didn't load, as a staff notice: "<Source> didn't load."
  - Staff notes: "Records disagree", "Patient isn't sure", "Patient confirmed this, <YYYY-MM-DD>", "Other record: <Source>, <words>, <YYYY-MM>", "May be the same medicine as <name>", "Possible duplicate of <name>", "<Source> didn't load", "Worded differently in <Source>: <words>", "Fill suggests about <n> a day (<quantity> for <days> days)"
  - IPS caution: ["records disagree on N", "Records disagree on N medicines. Ask the patient."]
- Commits: one short line in Tyler's voice, no dashes, explicit paths, ending with the attribution lines from the session.
- Every task adds its phone checks to `docs/NEEDS-TESTING.md`. Tasks 7 to 10 touch the QR code, the staff page or the patient's list: test right away.

## Review Focus

1. **A saved list from before this change** (cards with no `group`, no `answers` in data) opens as before, and the next update rebuilds it. Pinned in Task 6.
2. **A second source that failed to load**: no card says the sources agree; each affected card names it ("<Source> didn't load"). Pinned in Task 3.
3. **A disagreement on a medicine the patient marked As needed:** the question still appears, and the As needed mark stays. Pinned in Task 5.
4. **The QR code at its size limit with a disagreement:** codes go first, then "Other record" notes shorten; both sides are always in it, or it says the list is too long. Pinned in Task 7.
5. **An answer whose side vanished** (the source that answer named is gone): the question comes back and the card says "<Source> didn't load" or names what changed, never a blank choice. Pinned in Task 5.

---

### Task 1: Records carry what the core needs

**Files:**
- Modify: `js/meds.js` (`fromMedicationRequest`, `fromMedicationStatement`, `makeItem`, export `strengthOf`; new `statusWord`, `formOf`)
- Modify: `js/card.js` (`patientCard` hospital flag)
- Test: `tests/meds.test.mjs`, `tests/card.test.mjs`

**Interfaces:**
- Produces, on every item from `makeItem`:
  - `recordRef` (`"MedicationRequest/<id>"` or `"MedicationStatement/<id>"`, or null with no id)
  - `hospital` (boolean)
  - `updated` (`meta.lastUpdated` or null)
  - `asserted` (statement `dateAsserted` or null)
  - `stoppedOn` (statement `effectivePeriod.end` or null)
- Produces:
  - `statusWord(item) -> "current" | "not-current" | "unknown"`
  - `strengthOf(name) -> string | null` (now exported)
  - `formOf(name) -> string | null`: the words after the last strength in an RxNorm name, lowercased, brand in brackets dropped. "24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet" gives "extended release oral tablet".

- [ ] **Step 1: Write the failing tests**
  - "an inpatient request is a hospital order, never current": `request("197361", "amlodipine 5 MG Oral Tablet", "2026-01-02", "active", { category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/medicationrequest-category", code: "inpatient" }] }] })` gives `item.hospital === true`, `item.status === "older"`. Codes `discharge`, `outpatient` and `community` give `hospital === false`, `status === "current"`.
  - "statusWord follows the spec": request `active` and `on-hold` give "current". `completed`, `stopped` and `cancelled` give "not-current". `draft` and `unknown` give "unknown". Statement `not-taken` gives "not-current", `on-hold` gives "unknown", `unknown` with no end gives "current", and `unknown` with `effectivePeriod.end` gives "unknown".
  - "records keep their id, lastUpdated and dateAsserted": a statement with `id: "s1"`, `meta: { lastUpdated: "2026-09-01T00:00:00Z" }`, `dateAsserted: "2026-08-30"` gives `recordRef "MedicationStatement/s1"`, `updated "2026-09-01T00:00:00Z"`, `asserted "2026-08-30"`.
  - "formOf reads the form": "Sertraline 50 MG Oral Tablet [Zoloft]" gives "oral tablet". "lisinopril 10 MG / hydrochlorothiazide 12.5 MG Oral Tablet" gives "oral tablet". A typed name with no strength gives null.
  - In `tests/card.test.mjs`, "a hospital order says so": `patientCard({ ...item, hospital: true }, false).flags` includes "Hospital order".
- [ ] **Step 2: Run them to see them fail.** `node --test tests/meds.test.mjs tests/card.test.mjs`. Expected: FAIL, `statusWord` not exported, `hospital` undefined.
- [ ] **Step 3: Implement** in `js/meds.js`.
  - `current` stays as today, AND not `hospital`. `dedupe` keeps the shown record's new fields, as it keeps the others.
  - `statusWord` reads `item.recordStatus` plus the item's `end` for statements. A statement's `end` comes from `effectivePeriod.end`, so add `kind: "request" | "statement"` to `makeItem`'s parts.
  - In `card.js`, push "Hospital order" first in `flags` when `entry.hospital`.
- [ ] **Step 4: Run the whole suite.** All pass. The two inpatient fixture records were already `completed`, so the fixture tests don't change.
- [ ] **Step 5: Commit** `js/meds.js js/card.js tests/meds.test.mjs tests/card.test.mjs`: "Keep what each record says about itself, and put hospital orders under older".

### Task 2: Same person, and how two records match

**Files:**
- Create: `js/reconcile.js`
- Test: `tests/reconcile.test.mjs`

**Interfaces:**
- Consumes: `strengthOf`, `formOf` (Task 1). The ingredient map from `ingredientsFor` (`Map<rxcui, { rxcui: "a+b", name }>`).
- Produces:
  - `personOf(patient) -> { family, given, birthDate } | null`. Takes a FHIR Patient. It uses `name[0].family` and `given[0]`, else the first and last words of `name[0].text`, and `birthDate`. Null when the name or birth date is missing.
  - `samePerson(a, b) -> boolean`. Ignores capitals, spaces, punctuation, accents, and endings Jr., Sr., II, III, IV. Birth date exact.
  - `matchOf(a, b, ingredientOf) -> "rxcui" | "name" | "ingredients" | "form" | "combo" | "name-only" | null`. Items as from `makeItem`. In order:
    - same `rxcui`
    - same `plainName` (move `plainName` from `claims.js` into `reconcile.js`, export it, and import it back in `claims.js`)
    - same ingredient key and same `formOf`
    - same ingredient key, different form: `"form"`
    - ingredient sets overlap but differ (split on "+"): `"combo"`
    - same `firstWord` (import from `add-check.js`; export it there) with no RxCUI on at least one side: `"name-only"`
    - else null
  - `GROUPS = ["rxcui", "name", "ingredients"]`. Only these join a group.

- [ ] **Step 1: Write the failing tests**
  - "samePerson ignores case, accents and endings": `{ family: "Núñez Jr.", given: "Ana", birthDate: "1950-02-03" }` matches `{ family: "nunez", given: "ANA", birthDate: "1950-02-03" }`. A birth date of `1950-02-04` doesn't match.
  - "personOf reads a name written as text": `{ name: [{ text: "Loria Jenkins" }], birthDate: "1971-05-01" }` gives `{ family: "Jenkins", given: "Loria", birthDate: "1971-05-01" }`. With no `birthDate`, null.
  - "matchOf levels":
    - Zoloft "Sertraline 50 MG Oral Tablet [Zoloft]" (rxcui 208161) beside sertraline "sertraline 50 MG Oral Tablet" (rxcui 312940) gives "name".
    - lisinopril 10 mg and 20 mg with the same ingredient key "29046" give "ingredients".
    - metformin "metformin hydrochloride 500 MG Oral Tablet" and "24 HR metformin hydrochloride 500 MG Extended Release Oral Tablet", both key "6809", give "form".
    - "lisinopril / hydrochlorothiazide" (key "29046+5487") beside lisinopril (key "29046") gives "combo".
    - Typed "Lisinopril" (no rxcui) beside the coded one gives "name-only".
    - Hydroxyzine beside hydralazine gives null.
  - "with no ingredient map only rxcui, name and name-only are possible": the same lisinopril pair with an empty map gives "name-only".
- [ ] **Step 2: Run them to see them fail.** `node --test tests/reconcile.test.mjs`. Expected: FAIL, the module doesn't exist.
- [ ] **Step 3: Implement** the three functions and `GROUPS` in `js/reconcile.js`. Normalize names with `String.normalize("NFD")`, then strip marks and punctuation.
- [ ] **Step 4: Run the whole suite.** All pass, `tests/claims.test.mjs` included after the `plainName` move.
- [ ] **Step 5: Commit** `js/reconcile.js js/claims.js js/add-check.js tests/reconcile.test.mjs`: "Check two sources are the same person, and how two records match".

### Task 3: Verdicts, and the reconciled list

**Files:**
- Modify: `js/reconcile.js`
- Create: `tests/fixtures/reconcile/two-clinics.json`, `tests/fixtures/reconcile/someone-else.json`
- Test: `tests/reconcile.test.mjs`

**Interfaces:**
- Consumes: Task 1 item fields, `statusWord`, `matchOf`, `samePerson`, `personOf`.
- Produces:
  - `verdictsFor(sides) -> string[]`, a subset of `["status", "dose", "schedule", "worded"]` in that order. `sides` are items, one per source, all in one group. Rules are the spec's, section 4:
    - **dose:** strengths differ, unless both are fully coded with the same daily amount; or the same strength with both coded amounts differing.
    - **schedule:** both `fhir.dosage.repeat` coded and different; or either says weekly or longer and the other doesn't.
    - **status:** one side "current", another "not-current", and the not-current side's date is not before the current side's own date. The not-current date is the latest of `updated`, `stoppedOn`, `asserted`, and the item's own date (request `start`, statement `start`). The current side's own date is `start`. Missing dates count as unknown order, which means it's asked.
    - **worded:** same strength, the `frequency` words differ by `words()` from `add-check.js` (export it), and they aren't both coded.
  - `dailyAmount(item) -> number | null`: strength number × `quantity.value` × frequency ÷ period in days, only when `fhir.dosage` has `quantity` and `repeat` with `periodUnit` in `h d wk mo a`.
  - `isWeekly(item) -> boolean`: coded weekly or longer per Global Constraints, or the words match `/\b(weekly|once a week|every week|every \d+ weeks?)\b/i`.
  - `reconcile(sources, ingredientOf) -> split`:
    - `sources` is `[{ id, name, kind: "records" | "snapshot", refreshes: boolean, patient: FHIR Patient | null, split }]`. The first source is the one the others are compared with for the same-person check.
    - The returned split is the first source's `current`, `older`, `failed`, `heldBack` and `placeholders`, combined, plus `keptOut: [{ id, name, why: "someone-else" | "no-identity" }]` and `sourceStatus: [{ id, name, loaded: boolean }]`.
    - With one source, `current` and `older` equal its split exactly (`deepEqual`).
    - A group of two or more sources is one card: the newest current member's item, with `group = { id, sources: [names], verdicts, sides, fingerprint, notes }`:
      - `id`: the ingredient key, else the lowest member key.
      - `sides`: `[{ sourceId, sourceName, kind, asOf, dose, route, frequency, status: statusWord, recordStatus, key }]`, oldest `asOf` first.
      - `fingerprint`: a canonical JSON string of the disagreeing sides' `sourceId`, dose, frequency and status, sorted by `sourceId`. No `recordRef` or dates.
      - `notes`: staff lines. Every card with a `group` gets "<Source> didn't load" for every source in `sourceStatus` with `loaded: false`, so no agreement is vouched for by a source that wasn't there.
    - Cards that only `"form"`, `"combo"` or `"name-only"` match another source's stay separate, each with `group.notes` "Possible duplicate of <name>" or "May be the same medicine as <name>", and `group.verdicts` [].
    - `current` and `older` stay sorted by name as `splitByStatus` does.
- Fixtures: each file is `{ patient, requests: [MedicationRequest], statements: [MedicationStatement] }`.
  - `two-clinics.json`: a Patient with the test's name and birth date, and the cases in spec section 11:
    - lisinopril 10 vs 20 mg
    - metformin the same
    - atorvastatin current in A, stopped later in B
    - Zoloft vs sertraline 50 mg
    - methotrexate weekly vs daily
    - lisinopril/HCTZ vs lisinopril
    - 2 × 10 mg vs 1 × 20 mg coded
    - free text differing
    - an inpatient IV order
  - `someone-else.json`: the same with birth date one day off.
  - The test reads them with `readFileSync` and turns them into splits with `fromMedicationRequest`, `fromMedicationStatement`, `dedupe`, `groupByIngredient` and `splitByStatus`, and a fixed ingredient map in the test.

- [ ] **Step 1: Write the failing tests**
  - "one source comes back as it went in": the Loria fixture split (`tests/fixtures/e5408569-...`) through `reconcile([{ id: "smart-sandbox", … }], map)` deep-equals its split, with `keptOut: []`.
  - "two clinics": over the `two-clinics.json` cases:
    - lisinopril verdicts `["dose"]`, one card, `group.sources` `["SMART sandbox", "Valley Clinic"]`
    - metformin `[]`, one card
    - atorvastatin `["status"]`
    - sertraline `[]`, one card
    - methotrexate `["schedule"]`
    - lisinopril/HCTZ separate, with "Possible duplicate of lisinopril 10 MG Oral Tablet"
    - the coded 2 × 10 vs 1 × 20 `[]`
    - the free-text pair `["worded"]`
    - the IV order under `older` with `hospital`, in no group
  - "an older stop is history": stopped 2025-01-02 beside active 2026-02-01 gives `[]`. Stopped with `meta.lastUpdated` 2026-09-01 beside active 2026-02-01 gives `["status"]`. Stopped with no dates gives `["status"]`.
  - "someone else is kept out": with `someone-else.json`, `keptOut` `[{ id: "clinic-b", name: "Valley Clinic", why: "someone-else" }]`, and `current` equal to the first source's alone. With `patient: null`, `why: "no-identity"`.
  - "a source that didn't load is named": with three sources, the third having `split.failed: true`, the lisinopril group made by the first two has "Mercy Health didn't load" in its `group.notes`. With two sources and the second failed, no card has a `group`, and `sourceStatus` has `{ id: "clinic-b", name: "Valley Clinic", loaded: false }`. Task 6 shows that as a notice for the patient ("Couldn't load medicines from <Source>."), and Task 8 for staff.
  - "the fingerprint ignores record copies": the same lisinopril pair where B's record gets a new id and `authoredOn` has an equal `group.fingerprint`. B at 40 mg has a different one.
- [ ] **Step 2: Run them to see them fail.** `node --test tests/reconcile.test.mjs`. Expected: FAIL, `reconcile` not exported.
- [ ] **Step 3: Implement** `dailyAmount`, `isWeekly`, `verdictsFor` and `reconcile` in `js/reconcile.js`.
  - Groups form by a union of `matchOf` in `GROUPS` across different sources only. Within one source nothing joins (spec section 3).
  - A group whose only current members come from one source keeps that source's card as it is.
- [ ] **Step 4: Run the whole suite.** All pass.
- [ ] **Step 5: Commit** `js/reconcile.js tests/reconcile.test.mjs tests/fixtures/reconcile/two-clinics.json tests/fixtures/reconcile/someone-else.json`: "Work out where sources agree and disagree, fresh every time".

### Task 4: Snapshots in the core

**Files:**
- Modify: `js/reconcile.js`
- Create: `tests/fixtures/reconcile/ips-snapshot.json` (an IPS document from "Mercy Health", `Composition.date` 2026-06-01), `tests/fixtures/reconcile/own-qr.json` (a Brown Bag QR Bundle with Brown Bag tags, one record statement and one from the patient)
- Test: `tests/reconcile.test.mjs`

**Interfaces:**
- Consumes: `reconcile`, `verdictsFor` (Task 3); `fromMedicationStatement` (meds.js).
- Produces:
  - `snapshotSource(bundle, name) -> source | null`.
    - Takes a Bundle of `type` `collection` or `document`. Anything else gives null.
    - Gives `{ id: "snapshot:<asOf>:<name>", name, kind: "snapshot", refreshes: false, patient, split }`.
    - `asOf` is the Composition's `date`, else the Bundle's `timestamp`. Each statement's own date is kept, and a statement with none takes `asOf`.
    - Own exports are recognized by the Brown Bag tag system in `meta.tag`, or by a Composition whose `author` reference resolves to a Device whose `deviceName[0].name` is "Brown Bag". From them, statements whose `informationSource.reference` is the Patient are dropped.
  - `verdictsFor` gains one rule. A "status" verdict between a snapshot side and a refreshing side is made only when the snapshot side is the not-current one and is newer. A snapshot's current statement older than the refreshing side's record makes no status verdict, and its side gets `asOfNote` "As of <Mon YYYY>, <Source> listed this".

- [ ] **Step 1: Write the failing tests**
  - "an IPS snapshot joins as a dated source": `snapshotSource(ips, "Mercy Health")` gives `kind "snapshot"`, `refreshes false`, and its lisinopril statement's date "2026-06-01". Reconciled with the sandbox source, its lisinopril at 20 mg gives `["dose"]`.
  - "an older snapshot doesn't say stopped": the snapshot lists atorvastatin current as of 2025-01-01, and the sandbox has it stopped 2026-02-01. That gives `[]`, and the side's `asOfNote` is "As of Jan 2025, Mercy Health listed this".
  - "a re-imported Brown Bag list doesn't duplicate the patient's own": `snapshotSource(ownQr, "Brown Bag list")` keeps the record statement and drops the patient's. The same with an IPS file whose author is the "Brown Bag" Device.
  - "an odd bundle is refused": `type: "transaction"` gives null.
- [ ] **Step 2: Run them to see them fail.** `node --test tests/reconcile.test.mjs`.
- [ ] **Step 3: Implement** `snapshotSource` and the snapshot rule in `js/reconcile.js`. Statements go through `fromMedicationStatement` with the source's name.
- [ ] **Step 4: Run the whole suite.** All pass.
- [ ] **Step 5: Commit** `js/reconcile.js tests/reconcile.test.mjs tests/fixtures/reconcile/ips-snapshot.json tests/fixtures/reconcile/own-qr.json`: "Let a shared list join as a dated snapshot".

### Task 5: Marks and answers on the list

**Files:**
- Modify: `js/view.js` (`arrangeList`), `js/app.js` (`emptyData`, `markButtons` keys)
- Test: `tests/view.test.mjs`

**Interfaces:**
- Consumes: cards with `group` (Task 3). `data.stopped` and `data.asNeeded` as today. New `data.answers: Answer[]`.
- Produces:
  - `Answer = { groupId, fingerprint, sides, choice: <sourceId> | "not-taking" | "not-sure", answeredAt: "YYYY-MM-DD" }` (spec section 7).
  - `keysOf(entry) -> string[]`: `entry.key`, `entry.otherKeys`, and every `group.sides[].key`.
  - `arrangeList(split, data) -> { current, older, stopped, toCheck }`:
    - `toCheck` is the cards that need a question, in list order. Each card gets `question: { kind: "status" | "dose" | "schedule", why: string | null }` and, when answered and still matching, `answer`.
    - A card goes under `stopped` only when every current member key is marked.
    - When some are marked, it stays in `current` with a "status" question and `why` "You marked this Not taking on <Mon D>. <Source> lists it current, <Mon YYYY>."
    - A marked card whose `lastDate` is after the mark goes in `current` with a "status" question and `why` "You marked Not taking on <Mon D>. Your records have a newer prescription, <Mon D>."
    - An answer applies only when `groupId` and `fingerprint` both match. When only `groupId` matches, the question comes back with `why` "<Source> now says <words>." (from comparing the saved `sides`), or "<Source> didn't load." when that side is gone.
    - The question order is status, dose, schedule. "worded" never asks.
  - In `app.js`, `markButtons` writes a mark under every key in `keysOf(entry)`, and `emptyData()` adds `answers: []`. A saved data object with no `answers` reads as `[]`.

- [ ] **Step 1: Write the failing tests**
  - "a Not taking mark doesn't hide a newer prescription": mark `rx:1` on 2026-03-03, the card's `lastDate` 2026-10-02. The card is in `current`, `toCheck` has it, and `why` is "You marked Not taking on Mar 3. Your records have a newer prescription, Oct 2."
  - "a mark on one side of a group asks": a group with sides keyed `rx:1` (Valley Clinic) and `rx:2` (Mercy Health, current, 2026-10-01), and only `rx:1` marked. The card stays current with `why` "You marked this Not taking on Mar 3. Mercy Health lists it current, Oct 2026."
  - "marks on every side stop the group": both keys marked, so the card is under `stopped`.
  - "an answer holds while the fingerprint matches": an answer with the card's `groupId` and `fingerprint` and `choice: "clinic-b"` gives `toCheck` [] and `card.answer.choice === "clinic-b"`.
  - "a changed side asks again and says what changed": the saved `sides` had Mercy Health at "20 mg", and now it's "40 mg". `why` is "Mercy Health now says 40 mg." A saved side whose source is gone gives "Mercy Health didn't load."
  - "As needed stays with a question": a group card marked As needed with a dose verdict is in `current` with `asNeededAt` and is in `toCheck`.
  - "today's lists arrange as before": the existing `arrangeList` tests pass unchanged, and a card with no `group` never gets a `question`.
- [ ] **Step 2: Run them to see them fail.** `node --test tests/view.test.mjs`. Expected: FAIL, `toCheck` undefined.
- [ ] **Step 3: Implement** `keysOf` and the new `arrangeList` in `js/view.js`, then `emptyData` and `markButtons` in `js/app.js`. Undo and Not taking use `keysOf(entry)` when deleting, too.
- [ ] **Step 4: Run the whole suite.** All pass.
- [ ] **Step 5: Commit** `js/view.js js/app.js tests/view.test.mjs`: "Never let a mark hide a medicine another record lists".

### Task 6: Wire it in, with a test source on the home server

**Files:**
- Modify: `js/app.js` (`loadMedicines` returns a source split; `loadFresh` calls `reconcile`; `keepFreshCopy` and `useSaved` keep `group`, `keptOut`, `sourceStatus`; `drawRecords` shows group cards and kept-out notes)
- Modify: `js/card.js` (`patientCard` shows the card line and side lines for an unanswered group)
- Create: `js/demo-source.js`
- Modify: `tools/serve.mjs` (serves `/_home/demo-source.json` only when started with `BROWN_BAG_DEMO=two-clinics`)
- Test: `tests/demo-source.test.mjs`, `tests/card.test.mjs`, `tests/offline.test.mjs`

**Interfaces:**
- Consumes: `reconcile` (Task 3), `arrangeList` (Task 5).
- Produces:
  - `demoSourceUrl(location) -> string | null`: `"./_home/demo-source.json"` when `location.port === "8443"`, else null.
  - `demoSource(json, patient) -> source`: the fixture as a `reconcile` source, `id: "valley-clinic-demo"`, name "Valley Clinic (test records)". Its Patient's name and birth date are copied from the signed-in patient, so the same-person check passes. With `?demo=someone-else`, the birth date is a day off.
  - `patientCard(entry, claimsLoaded)` for a card with `question` and no `answer`:
    - flags start with the card line for `question.kind`, then `why` when set
    - `take` is replaced by one row per side: `["<Source>, <Mon YYYY>", "<dose and how often>"]`
    - with an `answer`, facts gain `["You said", "<words> (<Mon D>)"]`
- Server: `tools/serve.mjs` answers `GET /_home/demo-source.json` with `tests/fixtures/reconcile/two-clinics.json` only when `process.env.BROWN_BAG_DEMO === "two-clinics"`, else 404. Nothing named `_home` exists in the repo.

- [ ] **Step 1: Write the failing tests**
  - "the test source is only for the home server": `demoSourceUrl({ port: "8443" })` is `"./_home/demo-source.json"`. Port `""` and `"443"` give null.
  - "no _home folder is published": `existsSync(new URL("../_home", import.meta.url))` is false.
  - "the test source is the signed-in person": `demoSource(json, { name: [{ text: "Loria Jenkins" }], birthDate: "1971-05-01" })` gives a source whose patient passes `samePerson` with the signed-in one.
  - In card tests, "an unanswered disagreement shows both sides": a lisinopril group card with a dose question has flags[0] "Your records don't agree on how much you take." and take rows `[["SMART sandbox, Mar 2026", "10 mg, once a day"], ["Valley Clinic (test records), Oct 2026", "20 mg, once a day"]]`.
  - In offline tests, "a saved copy keeps its groups" and "a saved copy from before groups opens": a saved copy with group cards round-trips through `saveRecords`/`loadLastRecords` with `group` intact. One with no `group`, `keptOut` or `sourceStatus` opens as today.
- [ ] **Step 2: Run them to see them fail.** `node --test tests/demo-source.test.mjs tests/card.test.mjs tests/offline.test.mjs`.
- [ ] **Step 3: Implement.**
  - `loadMedicines` stops at the source split. `loadFresh` builds `[{ id: "smart-sandbox", name: SOURCE, kind: "records", refreshes: true, patient, split }]`, plus the demo source when `demoSourceUrl(location)` answers 200. Then `reconcile`, then `mergeClaims` as today.
  - `drawRecords` adds a notice for each `keptOut` with the kept-out copy, and "Couldn't load medicines from <Source>." for each `sourceStatus` entry with `loaded: false` other than the first source (whose failure keeps today's message).
  - `serve.mjs`: the route is checked before the file lookup. Its comment says how to start it.
- [ ] **Step 4: Run the whole suite.** All pass. Then start `BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`, open `https://localhost:8443/` in the iPhone 15 simulator as Loria Jenkins, and check that the lisinopril card shows both sides. Without the variable, the list is today's.
- [ ] **Step 5: Commit** `js/app.js js/card.js js/demo-source.js tools/serve.mjs tests/demo-source.test.mjs tests/card.test.mjs tests/offline.test.mjs docs/NEEDS-TESTING.md`: "Bring every source through one list, with test records on the home server".

### Task 6b: Sandbox test patients with conflicting records (added 2026-11-25, Tyler)

Tyler, 2026-11-25: create test patients on the sandbox "with many conflicting meds, and if possible, from different sources". Brown Bag holds one sandbox connection, so the sources are: the patient's health record on the sandbox, their insurance claims (ExplanationOfBenefit) on the sandbox, and a matching test clinic file the home server serves for that patient. Two sign-ins for one person is later work with its own design.

**Files:**
- Create: `tools/reconcile-patients.mjs` (modelled on `tools/demo-patient.mjs`: fixed ids, PUT, dates relative to today, touches nothing else on the sandbox)
- Create: `tests/fixtures/reconcile/clinics/<patient id>.json` (written by the script, committed)
- Modify: `js/demo-source.js` (`demoSourceUrl(location, patientId)`), `tools/serve.mjs`, `js/app.js` (passes the patient id), `README.md` (Test patients), `prompts/phone-pass.md` (run the script first), `docs/NEEDS-TESTING.md`
- Test: `tests/demo-source.test.mjs`, a new `tests/reconcile-patients.test.mjs`

**Interfaces:**
- Consumes: `demoSource`, `demoSourceUrl` (Task 6), `reconcile` (Task 3).
- Produces:
  - `node tools/reconcile-patients.mjs` puts on `https://r4.smarthealthit.org/` two made-up patients:
    - "Riley Reconcile" (`brownbag-recon-riley`, born 1948-06-02). Records, claims and test-clinic file together cover: lisinopril 10 vs 20 mg; methotrexate weekly vs daily, coded; atorvastatin current in one source, stopped later in the other; Zoloft (brand) vs sertraline (generic), which agree; metformin regular vs extended release (possible duplicate); lisinopril/HCTZ beside lisinopril; an active inpatient IV order; a medicine filled after the record stopped it; and one only the clinic lists.
    - "Jordan Partial" (`brownbag-recon-jordan`, born 1955-11-20). A stop dated by year only, a clinic file that says it held records back, and an undated record.
  - The script also writes `tests/fixtures/reconcile/clinics/brownbag-recon-riley.json` and `…/brownbag-recon-jordan.json` in the `{ patient, requests, statements, heldBack? }` shape, from the same definitions.
  - `demoSourceUrl(location, patientId)` gives `"./_home/demo-source/" + encodeURIComponent(patientId) + ".json"` on port 8443, else null. `serve.mjs` answers it with `clinics/<id>.json` when that file exists, else `demo-clinic.json` (Loria Jenkins), only with `BROWN_BAG_DEMO=two-clinics`. `demoSource` sets `split.heldBack` from the file's `heldBack`.
  - With the script run and the home server's test clinic on, signing in as Riley gives a status, a dose and a schedule question, possible-duplicate notes, the hospital order under Older, and a "completed but filled" line.

- [ ] **Step 1: Write the failing tests**
  - "Riley's clinic file disagrees in every way the design names": build Riley's sandbox split from the script's own definitions (export them; don't call the network in tests), reconcile it with `clinics/brownbag-recon-riley.json`, and assert the verdicts per medicine listed above.
  - "Jordan's clinic file held some back": its `sourceStatus` entry has `complete: false`, and its cards carry "<Source> didn't send some records".
  - "the test clinic follows the signed-in patient": `demoSourceUrl({ port: "8443" }, "brownbag-recon-riley")` is `"./_home/demo-source/brownbag-recon-riley.json"`, and null on port "".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** the script (PUT with fixed ids; `--dry-run` writes the clinic files only), the URL change, and the server route. Run the script once against the sandbox and commit the clinic files it wrote.
- [ ] **Step 4: Check it.** Run the whole suite. Then in headless Chromium (iPhone 15 profile, the self-signed home server certificate, PIN lock), sign in to the sandbox as Riley with `BROWN_BAG_DEMO=two-clinics` and check the cases above on My medicines. Add Riley and Jordan to README "Test patients" in plain text, like Avery: there only after `node tools/reconcile-patients.mjs`, until the nightly reset, with no links (the README test pins two links). Make `prompts/phone-pass.md` run the script before starting the server, and add the cases to "Waiting for the next pass" in `docs/NEEDS-TESTING.md`.
- [ ] **Step 5: Commit** `tools/reconcile-patients.mjs tests/fixtures/reconcile/clinics/brownbag-recon-riley.json tests/fixtures/reconcile/clinics/brownbag-recon-jordan.json js/demo-source.js tools/serve.mjs js/app.js README.md prompts/phone-pass.md docs/NEEDS-TESTING.md tests/demo-source.test.mjs tests/reconcile-patients.test.mjs`: "Put patients on the sandbox whose records disagree".

### Task 6c: Real-world medicines (added 2026-11-25, Tyler)

Tyler, 2026-11-25: "Testing will be paramount ... the more data, conflicting data, the better ... some [data] may not be [clean]". The research is in `docs/superpowers/research/2026-11-25-messy-data-findings.md` ("the findings"). Its "Fixtures to build" cases 1–32 are this task's tests. Tyler's answers, one question each:
- Use the most specific product code.
- Release type and salt are part of the form.
- IPS "no medication" entries are left out and said.
- Built before Task 7.

**Files:**
- Modify: `js/meds.js` (`readDrug`, `STRENGTH`, `formOf`, `PLACEHOLDER`/`isPlaceholderDrug`, `formatDosage`), `js/rxnorm.js` (term types with the ingredient lookup; salts), `js/reconcile.js` (`matchOf`, `WEEKLY`/`isWeekly`, `massOf`/units), `js/claims.js` (`attachFills` form and salt check; package-sentence names), `js/snapshot.js` (Medication map, MedicationRequest), `js/app.js` (the Medication map in `loadMedicines`; the no-medicines line), `js/share.js`/`js/share-list.js` (the no-medicines line for staff)
- Create: `tests/fixtures/messy/medicines/*.json` (one small file per case, copying the findings' public strings, no real patient data), `tests/messy-medicines.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1–6b.
- Produces:
  - **Which code** (findings D1, D5; cases 1–3):
    - `readDrug` keeps every RxNorm coding.
    - The record's `rxcui` is the coding marked `userSelected`. Otherwise it's the most specific product (SCD, SBD, GPCK, BPCK, ahead of SCDC, SBDF, SCDF, SBDG, SCDG, MIN, PIN, IN, BN), known from the term types `ingredientsFor` now also returns.
    - A record whose codes are all ingredient-level (IN, PIN, MIN) or brand-name-level (BN) gets `rxcui: null` and `ingredientOnly: true`. It keeps its key by text, never joins another record by code, and shows as name-only with a staff note.
    - Offline (no term types), the first SCD or SBD-looking coding by `display` is used. Otherwise the record is treated as ingredient-only.
  - **Form** (D2–D4; cases 4–7): `formOf` includes release words and the time prefix anywhere in the name: "12 HR", "24 HR", "XL", "XR", "ER", "SR", "CR", "DR", "LA", "ODT", "Extended Release", "Delayed Release". Salt words ("tartrate", "succinate", "hydrochloride", "sodium" and so on) also count as part of the form. `matchOf` never treats a null form as the same form.
  - **Strength** (D8; cases 14–20):
    - `STRENGTH` reads ".5" as 0.5 and "1,000" as 1000.
    - It reads mcg spellings (ug, µg, ?G, MUG, microgram(s)) as MCG, unit spellings (IU, UT, IE, unit(s), u, [iU]) as UNT, and "N-N-N MG" combinations.
    - `massOf` treats ug and microgram as mcg.
    - A coded dose whose unit contradicts the text ("mg/kg" beside "100 mg") isn't shown as the dose; the record's words are.
  - **Weekly** (D7; case 13): `isWeekly` also matches "/WEEK", "QW", "QWK", "PER WEEK", "1/WEEK", "N time(s) per week", "every <weekday>", "every 7 days", "Q7D", "1/MO", "every 28 days", "each week", "once weekly".
  - **References** (D9, D10; cases 21–24):
    - `loadMedicines` and `snapshotSource` resolve contained (`#id`, from the resource's own `contained`), `urn:uuid:…` (by Bundle `fullUrl`), relative (`Medication/<id>`) and absolute references, as long as the referenced Medication is in the response.
    - `snapshotSource` reads MedicationRequest as well as MedicationStatement.
  - **Placeholders** (case 25): "Unknown medication", "Med", "Rx", "None" and "No current medications" are placeholders.
  - **IPS no-medication entries** (cases 31–32; Tyler):
    - A statement coded `no-medication-info` or `no-known-medications` (system `http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips`) is never a card.
    - The split gets `noMedicines: [{ source, kind: "no-info" | "none-known" }]`.
    - My medicines and the staff page say "<Source> has no information about your medicines." or "<Source> says: no medicines known." for the patient, and "<Source>: no information about medicines" or "<Source>: no medicines known" for staff.
    - It never makes an empty list read as "none" (unknown is never none). The QR carries it as a Bundle tag (`no-medicines`, display "<kind>:<Source>").
  - **Claims** (D6; cases 11–12, 27–30): a fill attaches by ingredient only when the form and salt match too, otherwise it's "Filled, not in your records". CARIN package sentences ("…, 100 CAPSULE in 1 BOTTLE (…) (package)") are cut to the product name for display. RxNav `ndcstatus` is used for NDC → RxCUI, never the first of several.
  - **Remapped codes** (case 26): RxNav history status maps an obsolete RxCUI to its current one before matching. If it can't, a "Possible duplicate" note stays.

- [ ] **Step 1: Write the failing tests.** One test per findings case 1–32. Each uses its fixture and asserts the "→" behavior in the findings, adjusted by the rules above where they differ. Cases whose "Today" already matches are pinned as they are.
- [ ] **Step 2: Run them to see them fail.** `node --test tests/messy-medicines.test.mjs`
- [ ] **Step 3: Implement**, file by file. Every existing test must keep passing. Where an old test pinned behavior these rules reverse, change that test's expectation and say so in the report.
- [ ] **Step 4: Run the whole suite**, then the headless Chromium check with Riley (Task 6b) and Loria. Their lists may change only where these rules say so, and the report lists every changed card.
- [ ] **Step 5: Commit** with explicit paths: "Read medicines the way real sources write them".

### Task 6d: Real-world allergies, names and birth dates (added 2026-11-25, Tyler)

The findings' cases 33–54. Tyler's answers, one question each:
- Read names as real ones.
- A birth date is read as written, and placeholders count as no birth date.
- Kept-out wording says "don't match".
- Fix both allergy gaps.

**Files:**
- Modify: `js/allergies.js` (`NONE_CODES`, `statementOf`, `NO_CODE`), `js/reconcile.js` (`personOf`, `nameKey`, `samePerson`, `keptOutWhy`), `js/app.js` (kept-out copy), `js/view.js` or wherever the kept-out line is built
- Create: `tests/fixtures/messy/people/*.json`, `tests/fixtures/messy/allergies/*.json`, `tests/messy-people.test.mjs`, `tests/messy-allergies.test.mjs`

**Interfaces:**
- Produces:
  - **Allergies** (cases 33–39):
    - All of these read as the records saying no known allergies:
      - IPS `no-known-allergies`, by code even with no display;
      - SNOMED `716186003`, `409137002` and `716184000` (latex);
      - text "NKA", "NKDA", "NKMA", "No Known Allergies." and "Patient has no known allergies", any case, trailing dot allowed.
    - `no-allergy-info` and nullFlavor/data-absent-reason codes become today's unnamed-allergy row ("an allergy entry that doesn't say what it's to"), never named "NoInformation" or "Unknown".
    - A real allergy beside any of these still shows, and staff still see the record.
    - The penicillin family (case 39) stays five rows, pinned.
  - **Names** (cases 40–47, 54):
    - `personOf` uses the first `official` name, else `usual`, else the first that isn't `old`, `maiden`, `nickname` or `anonymous`.
    - Text "LAST, FIRST [MIDDLE]" is read as family LAST.
    - A suffix in text or `family` is moved out, and kept for the Jr/Sr rule.
    - A `given` that is a string is one name.
    - Only the first given word is compared.
    - Trailing digits are stripped (Synthea).
    - Particles stay part of the family name.
    - `nameKey` keeps letters of any alphabet (`\p{L}` with the `u` flag), folds accents, and folds ü/ue, ö/oe, ä/ae.
    - A compound surname must match in full.
    - Jr. on one side and Sr. on the other is not the same person. A suffix on only one side is ignored.
  - **Birth dates** (cases 48–53):
    - The first 10 characters of a datetime are the date, never converted to local time.
    - 1900-01-01, 1901-01-01, 1800-01-01 and 0001-01-01 count as no birth date.
    - `_birthDate` with data-absent-reason counts as no birth date.
  - **Kept-out wording** (Tyler):
    - "Records from <Source> don't match your name and birth date, so they aren't on your list." replaces "are for someone else".
    - `keptOutWhy` gives "no-match" in place of "someone-else". Old saved lists with "someone-else" read as "no-match".

- [ ] **Step 1: Write the failing tests.** One per findings case 33–54, plus the copy.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Keep every existing test passing. Update expectations only where these rules reverse them, and say which in the report.
- [ ] **Step 4: Run the whole suite**, then the Chromium check with Loria, Chantell and `?demo=someone-else`.
- [ ] **Step 5: Commit** with explicit paths: "Read allergies, names and birth dates the way real sources write them".

### Task 7: The QR code carries both sides

**Files:**
- Modify: `js/share.js` (`buildShareBundle`, `groupShareBundle`, `cardFrom`)
- Modify: `js/view.js` (`shareListFrom` passes `toCheck` and answered groups)
- Test: `tests/share.test.mjs`, `tests/share-codes.test.mjs`

**Interfaces:**
- Consumes: `arrangeList` output (Task 5).
- Produces:
  - In the Bundle (spec section 9):
    - **Unanswered or "not-sure":** one MedicationStatement per side, each with "From records: <Source>", "Records disagree" (plus "Patient isn't sure" when that was the answer), and the side's own dosage words.
    - Bundle tag `{ system: TAGS, code: "differs", display: "<entry numbers, space separated>" }`, one per group.
    - **Answered with a side:** that side's statement, plus "Patient confirmed this, <YYYY-MM-DD>" and one "Other record: <Source>, <words>, <YYYY-MM>" for each other side.
    - **"not-taking":** the stopped statement as today, plus "Other record" notes for each side.
    - A group's `notes` become notes on its statement or statements.
  - `groupShareBundle(bundle).disagree: [{ name, sides: [row] }]`, read from the `differs` tags. Those statements are not also in `fromRecords`.
  - Bundle tag `{ system: TAGS, code: "source-not-loaded", display: "<Source>" }` for each `sourceStatus` entry with `loaded: false` other than the first source, read back as `groupShareBundle(bundle).notLoaded: [names]`. It reaches `shareListFrom` through `shareWarnings`.

- [ ] **Step 1: Write the failing tests**
  - "an unanswered disagreement is two linked statements": the lisinopril group gives two MedicationStatements with "Records disagree", and a `differs` tag whose display names both entry numbers. `groupShareBundle` gives `disagree[0].sides.length === 2`, and `fromRecords` holds neither.
  - "an answer keeps the other side as a note": `choice: "valley-clinic-demo"` gives one statement with "Patient confirmed this, 2026-11-25" and "Other record: SMART sandbox, 10 mg, once a day, 2026-03".
  - "Not sure travels": "Patient isn't sure" is on both statements.
  - "an older staff page still sees both": with the tag removed, both statements are in `fromRecords`, each with "Records disagree".
  - In share-codes tests, "a disagreement is never trimmed away": a list just over the limit with one group is tried at levels 2, 1 and 0. At every level that fits, both sides are present. When none fits, `fitsInQr` is false, and the "too long" screen follows as today.
- [ ] **Step 2: Run them to see them fail.** `node --test tests/share.test.mjs tests/share-codes.test.mjs`.
- [ ] **Step 3: Implement** in `js/share.js`. At level 0, "Other record" notes shorten to "Other record: <Source>, <YYYY-MM>".
- [ ] **Step 4: Run the whole suite.** All pass.
- [ ] **Step 5: Commit** `js/share.js js/view.js tests/share.test.mjs tests/share-codes.test.mjs docs/NEEDS-TESTING.md`: "Put both sides of a disagreement in the QR code".

### Task 8: The staff page, See what's inside, and the fill hint

**Files:**
- Modify: `js/share-list.js` (`drawShareList`), `js/inside.js`, `js/claims.js` (`fillsFromClaims`, `addFill`, `fillNote`)
- Test: `tests/inside.test.mjs`, `tests/claims.test.mjs`, `tests/share.test.mjs`

**Interfaces:**
- Consumes: `groupShareBundle(...).disagree` (Task 7).
- Produces:
  - **The staff page:** the first part under Medicines is "Records disagree: ask the patient", with each group's sides together, answered ones showing the answer first. It's left out when `disagree` is empty.
  - `medicineNotices(groups)` gains "<Source> didn't load." for each name in `groups.notLoaded`, so the staff page, See what's inside and the FHIR file all say it.
  - **See what's inside** includes the same part. The existing "nothing staff see is left out" test covers it.
  - **Each fill** gets `quantity: number | null` and `daysSupply: number | null`:
    - `quantity` is `item.quantity.value`.
    - `daysSupply` is the `supportingInfo` whose `category.coding` has code `dayssupply` (any system) and whose `sequence` is in the item's `informationSequence`, else the only `dayssupply` on the claim. Its value is `valueQuantity.value`.
  - **The summary** `fills.suggests: { perDay, quantity, days } | null` comes from the newest fill with both:
    - `perDay` is quantity ÷ days, rounded to the nearest 0.5.
    - Only when 0.5 <= perDay <= 12.
  - `fillNote` stays as it is. A new `suggestNote(fills) -> string | null` gives "Fill suggests about <n> a day (<quantity> for <days> days)", which goes on the statement in the QR code and shows on the staff card. It never shows on My medicines.

- [ ] **Step 1: Write the failing tests**
  - "60 for 30 days suggests 2 a day": a claim with item `quantity { value: 60 }`, `informationSequence [1]` and `supportingInfo [{ sequence: 1, category: { coding: [{ code: "dayssupply" }] }, valueQuantity: { value: 30 } }]` gives `suggestNote` "Fill suggests about 2 a day (60 for 30 days)".
  - "no hint without days supply, or out of range": quantity alone gives null. 1 for 90 days gives null.
  - "staff see the hint, the patient doesn't": the statement has the note. `patientCard(entry)` facts don't mention "suggests".
  - "the disagree part comes first on the staff page and in See what's inside": the inside text has "Records disagree: ask the patient" before "From records".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the whole suite**, then check the staff page in both virtual phones with the home server test source.
- [ ] **Step 5: Commit** `js/share-list.js js/inside.js js/claims.js js/share.js tests/inside.test.mjs tests/claims.test.mjs tests/share.test.mjs docs/NEEDS-TESTING.md`: "Show staff what the records disagree on, and what a fill suggests".

### Task 9: The FHIR file says it too

> **Changed in the build (2026-11-25):** HL7's validator (7.0.7, IPS 2.0.1) rejects a `DetectedIssue` in the Medications section, so the file carries none (Tyler asked for the best option; ruling R32). Each disagreement is in the file as its sides' statements with their notes, plus the caution, which reads "Records disagree on 1 medicine." in the singular (Tyler). IPS 2.0.1 removed the absent-unknown code list, so a no-medicines source is said in the section's text only, with no coded entry (Tyler). All four validated files have 0 errors. The interfaces below are kept as first planned, for the record.

**Files:**
- Modify: `js/ips.js` (`patientSummary`, `medicineWords`, the caution list, a new `detectedIssueFor`)
- Test: `tests/ips.test.mjs`

**Interfaces:**
- Consumes: `groupShareBundle(...).disagree` (Task 7).
- Produces:
  - The Medicines section caution `["records disagree on N", "Records disagree on N medicines. Ask the patient."]`, its words with a "Records disagree" list, and one `DetectedIssue` per group, listed in the section's entries after the statements:
    ```text
    { resourceType: "DetectedIssue", status: "preliminary",
      code: { text: "Records disagree" }, patient: <Patient ref>,
      detail: "<verdict words joined with ', '>",
      implicated: [<each side's MedicationStatement ref>],
      mitigation: [{ action: { text: "Patient isn't sure" } }]  (only when that was the answer) }
    ```
  - Verdict words: status "Whether it's still taken", dose "How much", schedule "How often".
  - `readBundle` still accepts only Patient, MedicationStatement and AllergyIntolerance from the QR Bundle.
  - (Ruling R25, 2026-11-25) When the QR Bundle carries a `no-medicines` tag (Task 6c), the FHIR file's Medications section also gets the IPS entry for it: a MedicationStatement coded `no-medication-info` or `no-known-medications` (system `http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips`), with the source named in a note. This is the file's own entry, not a new resource type in the QR.

- [ ] **Step 1: Write the failing tests**
  - "a disagreement gets a DetectedIssue": the lisinopril group gives one DetectedIssue with `implicated` naming both statements' fullUrls, `detail` "How much", and the section title ending "(records disagree on 1)".
  - "no disagreement, no DetectedIssue": today's fixture files make no DetectedIssue, and their files are unchanged.
  - "an answer settles it in the file": `choice` a side gives no DetectedIssue. "not-sure" gives one, with that mitigation.
- [ ] **Step 2: Run them to see them fail.** `node --test tests/ips.test.mjs`.
- [ ] **Step 3: Implement** in `js/ips.js`.
- [ ] **Step 4: Check against IPS 2.0.1.** Run the whole suite, then validate a file made from the home server's test source with HL7's FHIR validator (`validator_cli.jar -version 4.0.1 -ig hl7.fhir.uv.ips#2.0.1`). Expected: no errors. If the validator rejects a DetectedIssue in the Medications section, stop, tell Tyler what it says, and don't choose another place without him.
- [ ] **Step 5: Commit** `js/ips.js tests/ips.test.mjs docs/NEEDS-TESTING.md`: "Say in the FHIR file what the records disagree on".

**Merge point:** Tasks 1 to 9 are a pull request of their own (spec: steps 1 to 3 ship first). Push, then open it as a draft.

### Task 10: The review cards

**Files:**
- Create: `js/review.js`
- Modify: `js/app.js` (My medicines box, home line, a `review` screen, saving answers), `css/brownbag.css`
- Test: `tests/review.test.mjs`

**Interfaces:**
- Consumes: `arrangeList(...).toCheck` and `question` (Task 5), and `Answer` (Task 5).
- Produces:
  - `checkText(count) -> { line, button }`: the box and home copy for N.
  - `choicesFor(card) -> [{ value, label, detail }]`:
    - **Dose and schedule:** sides oldest first, then "not-taking" and "not-sure".
    - **Status:** "Yes, I take it" (value: the current side's sourceId), "No, I stopped" (value "not-taking"), "not-sure".
    - `detail` is the source and date. A fill within a year adds "Filled <Mon YYYY>".
  - `answerFor(card, value, today) -> Answer`: `sides` copied from `card.group.sides`.
  - `REVIEW_SPOT = "brownbag-review-spot"`: the sessionStorage key. It holds only the 1-based position number as text, and is cleared when the review closes.
  - **The review screen:**
    - a heading with the medicine's name and "N of M"
    - the card line
    - a `fieldset` whose `legend` is the question, with radio buttons, nothing chosen at the start, and each `label` holding the words and the detail
    - "Save", disabled until something is chosen
    - "Do this later", which goes back to My medicines with the box still there
  - **Saving** writes the Answer to `state.data.answers` (replacing any with the same `groupId`), calls `save()`, and moves to the next card. After the last, it goes to My medicines and announces "Saved. Your list is up to date." for a screen reader.
  - **"Change"** on an answered card opens the review at that card.

- [ ] **Step 1: Write the failing tests**
  - "the box counts what to check": `checkText(1)` gives `{ line: "Your records don't agree on 1 thing", button: "Check it" }`. `checkText(2)` gives `{ line: "Your records don't agree on 2 things", button: "Check them" }`.
  - "dose choices": the lisinopril card's labels are `["10 mg, once a day", "20 mg, once a day", "I don't take this anymore", "Not sure, ask my doctor"]`, with details `["SMART sandbox, Mar 2026", "Valley Clinic (test records), Oct 2026", "", ""]`.
  - "status choices with a fill": the atorvastatin card filled 2026-10-03 gives labels `["Yes, I take it", "No, I stopped", "Not sure, ask my doctor"]`, and the first detail ends with "Filled Oct 2026".
  - "an answer remembers the sides": `answerFor(card, "valley-clinic-demo", "2026-11-25")` gives `{ groupId: card.group.id, fingerprint: card.group.fingerprint, sides: card.group.sides, choice: "valley-clinic-demo", answeredAt: "2026-11-25" }`.
- [ ] **Step 2: Run them to see them fail.** `node --test tests/review.test.mjs`.
- [ ] **Step 3: Implement** `js/review.js`, then the screen in `js/app.js`, following its `go`, `heading`, `button` and `add` helpers. The review position survives the 5-minute lock through `REVIEW_SPOT`.
- [ ] **Step 4: Run the whole suite**, then test right away in both virtual phones with the home server test source:
  - the home line and the My medicines box
  - every question, and Do this later
  - locking mid-review and coming back to the same card
  - Change
  - TalkBack reading a choice and its detail together
- [ ] **Step 5: Commit** `js/review.js js/app.js css/brownbag.css tests/review.test.mjs docs/NEEDS-TESTING.md`: "Ask the patient one thing at a time when records disagree".

### Task 10b: Fixes from the first Mac phone pass (added 2026-11-25, Tyler chose option 2)

The Mac phone pass (docs/NEEDS-TESTING.md, "Found in the 2026-11-25 pass") found four things, all already on `main` before PR #13. Tyler chose to fix the first two now.

**Files:** `share.html`, `css/brownbag.css`, `js/share-view.js` (the code box); `js/app.js`, `js/connections.js` and/or `js/signed-out.js` (Back after signing out); `docs/LIMITS.md`, `docs/NEEDS-TESTING.md`.

- [ ] **1. The staff page's code box at 200 percent text.** At iPhone Accessibility Large (about 200 percent) the 6th digit is past the box's right edge; the digits are about 66 px wide with wide letter spacing. All 6 digits must show at 200 percent text and at 320 CSS px wide, and the box must keep working at 100 percent, with no page that scrolls sideways. Size the digits and spacing from the box's width (for example `ch`/`em` with a `clamp()`), never fixed pixels. Test: a Node test that the CSS for the box has no fixed-pixel digit width or letter spacing, plus a headless Chromium check at 393 px wide with the root font size at 200 percent and at 320 px, in which the 6th digit's right edge is inside the box.
- [ ] **2. Back after signing out.** Sign out, Sign in, unlock, Connect, then the browser's Back lands on "You're signed out", not on the connections screen. A first run (lock, connections, Connect, Back) is right. Find why the signed-out screen is in history there, and make Back from the sandbox's list (or its approval page) land on the connections screen in both paths. Test the history steps in a Node test where the logic allows, and in headless Chromium for both paths.
- [ ] **3. Note the other two.** In `docs/LIMITS.md`, add one entry for the sandbox's Deny page, which never returns to Brown Bag (its own `{"error":"invalid_request",...}` text), so "Sign-in didn't finish. Try again." can't show: it's the sandbox's behavior. Add one entry for text past 200 percent, where My medicines scrolls sideways from Accessibility XXL and the QR code falls below the fold from Accessibility XL, as an idea. In `docs/NEEDS-TESTING.md`, move items 1 and 2 under "Waiting for the next pass" with what to check.
- [ ] **4. Commit:** "Fit the staff code at large text, and bring Back to the connections screen".

### Task 11: Docs, privacy and the app cache

**Files:**
- Modify: `README.md`, `docs/LIMITS.md`, `docs/LEARNING.md`, `privacy.html`, `sw.js`, `docs/NEEDS-TESTING.md`
- Test: `tests/readme.test.mjs`, `tests/privacy.test.mjs` (existing)

- [ ] **Step 1: Update the README.**
  - **"Front end":** for the patient, when sources disagree, the review, and hospital orders; for the person checking medicines, the "Records disagree: ask the patient" part and the fill hint.
  - **"Back end":** reconciliation (every source kept and compared fresh), the QR code's `differs` and `source-not-loaded` tags, and the FHIR file's `DetectedIssue`.
  - **"Files":** add `js/reconcile.js`, `js/review.js` and `js/demo-source.js`. The README test fails without them.
  - **"Run it locally on a phone":** `BROWN_BAG_DEMO=two-clinics`.
  - **"What's planned":** "When sources disagree" comes out of both halves, since it's done.
- [ ] **Step 2: LIMITS.** #8 "Now:" says what's built. #16 "Now:" notes marks on joined cards. #17 is checked, since cards name every source.
- [ ] **Step 3: Privacy page.** It says the patient's answers are kept with their other additions, encrypted, and in backups.
- [ ] **Step 4: Bump the cache name in `sw.js`**, and add a LEARNING entry: what reconciliation is, in plain words.
- [ ] **Step 5: Run the whole suite.** All pass.
- [ ] **Step 6: Commit** `README.md docs/LIMITS.md docs/LEARNING.md privacy.html sw.js docs/NEEDS-TESTING.md`: "Say what's new when sources disagree".
