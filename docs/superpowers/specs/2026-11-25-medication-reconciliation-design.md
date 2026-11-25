# Brown Bag: when sources disagree about a medicine

Status: draft for Tyler's approval, 2026-11-25. Not built.

## Why

Tyler, 2026-11-25: pulling medicines from one FHIR source is "the clean
part". The harder problem is "what happens when the app pulls from multiple
sources (such as different EHRs, pharmacy fill history, patient-entered
OTCs, or an incoming SMART Health Link) and they conflict on dose, schedule,
or whether the patient still takes the drug". Medicare Blue Button comes
next, but "it's just as important to include other health systems and
incoming SMART Health Links (the whole purpose of the app and
interoperability)."

`docs/LIMITS.md` #8 ("Sources disagree") and the connections design's
non-goal ("combining medicine lists from two health systems ... gets its own
design") both wait on this design.

## Who and what for

- **The patient**, who may be 90. They should never have to act like a
  pharmacist (Tyler). They know what they take and how much: they have the
  bottle.
- **The person at the desk** who scans the QR code. They decide what is
  right: which dose was meant, and whether two products are double therapy.
  They need both sides of every disagreement, with who said each and when,
  so they can sort it out quickly.

## Goals

- One reconciliation core that every source feeds into the same way:
  health systems, insurance fills, the patient's own additions, and
  snapshots such as an incoming SMART Health Link or IPS file.
- Nothing is overwritten. Every source's version is kept, with its source
  name and date, and the merged list is worked out fresh on every update.
- The patient is asked only about what they do (whether they take it, how
  much), one card at a time, in plain words, always with "Not sure, ask my
  doctor" and a way to skip.
- Questions only the care team can answer (which dose is right, possible
  duplicates, directions worded differently) go straight to the staff
  page, never to the patient.
- The QR code and FHIR file keep unresolved disagreements apart from
  confirmed medicines, with both sides intact.
- With today's one connected source, the list looks and works as it does
  now, except for the two fixes under "Changes to today's behavior".

## Non-goals

- Connecting a second source. Medicare (its own plan), a second health
  system, and SMART Health Link import each come after this, as their own
  work. Here they are test fixtures only.
- Storing several connections. That comes with Medicare (connections
  design). This design says what the answers are keyed by so they move to a
  per-person store without change.
- Duplicates by drug class (two different statins), which needs RxClass.
- "Something else, let me type it" on a review card.
- Writing anything back to a health record.
- `MedicationDispense` reads, and the pharmacy label's directions.

## Anti-goals

- **Newest silently wins.** A date is evidence, never a tiebreaker.
- **Missing means stopped.** A medicine one source doesn't list is not
  stopped; only a status that says so counts.
- **A guess becomes a fact.** A match on name alone, or a dose worked out
  from a fill's quantity, never settles anything and is never shown to the
  patient as fact.
- **Nagging.** The QR code never waits for answers. No question appears
  twice unless what it was about changed.
- **One side lost.** No trimming of the QR code ever drops one side of a
  disagreement.
- **Two people merged.** Records whose name and birth date don't match are
  never combined.

## What exists today (found in the code)

- `js/meds.js` `dedupe()` merges records on `rx:<rxcui>` or
  `text:<name>` and shows the newest current one. Within one source that's
  fine. Across sources it would silently pick one dose.
- `groupByIngredient()` merges strengths of one drug within a source, and
  never merges two current ones. Across sources, Zoloft and sertraline
  (different codes, both current) would be two unlabeled cards.
- `js/claims.js` `attachFills()` matches fills to medicines (same RxCUI,
  else same ingredients) and moves a completed prescription that was filled
  since back to current (`completedButFilled`).
- `js/view.js` `arrangeList()` lays the patient's marks over the list
  without changing it: `data.stopped[key]` and `data.asNeeded[key]`. A
  mark has no tie to the records it was made on, so "Not taking" on
  `rx:123` also hides any later prescription of that drug.
- Patient data is stored per records patient
  (`vault.js` `savePatientData(storage, key, patientId, data)`).
- The QR Bundle (`js/share.js`) keeps meta only at Bundle level: warnings
  ride as Bundle tags in `https://burroclurse.github.io/BrownBag/tags`.
  `groupShareBundle()` sorts statements by `informationSource` and notes.
  It must fit in a version 40-M QR code, and codes are dropped first
  (levels 2, 1, 0).
- The sandbox records include hospital orders: one test patient
  (`tests/fixtures/2a89ee40-...-requests.json`) has 2 `inpatient`, 3
  `outpatient` and 43 `community` MedicationRequests. Both inpatient ones
  are `completed`, so they're already under Older. But `meds.js` doesn't
  read `category`, so an active hospital order from a hospital source
  would show as current.
- The Medicare plan (not built) has a same-person check (family name, first
  given name, birth date) and keeps each source's raw fills, recombining
  them on each update (`combineSources`). No same-person check exists in
  the code yet.
- `docs/LIMITS.md` #16: "joining two cards joins their marks. If the
  patient marked one copy Not taking to tidy the list, the one they take
  must not go with it."

## Approaches

- **A. Reconciliation core first, then Medicare on top of it (Claude's
  recommendation; Tyler agreed, 2026-11-25).** A pure module, tested with
  fixtures for all three kinds of source. Medicare's `combineSources`
  becomes "feed Medicare's fills into the core". The riskiest, newest part
  gets designed once, against every kind of source, before any is wired.
  The cost: Medicare fills reach the app a little later.
- B. Medicare first, as its plan stands, then reconciliation. Faster to
  Medicare fills, but `combineSources` gets built and then taken apart, and
  the core gets shaped around fills only.
- C. Buckets stored once and edited (agreed, conflicts, one source). Ruled
  out: every update would have to merge new records into stored buckets,
  which is how answers end up on the wrong medicine or quietly overwrite.

## How it works

### 1. Every source gives statements

Each source's reader turns its records into **statements**, one per record
(after `dedupe` and `groupByIngredient` within that source only, as
today):

```text
Statement {
  sourceId      "smart-sandbox", "clinic-b", "medicare", "shl-<hash>", "patient"
  sourceName    what the patient and staff see: "Valley Clinic"
  kind          order | statement | fill | patient | snapshot
  refreshes     true for signed-in sources; false for a snapshot
  recordRef     resource type and id, or for a fill its code and date
  concept       { rxcui, ingredients (from the ingredient map), name, form, strength }
  dose          words, plus coded amount when the record codes it
  schedule      words, plus coded repeat (frequency, period, unit) when coded
  status        current | not-current | unknown
  asOf          the record's own date (authoredOn, effective start, fill date,
                or a snapshot's own date, never the day it arrived)
  hospital      true for an inpatient-category request
}
```

The existing items (`makeItem` in `meds.js`, fills in `claims.js`,
additions) already hold nearly all of this. `recordRef`, `form` and
`hospital` are new.

Statuses become one of three words. A request `active` or `on-hold`, or a
statement `active` or `intended`, is current. `completed`, `stopped`,
`cancelled` and `not-taken` are not current. Anything else, including a
statement `unknown` with no end, is unknown (and, as today, stays on the
main list). A fill says nothing about status by itself: it is evidence of
pickup, with a date.

### 2. Same person first

Before a source's statements join, its patient is compared with the first
source's: the Medicare plan's rule (family name, first given name, birth
date; capitals, spaces, punctuation, accents and Jr./Sr./II/III/IV
ignored; birth date exact). A mismatch, or a source that doesn't say,
keeps that source out, and the core reports it so the screen can say so.
For a snapshot, the patient in its Bundle is compared the same way.

### 3. Matching: levels, and how sure each is

Statements from **different** sources join a **group** when they match.
Within one source, nothing changes: `dedupe` and `groupByIngredient` work as
today, so two current strengths in one record (metoprolol tartrate 25 mg
and metoprolol succinate 100 mg) stay two cards, and one source alone never
produces a verdict (Claude's call, from the builder check: it keeps today's
list exactly as it is with one source). The levels, strongest first:

1. **Same RxCUI.**
2. **Same product by name:** the plain name (claims.js `plainName`:
   lowercased, brand in brackets dropped) is the same, so
   "Sertraline 50 MG Oral Tablet [Zoloft]" joins "sertraline 50 MG Oral
   Tablet".
3. **Same ingredients and the same form** (ingredient map, and the form
   words after the strength in the RxNorm name, such as "Oral Tablet"),
   at any strength.
4. **Name only:** the drug's first word is the same (add-check.js
   `firstWord`), with no codes to confirm it.

