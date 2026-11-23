# Allergies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the patient's allergies with reactions, from the records and their own, at the top of My medicines, in the QR code and on the staff page.

**Architecture:** A new pure module, `js/allergies.js`, reads AllergyIntolerance records and joins them with the patient's own into cards. `js/app.js` loads them beside the medicines and claims, saves them in the existing encrypted copies and draws the section. `js/share.js` and `js/share-view.js` carry them to staff.

**Tech Stack:** Static ES modules, fhirclient 3.0.1 (vendored), Node's test runner. No new libraries.

**Spec:** `docs/superpowers/specs/2026-11-23-allergies-design.md`

## Global Constraints

- Static site, no server, no new libraries. WCAG 2.2 AA. Home keeps its layout.
- Work on `brown-bag-v1`. **Nothing from Tasks 1 to 6 goes to `main` until Tyler has seen screenshots from both virtual phones and chosen A or B.** Pushing `brown-bag-v1` is fine.
- A failed or refused load never looks like "no allergies". A missing reaction says "Reaction not in your records".
- Allergies never slow down or fail the medicine list: own 6-second limit (`CLAIMS_WAIT_MS` pattern).
- Words always; a code only from the record, the four SNOMED statements in the spec, or RxNorm codes checked against RxNav.
- Commit as the noreply email, one short line, no dashes, plus the attribution lines. Run `node --test "tests/*.test.mjs"`.
- Teach as we build: one LEARNING section per finished part, with a lab link.

## Review Focus

1. A record with no `clinicalStatus`, or `code` with no text and no display: still listed ("Unnamed allergy"), never dropped. (Task 1)
2. Allergies fail while medicines load, and the other way round: each part keeps its own list and date. (Tasks 2 and 4)
3. A saved list or a `v2.` code from before this feature: "haven't been loaded yet" and "doesn't include allergies", never "none". (Tasks 2 and 3)
4. "No known allergies" said, then an allergy arrives from the records: the statement isn't shared. (Task 1)
5. The patient's reaction when the record's code changes but the name stays: it stays on the card. (Task 1)

---

### Task 1: Read and join allergies (`js/allergies.js`)

**Files:** Create `js/allergies.js`, `tests/allergies.test.mjs`. Modify `sw.js` (add `"./js/allergies.js"` to `APP_FILES`).

**Interfaces:**
- Produces:
  - `fromAllergyRecords(resources, sourceName) -> { items, statements }`. Item: `{ key, otherKeys, name, code: { system, code } | null, reactions: [{ text, severity }], intolerance, unconfirmed, highRisk, source }`. Key `"alg:" + system + "|" + code`, else `"alg:name:" + plain name`; `otherKeys` always holds the plain-name key when the key is a code. `statements` is a list of texts ("No known drug allergy").
  - `readAllergies(request, patientId, sourceName, ms) -> { status: "loaded" | "failed" | "refused", items, statements }`. Never throws. Same paging and deadline shape as `readClaims`.
  - `keepAllergies(result, saved) -> { status, items, statements, savedAt }`: loaded gives the new ones with `savedAt: null`; failed or refused gives the saved items with the saved date, keeping the new status; no saved copy gives empty lists. `saved` undefined gives `status: "not-loaded"` when `result` is null.
  - `arrangeAllergies(allergies, data) -> { cards, statements, saidNone, canSayNone, count }`. Card: a record item or an own one, plus `mine: { id, reaction, addedAt } | null` and `origin: "records" | "added"`.
  - `reactionLine(card) -> string`, `detailLines(card) -> string[]`.
  - `ALLERGENS`, `REACTIONS`: `[{ label, rxcui? }]` in the spec's order, without Other….
  - `sameAllergen(name, cards) -> card | null` (ignores case and spacing).

- [ ] **Step 1: Write the failing tests**, with these assertions at least:

