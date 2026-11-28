# Browse all patients (design)

2026-11-28. A way to sign in as any of the SMART sandbox's patients who have a
medicine record, not only the 20 picked by hand.

## Why

Choose a test patient lists 20 patients picked by hand, then **Someone else**,
which opens the sandbox's own sign-in page, where only ten show. The developer
wants to look through more of the sandbox's 933 made-up patients when testing.

The course (Will from HL7) offered an optional `launch/launch.html` that
opens SMART's patient browser in a popup. It's a full replacement for
`launch.html`, so using it would drop Brown Bag's sign-in settings
(`offline_access`, the other scopes, history handling) and break the README
tests. Brown Bag keeps its own `launch.html` and builds browsing into it.

## Goals, non-goals, anti-goals

- **Goal:** find and sign in as any sandbox patient with a medicine record,
  messy ones included, sorted the ways useful for testing, from a phone.
- **Non-goals:** patients on other servers; showing a patient's records before
  signing in; patients added to the sandbox after the list was last made.
- **Anti-goals:** changing how sign-in works; a popup; signing in as an id
  that isn't on a list Brown Bag ships.

## Approaches

1. **Brown Bag's own screen, searching the sandbox live** (picked first by
   the developer, over the popup). Always current, but the sandbox's search
   can't sort patients by how many medicines they have, and it answered 503
   under a few dozen quick requests.
2. **SMART's patient browser in a popup**, like Will's file. Less to build,
   but it needs popups, may not report back from a phone or the Home Screen
   app, and isn't Brown Bag's screen.
3. **Brown Bag's own screen, reading a saved list** (picked by the developer
   once they asked for most-medicines-first). A tool counts each patient's
   records on the sandbox once and saves the list in the app. Opens
   instantly, searches instantly, works when the sandbox is slow, and the
   list doubles as the safety check. Patients added later aren't listed until
   the tool runs again.

## What the developer decided (2026-11-28)

- Brown Bag's own screen, not the popup; then a saved list made by a tool
  they can re-run, not a live search.
- Only patients with medicines, but every kind of record counts: errors and
  missing values are what testing needs (the developer, 2026-11-28). A patient
  is listed when they have any MedicationRequest or MedicationStatement, in
  any status, "entered in error", "cancelled", "draft" and "unknown"
  included. Living patients all go in; of those marked deceased, the 25 with
  the most different medicines go in, listed like everyone else (no death
  date on the row). On 2026-11-28 that's about 500 of the 933.
- Counts leave nothing out: an allergy marked "entered in error" or
  "refuted", or a prescription in any status, still counts.
- A missing value shows plainly: "No name in the record", "No birth date".
- **Sort by**, defaulting to **Most different medicines**; also Most
  prescriptions, Most current medicines, Most insurance fills, Most
  allergies, Name A to Z, Oldest first, Youngest first, and **Added by other
  people** (the developer, 2026-11-28; below).
- Each row: name and birth date, as a real list would, plus the number for
  the current sort ("Born May 8, 1974. 12 different medicines."); no number
  for Name A to Z or the age sorts.
- 20 at a time, then **Show more**.
- The name search matches any part of the first or last name, ignoring case
  and accents, and narrows the list as each letter is typed.
- **Browse all patients** replaces **Someone else** at the end of Choose a
  test patient. The 20 hand-picked patients stay above it.

## What it looks like

```
Choose a test patient            Browse all patients
  …the 20, in their groups…        [Back]
  ┌────────────────────────┐       Browse all patients
  │ Browse all patients    │       503 made-up patients with medicines.
  │ Search the sandbox's   │       Search by name [ mel            ]
  │ 503 patients with      │       Sort by [Most different medicines ▾]
  │ medicines.             │       ┌──────────────────────────────┐
  └────────────────────────┘       │ Florencia Meléndez           │
                                   │ Born March 12, 1993.         │
                                   │ 12 different medicines.      │
                                   ├──────────────────────────────┤
                                   │ …                            │
                                   └──────────────────────────────┘
                                   Showing 20 of 31. [Show more]
```

Rows are the same buttons as Choose a test patient's. No match says "No one
by that name. Check the spelling, or clear the search." Tapping a patient
starts sign-in exactly as a hand-picked one does.

## How it's built