Levels 1 to 3 form a group. Level 4 doesn't: the cards stay separate, and
the staff page gets a line "May be the same medicine as ...". So do two
products with the same ingredients in different forms (metformin tablet and
extended-release tablet are different forms in RxNorm names), and a
combination product beside one of its ingredients (lisinopril/HCTZ and
lisinopril): **possible duplicate**, staff only.

Offline, or when the ingredient lookup didn't answer, only levels 1, 2 and
4 are possible. The ingredient map is saved with the list (encrypted), as
`split.ingredientOf` already is, so a saved list keeps its matches.

A hospital order never joins a group and is never part of a disagreement.
It goes under Older prescriptions with "Hospital order" (Claude's call: it
can't be hidden, but it isn't a home medicine).

### 4. What each group's verdict is

Within a group, the core compares its current statements from records
(kinds order, statement, snapshot):

- **Same:** nothing below differs. One card, every source named.
- **Dose differs:** either of these (Claude's calls, from the builder
  check):
  - The strengths differ (`strengthOf` from the RxNorm name), unless both
    directions are fully coded (amount, frequency, period) and the daily
    amount is the same: 2 x 10 mg a day and 1 x 20 mg a day are the same.
    When the directions are words, different strengths still ask the
    patient: which bottle they have is theirs to say.
  - The strengths are the same, both amounts are coded, and they differ
    (1 tablet vs 2 tablets).
