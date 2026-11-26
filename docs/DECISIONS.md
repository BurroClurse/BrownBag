# Decisions

Who decided what while building "When sources disagree" (PRs #13 and #14,
2026-11-25 to 2026-11-26). **Tyler's decisions** are his answers to questions,
asked one at a time. **Calls Claude made** are the ones Claude decided without
asking, each with what it costs if it's wrong; Tyler can overturn any of them.

The design-phase decisions are in the design itself, marked "(Tyler,
2026-11-25)" or "Claude's call" (every Claude's call there was confirmed by
Tyler one at a time): [`superpowers/specs/2026-11-25-medication-reconciliation-design.md`](superpowers/specs/2026-11-25-medication-reconciliation-design.md).
New decisions go at the end of each list, with the date.

## Tyler's decisions

**Scope and approach (design, 2026-11-25)**
- Keep every source's version; nothing is overwritten. The patient is asked
  only about what they actually take, one card at a time, with "Not sure, ask
  my doctor"; they're never asked to act like a pharmacist. Staff see every side.
- Sources: health records, insurance fills (Medicare Blue Button later), other
  health systems and incoming SMART Health Links. US sources only for now.
- The QR code stays as it is; a SMART Health Link is a later second code with
  a flip, and needs a server (LIMITS #19). The README says Brown Bag is built
  for server deployment when that comes.
- The README always says what Brown Bag does now and what's planned, split
  into front end and back end. Calls are asked one at a time before approval.
  Tyler is told whenever a check needs his Mac. (All in `CLAUDE.md`.)
- Built with subagents, task by task. Tasks 10–11 went on a second branch with
  their own PR (#14).

**Testing**
- Test heavily with messy real-world data; sandbox test patients may be
  created (the sandbox wipes them nightly): Riley Reconcile and Jordan Partial
  (Task 6b). Scale testing and a Colab testing aid (LIMITS #23). Machine
  learning later for scanning pill bottles and reading free-text directions
  (LIMITS #4, #24). A real second health system is worth adding (LIMITS #22).
- Never real patient records in Colab; Anpheros used for ideas only.

**Real-world records (Tasks 6c and 6d)**
- The most specific product code wins; ingredient-only codes never join by code.
- Release type and salt are part of the form; an unreadable form is never "same".
- Names read as real ones: official, then usual, "LAST, FIRST", no Synthea
  digits, any alphabet, the whole compound surname, and Jr/Sr must agree.
- Birth dates as written; placeholder dates (1900-01-01 and the like) count
  as no birth date. People kept apart are described as "don't match".
- Both allergy gaps fixed. Built before Task 7.

**Wording and the QR code (Tasks 7–9)**
- On a status question each version says "Records say: current" or "Records
  say: stopped"; the staff line names every part used.
- "Records disagree: ask the patient (N)"; each version labelled
  "<Source>, <Mon YYYY>"; "Patient says not taking"; the fill hint labelled
  "From the fill".
- "No medicines" is said in the FHIR file's text, with no coded entry;
  "Records disagree on 1 medicine." in the singular.

**Review cards (Task 10)**
- While "How much do you take?" is open, the card's name has no one side's
  strength. "You said" repeats the words the patient picked. Each card with an
  open question gets "Check this". "Saved." and "Change: <name>" kept.

**After the first Mac phone pass and the iPhone QR check (Tasks 10b–10d)**
- Fix the staff code box at large text and Back after signing out now; log the
  sandbox's Deny page and text past 200% (LIMITS #27, #28).
- Fix the doubled "Choose a test patient"; Back while signed in returns to the
  connections screen; the code box needing iOS 16 or Chrome 105 is accepted.
- The staff page clears the list from its address right away. The tab keeps
  only the locked list until it's closed (a reload shows the code box again,
  with no time limit); a tab reopened from recently closed tabs may have it
  again, still locked. Back to an earlier patient shows that patient's code
  box; a duplicated tab and a browser that won't keep it are fine as built.
- Birth dates read "Born May 8, 1974" (or "Born May 1974", "Born 1974").
- "Last filled over a year ago." when the newest fill is over a calendar year
  before the day the list is opened; fills only; on screen only, never in the
  QR code or the FHIR file; the yellow note style.
- Back from a failed sign-in start goes to the picker; Forward or a reload
  there shows "Couldn't start sign-in", never signing in by itself.
- The privacy page says what the staff phone keeps.

**Docs (Task 11)**
- The README condensed for reviewers and instructors, about 150 lines, with
  2–3 screenshots of a made-up patient (Riley is fine). The detail moved, not
  lost, to `HOW-IT-WORKS.md`, `FILES.md` and `SANDBOXES.md`; notices to
  `NOTICE.md`. "Records as real sources write them" left "What's planned" as done.
- The patient's card names every source when they agree; a card whose records
  disagree keeps naming the record its facts come from. LIMITS #17 is done,
  with a note about the allergy row. Only LICENSE's jsDelivr sentence fixed.
  The Medicare line says the function "only handles Medicare's sign-in".

**Final review (2026-11-26)**
- The staff note says "Other record (stopped)". Answers made offline are listed
  on the QR code as "<Medicine>: <words picked>". A card stopped by an answer,
  including a confirmed Not taking tap, says only "You said"; when the records
  disagreed on the amount it shows no single amount. The staff page, QR code
  and FHIR file keep the shown record's dose, with every version in the notes.
  "Check them" is fine on a partial list.
- Merge PR #14 before the Mac phone pass; the pass is on Tyler's to-do.
- The README's pictures are home, the QR code screen and the staff page, in
  that order (2026-11-26; the QR code screen replaced My medicines).
- The Face ID unlock screen is laid out like home: the bag fills the empty
  space and the buttons sit at the bottom. The PIN screen stays as it is,
  since its keyboard covers the bottom (2026-11-26).
- The bag sits in the same place at the same size on the unlock screen and
  home, so unlocking looks like home filling in (2026-11-26).

## Calls Claude made

| # | What Claude decided | What it costs if wrong |
|---|---|---|
| R1 | Shared wording helpers: a version as "dose, how often", dates as "Oct 2026" and "Mar 3" | A rename across several files |
| R2 | The saved shape of an answer to "you marked Not taking, but there's a newer prescription" | A small data change |
| R3 | Phone checks run in headless Chromium in the cloud; the virtual phones and TalkBack wait for the Mac | Problems found later on real phones |
| R4 | The QR code carries "patient marked Not taking" beside the record that says current, until answered | Small |
| R5 | Task 8 was allowed to change the staff page's code | None |
| R6 | Branches: PR #13 first, then Tasks 10–11 as a new PR | None |
| R7 | Strengths like "0.1 MG/24HR" on patches read correctly | Tiny |
| R8 | Offline, coded records with no ingredient lookup can match by name, with a staff note | A staff note where there'd be none |
| R9 | Stricter same-person check: Jr./Sr. only at the end of a name, full birth dates on both sides | Tiny; it only prevents merging two people |
| R10 | A version leads with its strength ("10 MG, Take 1 tablet daily") so two never read the same | Wording |
| R11 | The home test clinic is built on Loria Jenkins's real sandbox medicines | One more test file |
| R12 | Every strength in a name is compared, not only the first | None |
| R13 | Monthly, every other week and similar count as "weekly or longer" | None |
| R14 | A source that held records back is named on every grouped card | Wording |
| R15 | Reading a shared list lives in its own file, `js/snapshot.js` | One file |
| R16 | A shared list that disagrees with a newer record on whether a medicine stopped is asked about, unless the list is clearly older | One extra question in a rare case |
| R17–18 | Shared Brown Bag lists are recognised by their tag; a test pins it | A re-imported list could repeat entries |
| R19 | A version with no dose and no schedule shows its strength, else "See the record" | One condition |
| R20 | A missing offline cache file fixed, with two small things that could mislead | None |
| R22–23 | On a "still taking?" question each version ends "current" or "stopped"; the question sits under the name; an answered card takes the chosen version's dose and name | Layout and wording |
| R24 | A stopped record is dated by its end date; a named source that held back says so; the home server answers a bad address with an error page | Small |
| R25 | Offline, a code counts as the product only when its name reads like one (strength and form) | Some offline pairs don't join |
| R26 | RxNorm codes that span strengths (SCDF, SCDG, SBDF, SBDG, most SCDC) count as ingredient-level | Matching edge cases |
| R27 | A missing or shortened middle name never keeps two records apart, and an initial matches, but "Mary Ann" and "Mary Beth" stay apart (twins) | Some missed matches |
| R28–29 | How "no known allergies" records read; Junior and Senior count, degrees don't; a "none" code with a reaction becomes the unnamed allergy | Allergy wording |
| R30 | Each version on the staff page carries "Record date: <YYYY-MM>" | Wording, QR size |
| R31 | The fill hint is the first thing dropped when the QR code is too full | Staff lose an optional hint on big lists |
| R32 | `DetectedIssue` left out of the FHIR file (the HL7 validator rejected it) | Other systems don't get it as data (LIMITS #26) |
| R33 | A combination's plain name names every ingredient ("Hydrochlorothiazide / Lisinopril") | Longer names |
| R40 | Partial list (Tyler: "whatever's best"): home hides its line; My medicines keeps the review box without a number | One wording change |
| R41 | To line the bag up with home: home's bag is now sized by a shared rule and no longer stretches to fill all the space (any space left over sits under it), and room is kept for "Your records don't agree" even when it isn't there | Home's bag is a little smaller (about 60 px on an iPhone 15) |

R21 was Tyler's decision (the sandbox test patients), so it's in his list.