```js
const rec = (o = {}) => Object.assign({ resourceType: "AllergyIntolerance", id: "1", clinicalStatus: { coding: [{ code: "active" }] }, verificationStatus: { coding: [{ code: "confirmed" }] }, code: { coding: [{ system: "http://snomed.info/sct", code: "84489001", display: "Mold (organism)" }], text: "Mold (organism)" } }, o);
// "Mold (organism)" -> name "Mold", key "alg:http://snomed.info/sct|84489001", otherKeys ["alg:name:mold"]
// entered-in-error, refuted, inactive, resolved -> left out; no clinicalStatus -> kept
// code {} -> name "Unnamed allergy"; two unnamed records stay two items
// reaction [{ manifestation: [{ text: "Hives" }, { coding: [{ display: "Wheezing" }] }], severity: "severe" }]
//   -> [{ text: "Hives", severity: "severe" }, { text: "Wheezing", severity: "severe" }]
// same code twice -> one item, both reactions, highRisk if either is high
// same plain name, different codes -> one item, both code keys kept
// 716186003 / 409137002 / 429625007 / 428607008 -> statements, not items
// unconfirmed and presumed -> unconfirmed true; type intolerance -> intolerance true
assert.equal(reactionLine({ reactions: [], mine: null }), "Reaction not in your records");
assert.equal(reactionLine({ reactions: [{ text: "Hives", severity: "severe" }], mine: null }), "Reaction: Hives (severe)");
assert.equal(reactionLine({ reactions: [], mine: { reaction: "Itching" } }), "Reaction: Itching (added by me)");
assert.equal(reactionLine({ reactions: [{ text: "Hives" }], mine: { reaction: "Itching" } }), "Reaction: Hives · Itching (added by me)");
assert.equal(reactionLine({ origin: "added", reactions: [], mine: { reaction: "Not sure" } }), "Reaction not known");
// own "penicillin" + record "Penicillin" -> one card, origin "records", mine set, count 1
// data.allergyReactions["alg:name:mold"] finds the card keyed by code
// noKnownAllergies set + nothing listed -> saidNone; + one card -> saidNone null
// canSayNone: only when nothing listed, not said, and (status "loaded" or savedAt)
// readAllergies: 403 -> refused, 500 -> failed, a stalled page -> failed within ms, two pages joined
// keepAllergies: failed + saved -> saved items and savedAt, status "failed"
```