- **Schedule differs:** both schedules are coded and differ. A difference
  that involves a weekly or longer period (methotrexate weekly vs daily)
  is always this verdict, and the card says "how often" plainly.
- **Status differs:** one records source says current and another says not
  current, unless the not-current one is clearly older. An R4
  MedicationRequest has no stop date, so the not-current record's date is
  the latest of: the end of its period (`validityPeriod.end`,
  `effectivePeriod.end`), `meta.lastUpdated`, and its own date
  (`authoredOn`, effective start). When that date is before the current
  record's own date, it's history, as today: no question. Otherwise, or
  when either has no date, it's a question (Claude's call, from the
  builder check: a question when the order can't be known, since a missed
  stop is worse than one extra card).
  A fill doesn't settle it: a recent fill shows beside the choices as
  evidence ("Filled Oct 2026"), and the question is still asked.
- **Worded differently:** the strengths are the same and the directions
  don't match, but they aren't both coded. Staff only; both wordings
  shown.
- **One source:** only one source has it. Normal. Never a question.

A group can have more than one verdict. A source that failed to load or
held something back is named on the group ("Clinic B didn't load"), so a
"same" verdict is never vouched for by a source that wasn't there.

**Fills** (and Medicare's later) attach to a group as today
(`attachFills`): same RxCUI, then same ingredients, current first. They
never make a dose or schedule verdict. `completedButFilled` stays as it
is: a not-current prescription filled within a year and after it was
written shows as current with its "Marked completed in your records, but
filled ..." line. A fill's quantity divided by its days supply (60 tablets
for 30 days: about 2 a day) can go to staff as "Fill suggests about 2 a
day", never to the patient, never as a verdict. (Claude's call: not in v1;
the sandbox claims don't carry days supply.)

**The patient's own additions** match groups the same way, but never
create a verdict: add-check.js already asks the patient when they add one
that's already there.

### 5. Who is asked what

| Verdict | The patient | Staff page |
| --- | --- | --- |
| Same, one source | nothing | the medicine, every source named |
| Dose differs | "How much do you take?" | both, until answered |
| Schedule differs | "How often do you take it?" | both, until answered |
| Status differs | "Do you still take it?" | both, until answered |
| Worded differently | nothing | both wordings |
| Possible duplicate, may be the same | nothing | a line on each card |

A card with several verdicts asks one question per card, in the order
status, dose, schedule. "I don't take this anymore" ends it.

### 6. The review cards