- **`tools/sandbox-patients.mjs`** makes the list. It finds every patient
  with a MedicationRequest or a MedicationStatement in any status (`_has`
  searches, 20 per page), then reads each one's MedicationRequests,
  MedicationStatements, AllergyIntolerances and ExplanationOfBenefits, one
  patient at a time, slowly, retrying a 503 after a pause. It writes
  `js/sandbox-patients.js`: the date it was made and one entry per patient
  (id, name or none, birth date or none, whether deceased, and the six
  counts). Run it again to refresh; it changes nothing on the sandbox.
- **Patients other people added stay out of the saved list.** The sandbox's
  own patients have long ids (`e7de504a-…`); patients added through its API
  get number ids (`5023633`) or, for Brown Bag's own, `brownbag-…`, and the
  sandbox deletes added patients every night, so a saved list would point at
  people who are gone. Riley Reconcile and Jordan Partial stay where they
  are, signed in from the home test server.
- **Added by other people** is the one view that asks the sandbox live (the
  developer, 2026-11-28). It searches for patients with a MedicationRequest or
  MedicationStatement in any status, newest first (`_sort=-_lastUpdated`, 20
  per page), keeps those whose ids aren't the sandbox's own (not a long id,
  not `brownbag-…`), and shows name and birth date (or "No name in the
  record", "No birth date"), with no count. A line says "Added to the sandbox
  by other people. They may be gone after its nightly reset." The name search
  narrows what has loaded. If the sandbox doesn't answer: "Couldn't reach the
  sandbox." with **Try again**. `launch.html`'s content security policy
  already allows the sandbox, so nothing changes there.
- **Signing in as an added patient:** its choice is
  `launch.html?source=…&as=<id>&added=1`, and `knownPatient` accepts it only
  when the id is a FHIR id in shape (`[A-Za-z0-9.-]{1,64}`), since it can't be
  on a saved list.
- **Counts** leave nothing out:
  - different medicines: distinct RxNorm codes, else names, across every
    MedicationRequest and MedicationStatement, any status;
  - prescriptions: every MedicationRequest, any status;
  - current medicines: distinct medicines among active MedicationRequests
    and MedicationStatements;
  - insurance fills: items on pharmacy claims (`claims.js`'s test for a
    pharmacy claim);
  - allergies: every AllergyIntolerance, whatever its status.
- **`js/browse.js`** sorts, searches and pages the list, with no DOM, so Node
  tests cover it. `js/launch.js` draws the screen.
- **Its own history step:** `launch.html?source=…&browse=1`. Back from it is
  Choose a test patient. The search, sort and how many are showing are kept
  in that step's `history.state`, so Back from the sandbox returns to the same
  place in the list.
- **Sign-in:** a browsed patient's choice is `launch.html?source=…&as=<id>`,
  as today. `knownPatient` accepts an id from the 20 or from the saved list,
  so `sandboxServer` still refuses anything else.
- **No new network access:** the screen reads only the app's own file; the
  content security policy doesn't change. The tool runs on a computer, not in
  the app.
- **Someone else** goes from the screen. The sandbox's own list stays
  reachable the way it is now for a link with no patient (Try again after a
  failed start).

## Docs and tests

- Node tests for the added-by-others filter (which ids count as added) and
  its sign-in link.
- Node tests for `browse.js` (each sort, ties broken by name, search with
  accents and case, paging, the number line, a row with no name or no birth
  date), for `knownPatient` with a browsed id, and that the saved list has 25
  deceased patients, no one without a medicine record, no added patient's id,
  and the same count as the README says.
- `docs/SANDBOXES.md` (test patients), `docs/HOW-IT-WORKS.md` (launch),
  `docs/FILES.md` (the new files), `docs/DECISIONS.md`, `docs/LEARNING.md`,
  and `docs/NEEDS-TESTING.md` for a phone pass.
- The README's Live line gets one sentence (the developer, 2026-11-28): Choose
  a test patient's **Browse all patients** lists about 500 of the sandbox's 933
  patients who have a medicine record of any kind (every living one, and 25
  who have died), with the exact number from the saved list.

## Left to the builder

The wording of the screen's lines beyond those above, the sort menu's control
(a native `select`), how slowly the tool asks the sandbox, and the file's exact
shape.