- [ ] **Step 2: Run** `node --test tests/allergies.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the functions. Strip one trailing `(…)` of SNOMED's semantic tags (`organism|substance|disorder|finding|product|physical object|situation`) only.
- [ ] **Step 4: Run the whole suite.** Expected: all pass.
- [ ] **Step 5: Commit** "Read allergies from the records".

### Task 2: Save them (`js/offline.js`, `js/vault.js`, `js/view.js`)

**Files:** Modify `js/vault.js` (`loadByName`, `importBackup`), `js/view.js` (`changeAlert`, `logChange`). Test `tests/vault.test.mjs`, `tests/view.test.mjs`, `tests/offline.test.mjs`.

**Interfaces:**
- Consumes: the card and status shapes from Task 1.
- Produces:
  - `loadPatientData` also gives `allergies: []` (`{ id, name, rxcui, reaction, addedAt }`), `allergyReactions: {}` (record key -> `{ reaction, addedAt }`), `noKnownAllergies: null | "YYYY-MM-DD"`.
  - The records copy may hold `allergies: { items, statements, savedAt }`; absent means not loaded yet.
  - A change may carry `part: "allergies"`; none means medicines. Kinds: `allergy-added`, `allergy-removed`, `reaction-added`, `reaction-removed`, `none-said`, `none-unsaid`, with the opposites cancelling in `logChange`.
  - `changeAlert(changes, saved, now)` where `saved = { medicines, allergies }` dates or null; it lists only changes whose part is a saved copy, and dates itself by the older one. Update its callers.

- [ ] **Step 1: Failing tests:** old saved data loads with the three defaults; restore joins own allergies by id, the phone's reaction wins, and `noKnownAllergies` is null after restore if either side has an own allergy; `changeAlert` with `{ medicines: null, allergies: "2026-11-21T…" }` lists "Added the allergy Penicillin" and not a medicine change; `allergy-added` then `allergy-removed` of one name cancels.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run the suite, expect pass.**
- [ ] **Step 5: Commit** "Save allergies on the phone".

### Task 3: QR code and staff page (`js/share.js`, `js/share-view.js`)

**Files:** Modify both. Test `tests/share.test.mjs`.

**Interfaces:**
- Consumes: `arrangeAllergies(...)` as `list.allergies`; `warnings.allergies = { status, savedAt }`.
- Produces: `groupShareBundle(bundle).allergies` is null when the Bundle has no allergy tag, else `{ status, savedAt, fromRecords: [{ name, detail }], fromPatient: [...], statements: [...], saidNone }`. `allergyNotices(groups.allergies) -> string[]` and `allergyEmptyText(groups.allergies) -> string | null`, exported from `share.js`, hold the staff page's wording.

- [ ] **Step 1: Failing tests:**
  - a record allergy becomes AllergyIntolerance with `patient` `resource:0`, clinicalStatus active, its verificationStatus, criticality, type, code text and coding, reactions with severity, note "From records: SMART sandbox"; the patient's reaction is its own `reaction` entry with a note "From the patient";
  - an own allergy has `asserter` `resource:0`, verificationStatus unconfirmed; "Not sure" sends no reaction and the note "Reaction not known";
  - `saidNone` sends SNOMED 716186003 with `asserter`; records' statements are sent and grouped;
  - round trip through `packShare`/`unpackShare` starts `v3.`; a `v2.` link still opens and gives `allergies: null`;
  - notices: failed, refused, not-loaded -> "Allergies from records couldn't be loaded. Ask the patient." **even when an own allergy is listed**; savedAt -> "Allergies from records are a copy saved on …"; loaded -> none;
  - empty text: saidNone -> "Patient says: no known allergies."; loaded -> "None in the records. The patient hasn't said."; null group -> "This code doesn't include allergies. Ask the patient."; failed -> null (the notice says it); a records statement present -> null.
  - 25 medicines plus 8 allergies still fit (`fitsInQr`).
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement**, with the staff "Allergies" section first under the name, "From records" and "From patient" inside it. **Step 4: Run the suite, expect pass.**
- [ ] **Step 5: Commit** "Share allergies in the QR code".

### Task 4: Sign-in and loading (`launch.html`, `js/app.js`)

**Files:** Modify `launch.html` (scope), `js/app.js`, `js/view.js` (`noticesFor`), README scopes. Test `tests/view.test.mjs`, and the test that checks README and launch scopes if there is one.

**Interfaces:**
- Consumes: `readAllergies`, `keepAllergies`. 
- Produces: `state.allergies` (Task 1's `keepAllergies` shape), set on sign-in, update and saved open. `noticesFor` gains `allergiesRefused`, giving `{ kind: "sign-in", text: "Sign in again to add your allergies." }` after the others, never two sign-in notes at once (the existing one wins).

- [ ] **Step 1: Failing tests** for `noticesFor` (alone, and with `needsSignIn`).
- [ ] **Step 2: Implement:** scope `patient/AllergyIntolerance.read`; load beside the claims; on update, medicines failing must not discard loaded allergies, and allergies failing must not discard medicines; a different patient never keeps the old patient's allergies; `keepFreshCopy` writes `allergies` with its own `savedAt`; `clearChanges` clears only the part that updated.
- [ ] **Step 3: Run the suite, expect pass. Step 4: Browser check** with made-up answers from the test server: loaded, 403, 500, stalled, medicines failing. Expected: each part keeps its own list and date, and the medicines never wait past their limit.
- [ ] **Step 5: Commit** "Load allergies beside the medicines".

### Task 5: The section on My medicines (`js/app.js`, `css/brownbag.css`)

**Files:** Modify `js/app.js`, `js/view.js`, `css/brownbag.css`. Consider `js/allergies-view.js` for the drawing if `app.js` grows past comfort; it must take everything it needs as arguments.

**Interfaces:**
- Consumes: everything above, `pickList`, `draftStarted`, `unsavedText`.
- Produces: `drawAllergies(parent)`, called first in `drawMedicines` (A). Option B only moves this call to its own screen and adds the home button.

- [ ] **Step 1: Failing tests** for any new pure helper: the allergy draft counts as started when either list is chosen, and `unsavedText` names the allergy ("Penicillin isn't saved yet. Open My medicines to finish adding it.").
- [ ] **Step 2: Implement** the section, both empty states, loading lines, add form (both answers required), "Add the reaction", change and remove, Undo, "I have no known allergies" and its Undo, the already-listed panel with "Go back" and "Use my reaction for it", the kept draft, "What's in this code?" line. Announcements and focus as the medicine form does.
- [ ] **Step 3: Check RxNorm codes** for amoxicillin, aspirin, ibuprofen and codeine against RxNav from the test browser; leave out any that don't match by name.
- [ ] **Step 4: Browser check** of every state, with axe in light and dark, at 390 and 320 wide, and 200% text.
- [ ] **Step 5: Commit** "Show and add allergies".

### Task 6: Screenshots for Tyler (stop point)

- [ ] **Step 1:** Run the app on both virtual phones from the Mac, not the live site: plain `http://localhost` (a secure context), through `adb reverse` on Android; the iPhone simulator shares the Mac's network. If Safari refuses encryption there, take iPhone-size test browser screenshots instead and say so.
- [ ] **Step 2:** Sign in as Chantell Bartell (Mold). Check add, reaction, no known allergies (with Loria Jenkins if none), QR code and staff page. Save screenshots of the top of My medicines, the add form and the staff page.
- [ ] **Step 3:** One fresh reviewer on the whole branch (Review Focus above), and one fix pass.
- [ ] **Step 4: Stop. Send Tyler the screenshots and ask: A or B.** If B, move `drawAllergies` to its own screen with a third home button, check home fits one screen on both phones, and show him again.

### Task 7: Publish

- [ ] **Step 1:** After Tyler's OK: README (what the patient sees, scopes, reads, files), LIMITS (a limit on allergies: the sandbox has no reactions or medicine allergies), LEARNING steps with lab links, `sw.js` cache number, spec's Later list.
- [ ] **Step 2:** Suite passes, push `brown-bag-v1` to `main`, wait for the live site, then run both virtual phones on it and record it in `docs/NEEDS-TESTING.md`.
- [ ] **Step 3:** VoiceOver on the allergies section goes under "On a real iPhone (Tyler)".