**Before an answer** (and from build step 2 on, before the review cards
exist), a group with a patient question is **one card**, counted once in
"My medicines (N)" (Claude's call, from the builder check). It shows no
single dose. Instead:

```text
Lisinopril
Your records don't agree on how much you take.
  Valley Clinic, Mar 2026:  10 mg, once a day
  Mercy Health, Oct 2026:   20 mg, once a day
[ Check this ]          (from step 4 on)
```

On My medicines, under the Allergies box and above Medicines, when there's
anything to check:

```text
┌──────────────────────────────────────┐
│ Your records don't agree on 2 things │
│ [ Check them ]                       │
└──────────────────────────────────────┘
```

Then one card per screen:

```text
Lisinopril                                    1 of 2
Your records don't agree on how much you take.

How much do you take?
( ) 10 mg, once a day     Valley Clinic, Mar 2026
( ) 20 mg, once a day     Mercy Health, Oct 2026
( ) I don't take this anymore
( ) Not sure, ask my doctor

[ Save ]                      Do this later
```

```text
Atorvastatin                                  2 of 2
Your records don't agree on whether you still take it.

Do you still take it?
( ) Yes, I take it        Valley Clinic says current, Feb 2026
( ) No, I stopped         Mercy Health says stopped, Sep 2026
( ) Not sure, ask my doctor

[ Save ]                      Do this later
```

- Each card is a `fieldset` with the question as its `legend`; the
  choices are radio buttons with the source and date in the label, so a
  screen reader reads them together. Nothing is chosen at the start.
- "Do this later" closes the review; the box stays with the count. The
  QR code works the whole time.
- Choices come only from what the sources say, in the app's own words for
  doses and schedules (`formatDosage`), oldest first.
- Saved answers show on the medicine's card: "You said: 20 mg, once a
  day (Nov 25)", with "Change" reopening the card.
- Where the patient is in the review survives the 5-minute lock.
- No home screen change (Claude's call: home stays three buttons; the
  count lives on My medicines).

### 7. Answers, and when they're asked again

```text
Answer {
  groupId       stable: the group's ingredient key (rxcui of its ingredients
                from the ingredient map), else its lowest member key
  fingerprint   hash of the disagreeing sides
  sides         [{ sourceId, sourceName, asOf, dose, schedule, status }]
                as they were when answered (encrypted with the rest)
  choice        a side's sourceId | "not-taking" | "not-sure"
  answeredAt
}
```

(Claude's calls, from the builder check.) The **fingerprint** is a hash of
the group's disagreeing sides, sorted: each one's `sourceId`, dose words,
schedule words and status. It leaves out `recordRef` and dates, so a newer
copy of the same record saying the same thing never asks again. An answer
applies only while the fingerprint matches. When it changes (a changed
dose, a new source, a source that drops out), the question comes back, and
the card compares the saved `sides` with the new ones to say what changed:
"Mercy Health now says 40 mg". An answer is looked up by `groupId` and
applies only to that group; it never moves to another one.

Answers are saved with the patient's other data (`state.data.answers`),
in the same encrypted copy and the same backups. Because they're keyed by
fingerprint and not by records patient, they move to the per-person store
unchanged when several connections arrive.

"Not sure, ask my doctor" is an answer: it stops the card from asking
again, and the staff page says "Patient isn't sure".

### 8. Changes to today's behavior

Two, both with only one source connected:

1. **A Not taking mark no longer hides a newer prescription** (Claude's
   call, a safety fix). When the medicine has a current record dated after
   the mark, the card goes back on the main list with "You marked Not
   taking on Mar 3. Your records have a newer prescription, Oct 2." and
   the review asks "Do you still take it?". As needed marks are left as
   they are.
   - "Yes, I take it" deletes the mark (`data.stopped[key]`). "No" keeps
     the mark and saves an answer, so it isn't asked again for that
     prescription.
   - Until it's answered, the QR code carries it as a disagreement
     between the record and the patient's mark: the record's statement,
     and the patient's Not taking statement, tied by a `differs` tag.

**Marks in a group from several sources** (Claude's call, from the builder
check, following `docs/LIMITS.md` #16). Marks stay keyed by each member's
own key, as today, and a mark covers only the member it was made on. A
group goes under Not taking only when every current member is marked.
When some are marked and some aren't (the patient marked Clinic A's copy
Not taking, and Clinic B lists it current), that's a status question:
"You marked this Not taking on Mar 3. Mercy Health lists it current, Oct
2026." So joining cards never hides the one they take.
2. **Hospital orders go under Older prescriptions**, labelled "Hospital
   order". Today's sandbox ones are already completed, so in practice only
   the label is new until a hospital source is connected.

### 9. The QR code, See what's inside and the FHIR file

- **Same:** one `MedicationStatement`, as today, with a note naming every
  source ("From records: Valley Clinic, Mercy Health").
- **Not answered, or "Not sure":** each side stays its own
  `MedicationStatement` with its own source note and date. The Bundle gets
  one tag per group: `{ system: TAGS, code: "differs", display: "<entry
  numbers, space-separated>" }`, and each statement gets the note
  "Records disagree" (plus "Patient isn't sure" when that was the answer),
  so an older staff page still shows both, side by side by name. The
  prefix stays `v3.`: nothing goes missing on an older page.
- **Answered with one side:** that side's statement, with notes "Patient
  confirmed this, Nov 25" and "Other record: Valley Clinic, 10 mg once a
  day, Mar 2026". Its `informationSource` stays the record's, so the staff
  page doesn't file it under "Added by patient".
- **Answered "I don't take this anymore":** as a patient Not taking mark
  today (`stopped`, from the patient), with "Other record: ..." notes for
  each side.
- **Staff only lines** (worded differently, possible duplicate, may be the
  same, a source that didn't load) are notes on the cards they're about.
- **Trimming:** codes go first, as today (levels 2, 1, 0), then "Other
  record" notes shorten to the source and date. A disagreement's two
  statements are never trimmed away: the list is "too long for one QR
  code" before that happens.
- **Staff page** (`share-list.js`): a first part, "Records disagree: ask
  the patient", with each group's sides together; answered groups show the
  patient's answer first.
- **The FHIR file (IPS):** the same statements and notes. A `DetectedIssue`
  that points at both statements would be the standard way to say this
  (Claude's call: not in v1, it costs QR space; possible later for the file
  only).

### 10. Snapshots (SMART Health Links, IPS files) in the core

The import screen is later work, but the core handles snapshots now so
it doesn't need changing then:

- `kind: snapshot`, `refreshes: false`, `asOf` the Bundle's own
  `timestamp` (or the Composition's date), and each statement keeps the
  original source named in it.
- **Brown Bag's own exports** are recognized by the Bundle tags in the
  Brown Bag tag system. Their patient-added and patient-marked statements
  are dropped (they are already the patient's), so a re-import never
  duplicates them.
- A snapshot's current statement older than a refreshing source's record
  of the same group doesn't create a status verdict on date alone; it
  shows as "As of <date>, <source> listed this".

### 11. Test fixtures

In `tests/fixtures/reconcile/`, each made from the sandbox records with
changes, so the core is tested against every kind of source with only
the sandbox live:

- **Two clinics, same person:** lisinopril 10 mg vs 20 mg (dose differs);
  metformin the same in both (same); atorvastatin current in one, stopped
  later in the other (status differs); Zoloft vs sertraline 50 mg (same,
  level 2); methotrexate weekly vs daily (schedule differs); lisinopril/HCTZ
  vs lisinopril (possible duplicate); 2 x 10 mg vs 1 x 20 mg, both coded
  (same); free-text directions that differ (worded differently); a hospital
  IV order.
- **Someone else:** a source with a different birth date (kept out).
- **Insurance fills:** fills matching by code and by ingredient, a fill
  newer than a stopped record, a fill with no record.
- **A snapshot:** an IPS Bundle from another source, and one of Brown
  Bag's own QR Bundles with patient additions.
- **Answers:** an answer that still matches, and one whose group changed.

## Build order (Claude's call)

1. `js/reconcile.js` (no DOM): statements, same person, matching,
   verdicts, fingerprints. Fixtures and tests first.
2. Wire it into `loadMedicines` and `attachFills` with today's one
   source. Every existing test still passes, plus the two behavior changes
   in section 8.
3. The QR code, See what's inside, the staff page and the IPS file.
4. The review cards and saved answers.
5. README, `docs/LIMITS.md` #8, privacy page if it lists what's saved,
   `sw.js` cache bump, and both virtual phones per
   `docs/NEEDS-TESTING.md`.

Steps 1 to 3 can ship before 4: unanswered disagreements already reach
staff correctly.

## Left to the builder

- The hash for fingerprints (WebCrypto SHA-256 of a canonical JSON string is
  fine), and how `recordRef` is written (it's for staff notes and tests,
  not the fingerprint).
- Parsing the form words from RxNorm names, and which form words count as
  the same form.
- The exact wording of "Other record" notes, within the QR size.
- How `groupShareBundle` returns disagreement groups, and how an older
  saved list (with no statements) opens: as today, rebuilt on the next
  update.
- Where `dedupe`'s cross-source half ends up once sources are separate.
