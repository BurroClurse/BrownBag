# Filled Prescriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, for each medicine, whether insurance pharmacy claims (FHIR ExplanationOfBenefit) show it was filled, add fills that aren't in the health record, and carry this into the QR code, using a made-up demo patient on the public sandbox to show every case.

**Architecture:** A new pure module `js/claims.js` turns pharmacy claims into fills, matches them to the existing list (RxNorm code, then same ingredients) and writes the card lines. `js/app.js` reads claims after the medicines inside its own time limit and draws the new lines and section. `js/share.js` and `js/share-view.js` carry fills to staff. `tools/demo-patient.mjs` puts the demo patient on the sandbox.

**Tech Stack:** Plain ES modules, fhirclient 3.0.1 (`client.request` with paging), RxNav via `js/rxnorm.js`, Node `node --test`, headless Chrome scripts in the session scratchpad.

**Spec:** `docs/superpowers/specs/2026-11-21-filled-prescriptions-design.md` (approved 2026-11-21).

## Global Constraints

- Work on `brown-bag-v1`; every finished, tested task is also fast-forwarded to `main` (Tyler's standing rule).
- Scope adds `patient/ExplanationOfBenefit.read` in `launch.html`; nothing else in the scope changes.
- A pharmacy claim: `type.coding` has `system` `http://terminology.hl7.org/CodeSystem/claim-type`, `code` `pharmacy`. The app filters; it never relies on a `type=` search.
- Fill date: `item[].servicedDate` or `item[].servicedPeriod.start`, else `billablePeriod.start`. Insurer: `insurer.display`; `NO_INSURANCE` means paid without insurance.
- Claims get their own 6000 ms limit inside the records step; a slow or failed claims read never discards the medicines update.
- Copy, exact:
  - Card: `Filled 3 times · last Jul 23, 2025 · Aetna claims`; one fill: `Filled once · Jul 23, 2025 · Aetna claims`; paid without insurance replaces `Aetna claims` with `paid without insurance`; two insurers: `Aetna and Medicare claims`.
  - No match with claims loaded: `No fill found in your claims`.
  - Completed but filled: `Marked completed in your records, but filled Dec 24, 2025`.
  - Notes: `Your insurance fills couldn't be loaded.` and `Sign in again to add your insurance fills.`
  - Section heading `Filled, not in your records`; its note: `Your insurance paid for these, but your health record doesn't list them. Check with your care team.`
  - QR notes: `Last filled 2025-07-23 (Aetna claims), 3 fills`, `No fill found in claims`, `Filled, not in the health record`. Staff page group: `Filled, not in the health record`.
  - "What's in this code?" gains the bullet `Insurance fills: when each medicine was last filled, and fills your record doesn't list`.
- "Recent" means a fill within 365 days of now.
- A patient whose claims loaded but hold no pharmacy claims sees nothing about fills.
- Commit messages: one short line in Tyler's voice, no dashes, plus the attribution lines. Tests: `node --test "tests/*.test.mjs"`.

## Review Focus

- A pass saved before this change lacks the new scope: the claims read is refused (401 or 403); the medicines still update and the note says `Sign in again to add your insurance fills.` Headless check in Task 3 (CDP `Fetch` answers ExplanationOfBenefit with 403).
- Claims stall: medicines update, the note says `Your insurance fills couldn't be loaded.`, no card says `No fill found`. Headless check in Task 3 (CDP holds ExplanationOfBenefit).
- A saved list from before this change (items without fill fields) opens offline without errors and shows no fill lines. Unit test in Task 1 (`fillLine(undefined)` is null) and the offline headless check in Task 5.
- "I stopped this" on a fill-only medicine survives the next update (its key is stable). Headless check in Task 3.
- The demo patient's QR code still fits one code, and the staff page shows the fill notes and the new group. Headless check in Task 4.

---

### Task 1: Claims into fills, matched to the list (`js/claims.js`)

**Files:**
- Create: `js/claims.js`, `tests/claims.test.mjs`
- Modify: `sw.js` (add `./js/claims.js`, cache `brownbag-v6`)

**Interfaces:**
- Produces:
  - `fillsFromClaims(eobs) -> Fill[]`; `Fill = { rxcui: string|null, name: string, date: "YYYY-MM-DD", insurer: string|null, cash: boolean }`, one per `item` of each pharmacy claim; non-pharmacy claims ignored.
  - `attachFills(split, fills, ingredientOf, now) -> split` (new object; `split` is the existing `{ current, older, failed, placeholders }`; `ingredientOf` is the `Map` from `ingredientsFor`). Adds `split.claims = "loaded"`. Each list item gains `fills = { count, last, insurers: string[], cash: boolean }` (`count` 0 when unmatched). An `older` item whose last fill is recent moves to `current` with `completedButFilled = last`. Unmatched fills group by `rxcui` (or lowercased name) into fill-only items: `{ key: "fill:" + (rxcui || name), origin: "claims", name, rxcui, status, fills, source: <claims label> }`, `current` when recent, else `older`.
  - Matching: same `rxcui`; else the same `ingredientOf` key when exactly one item has it; when several do, the one with the latest `start`.
  - `fillLine(fills, now) -> string|null` (null when `fills` is missing); `completedLine(date) -> string`; `claimsLabel(fills) -> string` (`Aetna claims`, `Aetna and Medicare claims`, `paid without insurance`).
  - `fillNote(fills) -> string` for the QR (`Last filled 2025-07-23 (Aetna claims), 3 fills` / `No fill found in claims`).

- [ ] **Step 1: Failing tests** in `tests/claims.test.mjs`, with claims shaped like the sandbox's (type pharmacy, `item[0].productOrService.coding[0]` RxNorm, `servicedPeriod.start`, `insurer.display`):
  - `fillsFromClaims` keeps pharmacy claims only, reads code, name, date, insurer; `NO_INSURANCE` gives `insurer: null, cash: true`.
  - `attachFills`: exact-code match counts 3 fills, last date, insurer; ingredient match when codes differ; ambiguous ingredient match goes to the later `start`; a completed (`older`) item with a fill 30 days ago moves to `current` with `completedButFilled`; an unmatched recent fill becomes a current fill-only item, an unmatched 2-year-old fill an older one; items with no match get `count: 0`.
  - `fillLine` for 3 fills, 1 fill, cash, two insurers, 0 fills, and `undefined` → the Global Constraints copy, and `null`.
  - `completedLine("2025-12-24")` → `Marked completed in your records, but filled Dec 24, 2025`.
  - `fillNote` for 3 fills and 0 fills.
  - `sw.js` lists `"./js/claims.js"`.
- [ ] **Step 2: Run.** Expected: fails, module missing.
- [ ] **Step 3: Implement** `js/claims.js` (no DOM; dates formatted with month names, always with the year).
- [ ] **Step 4: Run.** Expected: all pass.
- [ ] **Step 5: Commit** "Turn pharmacy claims into fills".

### Task 2: The demo patient (`tools/demo-patient.mjs`)

**Files:**
- Create: `tools/demo-patient.mjs`

**Interfaces:**
- Produces: on `https://r4.smarthealthit.org`, with fixed ids starting `brownbag-demo` (PUT, so re-running replaces, never duplicates): Patient `brownbag-demo-patient` (Avery Brownbag, born 1950-03-14) and these, dates relative to the day the script runs:
  - Lisinopril 10 MG Oral Tablet (RxNorm 314076): active MedicationRequest 6 months ago; Aetna fills 4 and 2 months ago.
  - Atorvastatin 20 MG Oral Tablet (617312): active MedicationRequest 3 months ago; no fill.
  - Metformin 500 MG Oral Tablet (861007): completed MedicationRequest 3 years ago; Aetna fill 2 months ago.
  - Amoxicillin 500 MG Oral Capsule (308191): completed MedicationRequest 6 weeks ago; fill 6 weeks ago with insurer `NO_INSURANCE`.
  - Sertraline 50 MG Oral Tablet (312940): Aetna fill 1 month ago; no MedicationRequest.
  - Ibuprofen 600 MG Oral Tablet (197806): Aetna fill 3 years ago; no MedicationRequest.
- Each claim is an ExplanationOfBenefit shaped like the sandbox's own (type pharmacy, status active, use claim, patient, `insurer.display`, `item[0].productOrService` RxNorm with text, `item[0].servicedPeriod`, `billablePeriod`, `insurance` with a contained Coverage, `outcome` complete).

- [ ] **Step 1:** Before writing anything, the script checks each RxNorm code's name with RxNav (`/REST/rxcui/{code}/properties.json`) and stops if a name doesn't match the list above.
- [ ] **Step 2: Run** `node tools/demo-patient.mjs`. Expected: prints each resource id with its HTTP status (200 or 201), then reads back `ExplanationOfBenefit?patient=brownbag-demo-patient` and `MedicationRequest?patient=brownbag-demo-patient` and prints 6 and 4.
- [ ] **Step 3:** Headless: sign in through the sandbox sim as `brownbag-demo-patient` (options `[3, "brownbag-demo-patient", "", "AUTO", 1, 1, 0, …]`); home shows "Avery Brownbag". Expected: pass.
- [ ] **Step 4: Commit** "Add a demo patient with fills to the sandbox".

### Task 3: Reading claims and showing fills on My medicines

**Files:**
- Modify: `launch.html` (scope), `js/app.js`, `css/brownbag.css` (only if the new lines need it)

**Interfaces:**
- Consumes: Task 1 (`fillsFromClaims`, `attachFills`, `fillLine`, `completedLine`), `ingredientsFor` from `js/rxnorm.js`, `withTimeout` from `js/pass.js`.
- Produces: `loadClaims(client, patientId) -> Promise<Fill[]>` (all pages of `ExplanationOfBenefit?patient={id}`, flat); `split.claims` one of `"loaded" | "none" | "failed" | "refused"`, saved with the records copy.

- [ ] **Step 1: Headless check** `drive/fills.mjs` (scratchpad), signing in as `brownbag-demo-patient`: Lisinopril's card reads `Filled 2 times · last <date> · Aetna claims`; Atorvastatin's `No fill found in your claims`; Metformin is under From your records with `Marked completed in your records, but filled <date>`; Amoxicillin shows `paid without insurance`; a `Filled, not in your records` section holds Sertraline with its note; Ibuprofen is under Older prescriptions; home reads `My medicines (5)`. Then the Review Focus cases: ExplanationOfBenefit answered 403 → medicines updated and `Sign in again to add your insurance fills.`; ExplanationOfBenefit held → within 20 s the medicines show and `Your insurance fills couldn't be loaded.`, no `No fill found`; "I stopped this" on Sertraline, reopen with a fresh update → still under Stopped by me. Patient e7de504a (no claims): no fill lines anywhere. axe clean.
- [ ] **Step 2: Run.** Expected: fails (no fill lines).
- [ ] **Step 3: Implement:** scope; `loadClaims` inside `loadFresh` after the medicines, under `withTimeout(…, 6000)`, with ingredients for fill codes from `ingredientsFor`; 401/403 → `"refused"`, other errors or timeout → `"failed"`, no pharmacy claims → `"none"`; `attachFills` only when `"loaded"`; card lines in `medRow`; the notes at the top of From your records; the new section between From your records and Older prescriptions with red "I stopped this".
- [ ] **Step 4: Run** the check and `node --test "tests/*.test.mjs"`. Expected: all pass.
- [ ] **Step 5: Commit** "Show what was actually filled".

### Task 4: Fills in the QR code and on the staff page

**Files:**
- Modify: `js/view.js` (`shareListFrom` unchanged unless needed), `js/share.js`, `js/share-view.js`, `js/app.js` ("What's in this code?"), `tests/share.test.mjs`

**Interfaces:**
- Consumes: Task 1 `fillNote`, item fields `fills`, `origin`, `completedButFilled`.
- Produces: `groupShareBundle(bundle).fromClaims` (rows `{ name, detail }`).

- [ ] **Step 1: Failing tests** in `tests/share.test.mjs`: a list with a matched item (3 fills), an unmatched item (count 0) and a fill-only item builds a Bundle where the first has note `Last filled 2025-07-23 (Aetna claims), 3 fills`, the second `No fill found in claims`, and the fill-only one has `informationSource.display` `Aetna claims` and note `Filled, not in the health record`; `groupShareBundle` puts the fill-only one in `fromClaims`, the others in `fromRecords` with the notes in `detail`; a completed-but-filled item's note includes `marked completed`.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** in `js/share.js`; `share-view.js` shows a `Filled, not in the health record` group after From records; the "What's in this code?" bullet.
- [ ] **Step 4: Run** tests, plus headless: demo patient's QR opens without the too-long message; the staff page (via `share.html` with the packed link and code) shows the fill notes and the new group; axe clean.
- [ ] **Step 5: Commit** "Carry fills in the QR code".

### Task 5: Learning log, README and full recheck

**Files:**
- Modify: `docs/LEARNING.md`, `README.md`

- [ ] **Step 1:** Rerun every scratchpad check (`first`, `unlock`, `qralert`, `qrhelp`, `final` full and empty, `motion`, `fixes`, `notes`, `autolock`, `placeholder`, `fills`) and the offline check with a saved list from before this change; all pass.
- [ ] **Step 2:** README: reads of ExplanationOfBenefit in "How it uses SMART and FHIR", the demo patient under a "Test patients" line. Learning log "Step 14. What was actually filled" with Practice in the lab: [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).
- [ ] **Step 3: Commit** "Explain filled prescriptions", and publish.
