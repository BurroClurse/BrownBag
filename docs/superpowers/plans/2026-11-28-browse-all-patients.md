# Browse all patients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Browse all patients** choice on Choose a test patient that finds, sorts and signs in as any sandbox patient with a medicine record.

**Architecture:** A Node tool counts each sandbox patient's records once and writes a saved list (`js/sandbox-patients.js`). A DOM-free module (`js/browse.js`) sorts, searches, pages and words that list, and filters the one live view, Added by other people. `js/launch.js` draws the screen as its own history step; sign-in itself is unchanged except that `knownPatient` accepts the saved list.

**Tech Stack:** Plain ES modules in the browser, Node 22 `node:test`, the SMART Health IT R4 sandbox (`https://launch.smarthealthit.org/v/r4/fhir`).

**Spec:** `docs/superpowers/specs/2026-11-28-browse-all-patients-design.md`

## Global Constraints

- No new network access in the app: the saved list is an app file; the live view uses the sandbox, which `launch.html`'s content security policy already allows. No CSP change.
- The developer is "the developer", they/them, everywhere but the copyright, README and privacy page.
- Plain words, big buttons, WCAG 2.2 AA, no sideways scrolling at 320 px or 200 percent text.
- Every new `js/` file goes in `sw.js`'s list and `docs/FILES.md` (tests check both); bump `CACHE` from `brownbag-v106` to `brownbag-v107`.
- The tool is polite to the sandbox: one request at a time, 20 per page for searches, a pause between requests, a 503 retried after a longer pause.

## Review Focus

- A sandbox answer with a patient whose `name` is missing or empty → the row reads "No name in the record", never "undefined" or blank. Test in Task 2.
- A search with capitals and accents ("MEL", "melendez") → finds "Florencia Meléndez". Test in Task 2.
- Sorting ties (several patients with 0 allergies) → a stable order by name, so Show more never repeats or skips anyone. Test in Task 2.
- A hand-typed address `launch.html?source=smart-sandbox&as=<not on any list>` → no sign-in starts; with `&added=1`, only an id shaped like a FHIR id is accepted. Test in Task 3.
- The live view when the sandbox answers 503 or not at all → "Couldn't reach the sandbox." with Try again, and the rest of the screen still works. Test in Task 4.

---

### Task 1: The saved list and the tool that makes it

**Files:**
- Create: `tools/sandbox-patients.mjs`, `js/sandbox-patients.js` (generated), `tests/sandbox-patients.test.mjs`
- Modify: `docs/FILES.md`, `sw.js`

**Interfaces:**
- Produces: `js/sandbox-patients.js` exports `MADE` (a `YYYY-MM-DD` string) and `PATIENTS`: an array of `{ id, name, born, deceased, different, prescriptions, current, fills, allergies }`, where `name` and `born` are a string or `null`, `deceased` a boolean, the rest numbers. Sorted by `different` descending, then name.
- Produces: `tools/sandbox-patients.mjs` exports `countsFor({ requests, statements, allergies, claims })` → the five counts, `nameOf(patient)` → string or `null`, and imports `isAddedId` from `js/browse.js` (Task 2; write Task 2's `isAddedId` first if working in order).

- [ ] **Step 1: Write the failing tests** in `tests/sandbox-patients.test.mjs`:
  - `countsFor` counts a MedicationRequest in every status (`entered-in-error`, `cancelled`, `draft` included) in `prescriptions`; `different` counts distinct RxNorm codes, else lower-cased names, across requests and statements; `current` counts distinct medicines among `active` ones; `fills` counts items on claims whose `type.coding` has `claim-type` `pharmacy`; `allergies` counts every AllergyIntolerance, `entered-in-error` and `refuted` included.
  - `nameOf` gives "Given Family" from the `official` name, else the first; `null` for no name or an empty one.
  - The saved list: every entry has `different > 0` or `prescriptions > 0`; exactly 25 have `deceased: true`; none has an id that `isAddedId` calls added; ids are unique; `MADE` is a date.
- [ ] **Step 2: Run** `node --test tests/sandbox-patients.test.mjs` and see it fail (no module).
- [ ] **Step 3: Write the tool.** It runs only when executed directly (`import.meta.url` against `process.argv[1]`). It pages `Patient?_has:MedicationRequest:patient:status=<all eight>&_count=20&_elements=id` and the same for `MedicationStatement:subject` (all eight of its statuses), unions the ids, drops `isAddedId` ones, then for each id reads the Patient, its MedicationRequests, MedicationStatements, AllergyIntolerances and ExplanationOfBenefits (all pages), with about 300 ms between requests and a 503 retried up to 4 times after 5 s. It keeps every living patient and the 25 deceased with the highest `different` (ties by name), and writes `js/sandbox-patients.js` with a header comment saying how it was made and how to run it again (`node tools/sandbox-patients.mjs`).
- [ ] **Step 4: Run the tool** (`node tools/sandbox-patients.mjs`, several minutes) and the tests; they pass. Note the count it prints for the README (Task 5).
- [ ] **Step 5: Add** `"./js/sandbox-patients.js"` to `sw.js` and both new files to `docs/FILES.md`. Commit.

### Task 2: Sorting, searching and wording the list

**Files:**
- Create: `js/browse.js`, `tests/browse.test.mjs`

**Interfaces:**
- Produces: `SORTS`: an array of `{ id, label }` in this order: `different` "Most different medicines", `prescriptions` "Most prescriptions", `current` "Most current medicines", `fills` "Most insurance fills", `allergies` "Most allergies", `name` "Name A to Z", `oldest` "Oldest first", `youngest` "Youngest first", `added` "Added by other people". `DEFAULT_SORT = "different"`. `PAGE = 20`.
- Produces: `sortPatients(patients, sortId)` → a new array; `matchesName(patient, query)` → boolean; `findPatients(patients, query, sortId)` → sorted matches; `rowLines(patient, sortId, format)` → `{ name, detail }`; `isAddedId(id)` → boolean; `addedFromBundle(bundle)` → `[{ id, name, born }]`.

- [ ] **Step 1: Write the failing tests** in `tests/browse.test.mjs`:
  - Each count sort is highest first; ties go by name (A to Z, accents folded), then id; `name` sorts by family then given; `oldest`/`youngest` by `born`, patients with no birth date last in both.
  - `matchesName`: "mel", "MEL" and "melendez" match "Florencia Meléndez"; "" matches everyone; a patient with `name: null` matches only "".
  - `rowLines`: `{ name: "Florencia Meléndez", detail: "Born March 12, 1993. 12 different medicines." }` for `different`; "1 prescription" / "3 prescriptions", "current medicine(s)", "insurance fill(s)", "allergy/allergies"; no number for `name`, `oldest`, `youngest` and `added`; `name: null` gives "No name in the record"; `born: null` gives "No birth date.".
  - `isAddedId`: `false` for `e7de504a-311d-49be-b2bc-566a328bcc72`; `true` for `5023633` and `brownbag-recon-riley`.
  - `addedFromBundle`: keeps only added ids from a searchset Bundle, reads names with `nameOf`'s rule, keeps `born` or `null`, and ignores entries with no resource.
- [ ] **Step 2: Run** `node --test tests/browse.test.mjs`; it fails.
- [ ] **Step 3: Write `js/browse.js`** (no DOM). Use `bornText` from `js/card.js` for the birth date words; fold accents with `normalize("NFD")` and removing combining marks. A long id is the 8-4-4-4-12 hex shape; anything else is added.
- [ ] **Step 4: Run** the tests; they pass.
- [ ] **Step 5: Add** `"./js/browse.js"` to `sw.js` and to `docs/FILES.md`. Commit.

### Task 3: Signing in as a browsed patient

**Files:**
- Modify: `js/test-patients.js` (`knownPatient`, `sandboxServer`), `js/sources.js` (`signInLink`, `chosen`)
- Test: `tests/test-patients.test.mjs`, `tests/sources.test.mjs`

**Interfaces:**
- Consumes: `PATIENTS` (Task 1).
- Produces: `knownPatient(id)` is true for the 20 and for every `PATIENTS` id. `addedId(id)` → true for a FHIR-shaped id (`/^[A-Za-z0-9.-]{1,64}$/`). `signInLink(id, added)` adds `&as=<id>` for a known id, or `&as=<id>&added=1` when `added` is true and `addedId(id)`. `chosen(search)` returns such an id only with `added=1`. `sandboxServer(id, added)` builds the same `/sim/` address for either, and still throws for anything else.

- [ ] **Step 1: Write the failing tests:** a `PATIENTS` id is known and signs in with options `[3, id, …, 1, 0]`; `signInLink("5023633", true)` ends `&as=5023633&added=1` and `chosen` of it is `"5023633"`; without `added=1` it's `null`; `chosen("?source=smart-sandbox&as=a%2Cb&added=1")` and an id of 65 characters are `null`; `sandboxServer("x,y", true)` throws.
- [ ] **Step 2: Run** `node --test tests/test-patients.test.mjs tests/sources.test.mjs`; the new tests fail.
- [ ] **Step 3: Change** the four functions; `leavingText` and `startFor` follow `chosen`, so they need nothing more.
- [ ] **Step 4: Run** the full suite, `node --test "tests/*.test.mjs"`; it passes. Commit.

### Task 4: The Browse all patients screen

**Files:**
- Modify: `js/launch.js` (`showPatients`, a new `showBrowse`, `showScreen`), `js/sources.js` (`startFor` returns `"browse"` for `browse=1`), `css/brownbag.css`
- Test: `tests/sources.test.mjs`, `tests/browse-screen.test.mjs`

**Interfaces:**
- Consumes: `SORTS`, `DEFAULT_SORT`, `PAGE`, `findPatients`, `rowLines`, `addedFromBundle` (Task 2); `PATIENTS` (Task 1); `signInLink(id, added)` (Task 3); `withTimeout` from `js/pass.js`.

- [ ] **Step 1: Write the failing tests:**
  - `startFor("?source=smart-sandbox&browse=1")` is `"browse"`.
  - In `js/launch.js`'s `showPatients`: no "Someone else", no `signInLink(OWN_LIST)`; a button "Browse all patients" whose detail names the saved list's length, and whose click is `location.href = browseLink()` (its own history step).
  - `showBrowse` keeps `{ query, sort, shown }` with `history.replaceState`, and reads it back on load; a row's click is `location.href = signInLink(id, sort === "added")`.
  - The live view asks `…/Patient?_has:MedicationRequest:patient:status=…&_sort=-_lastUpdated&_count=20&_elements=name,birthDate` and the `MedicationStatement:subject` form, under `withTimeout`, and on failure shows "Couldn't reach the sandbox." with a Try again button.
  - Update the Back-from-the-sandbox test's `OWN_LIST` line to match.
- [ ] **Step 2: Run** them; they fail.
- [ ] **Step 3: Build the screen:** Back (to Choose a test patient), the heading "Browse all patients" (focused), "N made-up patients with medicines." (or, for Added by other people, "Added to the sandbox by other people. They may be gone after its nightly reset."), a labelled search field (`type="search"`, narrows on `input`), a labelled `select` for Sort by, the rows as `patientButton`s in an `option-card`, "Showing 20 of 31." and **Show more** (focus moves to the first new row), and "No one by that name. Check the spelling, or clear the search." when nothing matches. A status line (`role="status"`) says how many match after each search. Style the search field and select like the app's other fields, full width, nothing wider than the screen.
- [ ] **Step 4: Run** the full suite; it passes.
- [ ] **Step 5: Check it in headless Chromium** at iPhone 15 size and 320 px: `BROWN_BAG_DEMO= node tools/serve.mjs`, open `https://localhost:8443/launch.html?source=smart-sandbox`, tap Browse all patients, sort, search "mel", Show more, Back, then a patient: the sandbox's approval page names them. Screenshots in the scratchpad. Commit.

### Task 5: Docs, the README line and the phone checks

**Files:**
- Modify: `README.md`, `tests/readme.test.mjs`, `docs/SANDBOXES.md`, `docs/HOW-IT-WORKS.md`, `docs/DECISIONS.md`, `docs/LEARNING.md`, `docs/NEEDS-TESTING.md`, `sw.js` (`CACHE` to `brownbag-v107`)

- [ ] **Step 1: Write the failing test** in `tests/readme.test.mjs`: the README says "Browse all patients" and the saved list's exact length, and "933".
- [ ] **Step 2: Write the docs:** the README's Live line gains: "Choose a test patient's **Browse all patients** lists the N of the sandbox's 933 patients with a medicine record of any kind (every living one, and 25 who have died)." `SANDBOXES.md`: Browse replaces Someone else, how to refresh the list, the live view. `HOW-IT-WORKS.md`: one paragraph under Launch. `DECISIONS.md`: the developer's decisions of 2026-11-28 (each line from the spec), the standing principle "The data is the source of truth, even when it may be wrong; Brown Bag makes any discrepancy clear", and Claude's calls R53 onward (counting rules, Back keeps the place, the slow tool, added patients out of the saved list). `LEARNING.md`: Step 69 in plain words. `NEEDS-TESTING.md`: the screen on both virtual phones (sort, search with an accent, Show more and focus, Back keeps the place, a deceased patient signs in, Added by other people with and without signal, TalkBack reads the search and sort labels, 200 percent text).
- [ ] **Step 3: Bump the cache, run** the full suite; it passes. Commit, push, mark PR #26 ready and merge once the developer's go-ahead stands.
