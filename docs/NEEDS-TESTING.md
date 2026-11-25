# Needs testing

Changes waiting for a phone check, tested together in one pass instead of
after every change (Tyler, 2026-11-23). Claude adds a line here with each
change, and moves it to "Tested" with the date when the pass is done.

## How a test pass works

1. **Android emulator** (`Peregrine_Pixel9_API36`, Chrome): Claude drives it
   on the Mac. TalkBack can be switched on.
2. **iPhone 15 simulator** (Safari): Claude drives it with Apple's built-in
   Safari driver. No VoiceOver or Face ID in the simulator.
3. **Claude in Chrome** when a virtual phone won't run (Tyler, 2026-11-23). It
   covers Chrome's behavior, not the Android Back button, touch or TalkBack.
4. **Tyler's iPhone**: VoiceOver, Face ID, the Home Screen app, and anything
   the simulators can't do. Listed under "On a real iPhone".

Test patient: Loria Jenkins (`e7de504a-311d-49be-b2bc-566a328bcc72`), a
built-in sandbox patient, or Chantell Bartell (claims and an allergy). The
README has a link that signs in as each. The demo patient Avery Brownbag is wiped by the
sandbox every night.

## Test right away, not in the batch

Claude runs both simulators straight after a change, without waiting for a
pass, when it touches:

- sign-in, the lock (PIN, Face ID) or the encrypted saved list;
- the QR code or the staff page (what a person checking medicines sees);
- anything that could show the wrong medicines, lose a patient's list, or
  mix two people;
- a layout change likely to look different in Safari (screen height, the
  pick lists, the Home Screen app).

## Waiting for the next pass

**The staff page with a disagreement, and the fill hint** (2026-11-25, Task 8;
test right away: it changes what the person checking medicines sees).
Checked only in headless Chromium (iPhone 15 size, PIN lock, the live
sandbox, self-signed certificate); screenshots `task-8-riley-*.png` in
`.superpowers/sdd/2026-11-25-medication-reconciliation/`. Run
`node tools/reconcile-patients.mjs` first (it now gives Riley's metformin fill
60 tablets for 30 days), then `BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`,
then `git checkout -- tests/fixtures/reconcile/clinics` when done. Sign in as
Riley. On both virtual phones:

- The staff page (scan the QR code, type the 6 digits), Medicines (9): the
  first part is "Records disagree: ask the patient (3)", one card each for
  atorvastatin, lisinopril and methotrexate. Each card has two versions, each
  under its source and month ("SMART sandbox, Jan 2026", "Valley Clinic (test
  records), Oct 2026"), with a line between them. Atorvastatin's say "Records
  say: current" and "Records say: stopped". Then From records (6).
- On From records, metformin hydrochloride 500 MG says "Fill suggests: about 2
  a day (60 for 30 days)". My medicines never says it.
- See what's inside says the same, in the same order.
- Answer one card "Not sure, ask my doctor", make a new code: that card on
  the staff page starts with "Patient isn't sure".
- The cards wrap well on the iPhone SE size, and VoiceOver and TalkBack read
  each version's source and month before its name.

**The QR code with a disagreement** (2026-11-25, Task 7; test right away: it
changes what the person checking medicines sees). Checked only in headless
Chromium (iPhone 15 size, PIN lock, the live sandbox, self-signed
certificate); screenshots `task-7-riley-*.png` in
`.superpowers/sdd/2026-11-25-medication-reconciliation/`. Run
`node tools/reconcile-patients.mjs` first, then
`BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`, then
`git checkout -- tests/fixtures/reconcile/clinics` when done. Sign in as Riley
(link below). On both virtual phones:

- Show my QR code: it shows (not "too long"), and scans with the phone's
  camera into `share.html`.
- See what's inside, Medicines (9): "Records disagree: ask the patient" comes
  first, with two rows each for atorvastatin, lisinopril (10 MG from SMART
  sandbox, 20 MG from Valley Clinic (test records)) and methotrexate ("once a
  week" from SMART sandbox, "once a day" from Valley Clinic), each saying
  "Records disagree", its own source and its own "Record date". Then From records (6); sertraline's
  source is "SMART sandbox, Valley Clinic (test records)".
- The staff page, opened from the scan with the 6 digits, shows the same.
  The rows wrap well on the iPhone SE size, and VoiceOver and TalkBack read
  each row's source with it.
- Atorvastatin's two rows say "Records say: current" and "Records say:
  stopped". (Task 8 draws the part as one card per medicine, each version
  under its source and month in place of the "Records disagree" and "Record
  date" rows; check it as its entry says.)

**Allergies, names and birth dates as real sources write them** (2026-11-25,
Task 6d). Checked only in headless Chromium (iPhone 15 size, PIN lock, the live
sandbox, self-signed certificate). Run `node tools/reconcile-patients.mjs`
first, then `BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`, then
`git checkout -- tests/fixtures/reconcile/clinics` when done. On both virtual
phones:

- Loria Jenkins reads as before: My medicines (6), metoprolol's dose
  disagreement with Valley Clinic (test records), no allergies, "I have no
  known allergies" offered.
- Loria again at `/?demo=someone-else`, unlocked: "Records from Valley Clinic
  (test records) don't match your name and birth date, so they aren't on your
  list." above the cards, and My medicines (4). The line wraps well on the
  iPhone SE size, and VoiceOver and TalkBack read it whole.
- Chantell Bartell: Allergies (1), closed "Mold, 1 unnamed"; open, Mold and
  the Unnamed allergy row ("Environment (same day as Mold)"). On the QR code's
  See what's inside: Mold, and "Records also have an unnamed allergy:
  environment, recorded Feb 28, 1979 (same day as Mold). Ask the patient."
- Nothing else on screen changed: the rest is in the tests
  (`tests/messy-allergies.test.mjs`, `tests/messy-people.test.mjs`).

**Medicines as real sources write them** (2026-11-25, Task 6c). Checked only
in headless Chromium (iPhone 15 size, PIN lock, the live sandbox, self-signed
certificate). Run `node tools/reconcile-patients.mjs` first, then
`BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`, then
`git checkout -- tests/fixtures/reconcile/clinics` when done. On both virtual
phones:

- Riley Reconcile reads the same as before this change: My medicines (9), 1
  older. The medicines now load as whole pages, so check every card is still
  there.
- Loria Jenkins with the test clinic: My medicines (6), 9 older. Her own
  "Simvistatin 10 MG" and "Lasix 40mg" are coded only by strength, so they no
  longer join the clinic's (now "simvastatin 10 MG Oral Tablet", stopped,
  under Older, and "furosemide 40 MG Oral Tablet"): no simvastatin question,
  and Lasix and furosemide are two cards. Metoprolol still asks how much.
- The "no information" line: save a clinic file for Loria at
  `tests/fixtures/reconcile/clinics/e7de504a-311d-49be-b2bc-566a328bcc72.json`
  holding only the `noInfo` statement from
  `tests/fixtures/messy/medicines/ips-none.json` (delete it afterwards). My
  medicines (4) says "Valley Clinic (test records) has no information about
  your medicines." above the cards, and See what's inside says "Valley Clinic
  (test records): no information about medicines" under Medicines (4). Check
  the line wraps well on the iPhone SE size, and VoiceOver and TalkBack read
  it in place.

**Riley and Jordan, test patients whose records disagree** (2026-11-25, step
2 of when sources disagree). Checked only in headless Chromium (iPhone 15
size, PIN lock, the live sandbox, self-signed certificate). Run
`node tools/reconcile-patients.mjs` first (the sandbox deletes them every
night), then start the home server with
`BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`. They aren't on Brown Bag's
list of test patients, so after setting up the lock, open the home server's
address with one of these added, which signs in as that patient with no
approval page:

- Riley: `/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImJyb3duYmFnLXJlY29uLXJpbGV5IiwiIiwiQVVUTyIsMSwxLDAsIiIsIiIsIiIsIiIsIiIsIiIsIiIsMCwxLCIiXQ%2Ffhir`
- Jordan: `/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImJyb3duYmFnLXJlY29uLWpvcmRhbiIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir`

On both virtual phones:

- Riley Reconcile: My medicines (9). Lisinopril 20 MG says "Your records
  don't agree on how much you take." with "SMART sandbox" 10 MG and "Valley
  Clinic (test records)" 20 MG sides. Methotrexate says "…how often you take
  it." with "once a week" against "once a day". Atorvastatin says "…whether
  you still take it." with sides ending ", current" and ", stopped".
  Levothyroxine says "Marked stopped in your records, but filled" and a date
  last month. Sertraline is one card (Zoloft and generic agree). Both
  metformins, the lisinopril with hydrochlorothiazide, and amlodipine (Valley
  Clinic only) are their own cards. Under Older prescriptions (1), the
  ondansetron IV says "Hospital order".
- Jordan Partial: "Some records didn't load." on Home and My medicines with
  no count (intended: Home doesn't say which source). On My medicines,
  "Valley Clinic (test records) didn't send some of your medicines." (the
  sandbox sent everything, so there's no "Your health system…" line).
  Simvastatin and metformin each say "…whether you still take it.";
  simvastatin's clinic side is dated 2026 (the year it stopped, by year only)
  and comes after the sandbox's Dec 2025 side, metformin's has no date.
  Amlodipine is one card.
- The long side labels wrap well on the iPhone SE size, and VoiceOver and
  TalkBack read each side's source with its dose.

**Two sources on one list, with the home server's test clinic** (2026-11-25,
step 2 of when sources disagree). Checked only in headless Chromium (iPhone
15 size, PIN lock, Loria Jenkins on the live sandbox, self-signed
certificate). Needs the home server started with
`BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`. On both virtual phones,
signed in as Loria Jenkins:

- My medicines (6): metoprolol shows "Your records don't agree on how much
  you take." under its name, above both sides, "SMART sandbox, Aug 1992:
  100 MG, 1, once a day" and "Valley Clinic (test records), Oct 2026:
  100 MG, 2, once a day". Since Task 6c, Simvistatin and Lasix no longer
  join the clinic's (see "Medicines as real sources write them" above), so
  it's My medicines (6); lisinopril (Valley Clinic only) is there.
- Open the app again at `/?demo=someone-else` and unlock: after the update,
  "Records from Valley Clinic (test records) don't match your name and birth
  date, so they aren't on your list." (worded so since Task 6d) and My
  medicines (4).
- Started without the variable: My medicines (4), the same list as before
  this change, with no notice.
- The long side labels wrap well on the iPhone SE size, and VoiceOver and
  TalkBack read each side's source with its dose.

**Marks and a newer prescription** (2026-11-25, step 1 of when sources disagree).
Checked by tests only; nothing new is drawn yet. On a virtual phone with the
sandbox: mark a medicine Not taking, then Undo, and As needed, then Undo, as
before. A medicine marked Not taking before a newer prescription of it shows on
My medicines again, not under Not taking. Marking it Not taking again moves it
there. A backup made before this change still restores.

**Lock first, then the connections screen** (2026-11-25, design
`docs/superpowers/specs/2026-11-25-connections-design.md`). Touches sign-in
and the lock, so it's a test-right-away change, but the virtual phones run on
Tyler's Mac and this was built in a cloud session. Checked only in headless
Chromium with a PIN and Chantell Bartell on the live sandbox: first run goes
lock, then Connect your health records; Connect, the test patients, Back
(unlock, back on the screen); a full sign-in comes back to the screen with
Connected and Done; Done goes home; reopening goes home with the update
check. Still to check on both virtual phones and Tyler's iPhone:

- Face ID set-up first, then the screen; Face ID again after the sandbox.
- The Home Screen app: the sandbox sign-in comes back into the app, not
  Safari, and lands on the connections screen.
- Home's "Sign in" note (expired pass) comes back home, not to the screen.
- More options, Health records, Sign in again: comes back to Health records,
  and Done goes home.
- Cancel at the sandbox's approval page: back on the screen with "Sign-in
  didn't finish. Try again."
- Sign out, then Sign in: unlock, then the screen, with no saved list shown.
- The README's test-patient links on a phone with no lock: lock set-up, then
  the screen.

**The "?" pills** (2026-11-24): passed in Chrome and on the virtual iPhone. Not yet on the
Android emulator, nor with high contrast colors on.

**The folded Allergies box and the severe mark** (2026-11-24): passed in Chrome and on the
virtual iPhone. Not yet on the Android emulator. A nurse or pharmacist has yet to check
which reactions are marked severe.

**Remove on the unnamed allergy** (2026-11-24): passed in Chrome and on the virtual
iPhone, including See what's inside. Not yet on the Android emulator.

**As needed, Not taking, the staff code box and the "?" headings** (PR #3,
merged and live 2026-11-24). Checked only in headless Chromium (sandbox
sign-in, PIN, Loria Jenkins), not yet on a virtual phone or Tyler's iPhone.
The staff page changed, so it goes first:

- Staff page: the short "Patient's 6-digit code" box, big digits that fit
  at the largest text size, the full-width Open button; no "Your care team
  confirms it" note on it or on See what's inside (the two match; Tyler,
  2026-11-24); the "Patient takes only as needed" and "Patient says not
  taking" groups; Medicines (N) on the staff page equals My medicines (N)
  on home, As needed included.
- A QR code made before this change still opens on the staff page.
- My medicines: "As needed" and "Not taking" side by side on each card,
  stacking at the largest text size; the As needed part and its Undo;
  Not taking on an As needed medicine; As needed on a "Filled, not in your
  records" medicine, and its Undo going back there.
- The "?" beside As needed, Added by me, Filled, not in your records, and Not
  taking: VoiceOver and TalkBack read the heading, then "About
  …, collapsed"; the explanation opens under the heading.
- The "… is under Not taking" panel when adding a medicine marked Not
  taking, and its "I'm taking it again" button.
- With no signal: mark one As needed, then open the QR code. The "isn't
  fully up to date" alert says "Marked … As needed".
- A backup made before this change still restores (it has no As needed
  marks), and one made after it brings the As needed marks back.
- See what's inside on Android: the phone's own Back button, TalkBack, and
  whether a camera reads the slightly smaller code on a short screen.
- The sign-in list on Android: the phone's own Back button and TalkBack. Claude
  in Chrome stood in for the emulator (the Mac's disk was full).

## Not done yet

Decided for later, so nothing to test until they're picked up:

- A logo on the QR code: left as it is (Tyler, 2026-11-24). A logo inside
  the code made these dense codes fail far more often in a simulated
  camera test, even at error-correction level H. If it comes back, try the
  bag beside the code instead, and check it fits short iPhone screens.
- Epic and Aetna: later; Medicare: being designed. See
  [`SANDBOXES.md`](SANDBOXES.md).

## On a real iPhone (Tyler)

VoiceOver was checked 2026-11-24 and works. Tyler isn't doing more of it.

- Save as FHIR file on the second phone: the real share sheet, only the .json file,
  and the popup starting on Cancel.
- Face ID unlock after the content security policy (the simulators have no Face ID).
- Airplane mode off with a saved list open: signed in, it updates by itself; signed
  out, "Sign in again to update it." The virtual phones used a stand-in signal.

## Tested

**The status bar strip** is wheat while the paper ball falls: passed on Tyler's iPhone
2026-11-24.

- 2026-11-23, Android emulator and iPhone simulator, live site, Loria
  Jenkins: sign-in and PIN lock; home; My medicines; How much and How often
  lists; the check panel (both strengths shown, heading focused, fields
  locked; TalkBack focus on the heading); "Add it anyway" on a stopped
  medicine; the QR code; the logo with no box. Found and fixed: the logo's
  color profile made a box on Android; Close covered "Tap to show the code"
  in iPhone Safari.
- 2026-11-23, libraries in the repo: the test browser (sign-in, add form,
  QR, offline open with no signal), then both virtual phones on the live
  site (Android Chrome and iPhone Safari: sign-in, home, add form, check
  panel, QR; no CDN requests). Passed.
- 2026-11-23, Tyler's iPhone: "Tap to show the code" sits clear of Close;
  Face ID unlock from the Home Screen icon works.
- 2026-11-23, claims fixes: the test browser with made-up claims (canceled,
  preauthorized, undated, stopped but filled, brand and generic, stays
  stopped), then both virtual phones on the live site with Chantell Bartell
  (fills on the cards, no "undefined", QR code fits). Passed.
- 2026-11-23, screen and leftover fixes: both virtual phones on the live site
  with Chantell Bartell (half-typed addition through Done and Back, the
  "isn't saved yet" line fits home, Home Screen steps back to More options,
  blank tap on the QR screen, vitamins, the Undo row). Passed. Undo on a
  "Filled, not in your records" medicine only in the test browser: no
  built-in patient has one. Scripts that tap through code must mark it as a
  real tap on Android, or Chrome's Back skips Brown Bag's steps.
- 2026-11-23, the offline warning kept after Brown Bag closes: the test
  browser (closed and reopened with no signal), then both virtual phones on
  the live site (saved data, backup and restore). Passed. One Android run
  missed a Back press on the Home Screen steps; the same step then worked 7
  of 7 times, so it's treated as a lost key press. Watch it next time.
- 2026-11-23, allergies, on the live site with Chantell Bartell: both virtual
  phones (the records' allergy and the note, add, reaction, QR code, staff
  page), after both passed on unpublished code. Android first stuck on
  "Loading" on a slow start; fixed the same day, then passed. Repeat runs on
  Android find the earlier run's allergies still saved, as they should.
- 2026-11-23, the ten allergy leftovers: the test browser, then both virtual
  phones on the live site (allergies as before, the message tied to its
  field, a half-typed allergy surviving another form). Passed.
- 2026-11-23, Tyler's iPhone: allergies, opened as Chantell from the README
  link; VoiceOver on the Allergies section and on the "… is already on your
  list" panel. Works.
- 2026-11-23, sign out for everyone and the allergy standards: the test
  browser, then both virtual phones on the live site (two people signed out,
  "You're signed out", the saved list behind the lock, allergies, the QR
  code, the staff page). Passed. The duplicate panel was checked on Loria's
  metoprolol, since Avery is gone.
- 2026-11-23, Tyler's iPhone: Sign out shows "You're signed out" with Sign in
  and Open my saved list. Works.
- 2026-11-23, the sign-in list, before publishing: the test browser (with and
  without its Back memory), the iPhone simulator, and Claude in Chrome with
  real clicks (the list, the grey names, the sandbox and Back, the Chantell
  link, PIN, Sign out). Passed.
- 2026-11-23, see what's inside and the two blocks, before publishing: the test
  browser (axe, 200% text, short screens, a list that didn't load, a code that
  won't open, Forward and Back), the iPhone simulator, and Claude in Chrome with
  real clicks. Passed. Found and fixed: the QR screen scrolled in iPhone Safari.
- 2026-11-23, the dates (Records last updated, QR code made), before publishing:
  the test browser (fresh, saved copy, some not loaded, older code, widths 320 to
  1440) and the iPhone simulator. Passed. Android only as Chrome on the Mac.
- 2026-11-23, the note when insurance fills don't load, before publishing: the
  test browser and the iPhone simulator. Passed.
- 2026-11-23, what didn't load and the quiet log, on unpublished code with a
  made-up health system: the test browser (first use, unlock, offline, the
  staff page, each failure, missing files, 320 to 1440 wide, 200 percent
  text), then both virtual phones (sign-in, home, My medicines, the QR code,
  See what's inside, the staff page). Passed. Run again after it was combined
  with the dates and the fills note: passed. Published the same
  day. On the live site only the first screen was checked.
- 2026-11-23, no number when every record has no medicine name, before
  publishing: the test browser, then both virtual phones (home, My medicines,
  See what's inside, the staff page). Passed.
- 2026-11-23, the labelled medicine cards, before publishing: the test browser
  (320 to 1440 wide, 200 percent text, every failure), then both virtual phones
  (My medicines, See what's inside, the staff page). Passed.
- 2026-11-23, See what's inside as short text, before publishing: the test
  browser and both virtual phones. Passed.
- 2026-11-23, "+ Add a medicine" at the top of the list, before publishing: the
  test browser (320 to 1440 wide, sideways, 200 percent text, focus, Cancel, a
  medicine added) and both virtual phones. Passed.
- 2026-11-23, Tyler's iPhone: "+ Add a medicine" stays at the top while
  scrolling, and See what's inside as short text. Works.
- 2026-11-23, the short name on home and Sort, before publishing: the test
  browser and both virtual phones. Passed.
- 2026-11-23, Edit on added medicines, the QR screen's new order, and "Meds last
  updated", before publishing: the test browser (320 to 1440 wide, 200 percent
  text, duplicates, half-typed edits, no signal) and both virtual phones. Passed.
- 2026-11-23, Where my records come from and the shorter sign-in list, before
  publishing: the test browser (320 to 1440 wide, 200 percent text, no signal,
  records failing, an ended pass, Back) and both virtual phones. Passed. One
  Android run right after a cold start missed the insurance fills; the next
  three showed them. Cause not proven; watch it next time.
- 2026-11-23, "Allergies last updated" always shown, before publishing: the test
  browser and both virtual phones (See what's inside, the staff page). Passed.
- 2026-11-23, More options in groups and the centered sign-in title, before
  publishing: the test browser (320 to 1440 wide, 200 percent text, backup,
  Restore, Sign out) and both virtual phones. Passed.
- 2026-11-23, the backup steps on Start over, the bigger text on More options and
  the bigger Show my QR code button: the test browser and both virtual phones.
  Passed. Start over with a PIN only; Face ID wording is checked by a test.
- 2026-11-23, the "Erase everything?" popup and home's raised buttons: the test
  browser (Escape, Cancel, a tap outside, erasing, 320 to 1440 wide, 200 percent
  text) and both virtual phones (the popup and Cancel; home fits). Passed.
- 2026-11-23, sealed backups, the backup password and one file when saving: the
  test browser (PIN and a virtual passkey; save, restore in the app, on the lock
  screen and on the sign-in screen, Cancel, Back, wrong password, an edited file;
  320 to 1440 wide, 200 percent text), then both virtual phones (make, save,
  wrong password, restore; the share sheet replaced by a stand-in). Passed.
- 2026-11-24, Open my saved list only with no signal, before publishing: the test
  browser (signal going and coming back, a refused sign-in, signed in again, 320
  to 1440 wide, 200 percent text) and both virtual phones. Passed. On the phones
  the lost signal was a stand-in, not airplane mode.
- 2026-11-24, the Privacy page, No known allergies on My medicines and the staff
  page: the test browser (320 to 1440 wide, 200 percent text, no signal, records
  failing) and both virtual phones. Passed. Back from Privacy goes to More options
  on the iPhone and to the lock on Android. The sign-in list's blank end was
  trimmed so it fits iPhone Safari.
- 2026-11-24, several directions, as needed for something, unclear timing and "On
  hold", before publishing: the test browser (My medicines, See what's inside, 320
  to 1440 wide, 200 percent text) and both virtual phones (My medicines, the staff
  page). Passed. On the iPhone the two directions were checked by eye: Safari
  reports line breaks differently from the check.
- 2026-11-24, codes in the QR code and Save as FHIR file, before publishing: HL7's
  validator (0 errors on four made-up summaries, IPS 2.0.1), a fresh review, the
  test browser (320 to 1440 wide, 200 percent text, saved, cancelled, failed,
  downloaded, incomplete, a made-up link; the QR code read back) and both virtual
  phones (the popup, the file, the QR screen). Passed. The share sheet was a
  stand-in.
- 2026-11-24, the list of test patients at sign-in, before publishing: the test
  browser (320 to 1440 wide, 200 percent text) and both virtual phones (the list,
  scrolling, Back, and choosing Delbert Jaskolski as far as the real sandbox's
  approval page and back). Passed. Approve was not pressed there.
- 2026-11-24, shorter allergy reactions and Save as FHIR file under See what's
  inside, before publishing: the test browser (320 to 1440 wide, 200 percent text)
  and both virtual phones (See what's inside, the popup, the saved file, the staff
  page). Passed. The share sheet was a stand-in.
- 2026-11-24, the space around buttons, measured on nearly every screen in the test
  browser (320 and 393 wide, 150 percent text). Two notes sat too close, under Save
  as FHIR file and under the medicine name box. Both fixed. Tyler's iPhone: the
  shorter reactions, the saved file, signed out with no signal, and VoiceOver work.
- 2026-11-24, the signal coming back with a saved list open, before publishing: the
  test browser and both virtual phones (signed in, signed out, a half-typed
  medicine, the password popup, the QR screen, More options, a server that fails).
  Passed. Tyler's iPhone: Start over from the Face ID lock screen reads right.
- 2026-11-24, the content security policy and the saved list after a sign-in that
  couldn't start, before publishing: the test browser and both virtual phones, with
  the real sandbox (Chantell Bartell, Bret Hayes) and RxNav: sign-in, fills, name
  search, update with the pass, QR code, the staff page, the saved file, backups.
  Other servers, inline scripts and eval were blocked. Passed.
- 2026-11-24, As needed from records and "I'm taking this", before publishing: the
  test browser and both virtual phones (the As needed part, Not taking and back, the
  popup, the form, interrupted and edited, See what's inside, the file). Passed.
  Staff page grouping by tests.
- 2026-11-24, what an unnamed allergy does say, before publishing: the test browser
  and both virtual phones with the real sandbox (Chantell Bartell: My medicines, See
  what's inside, the staff page with made-up allergies). Passed.
- 2026-11-24, the brown bands on My medicines and the reaction line, before publishing:
  the test browser (320 to 1440 wide, 200 percent text) and both virtual phones. Passed.
- 2026-11-24, the folder tabs on My medicines (in place of the bands): the test browser
  (320 to 1440 wide, 200 percent text) and both virtual phones. Passed.
- 2026-11-24, insurance fills on Health records, and Pharmacies under Not connected
  there and at sign-in: the test browser. Passed.
- 2026-11-24, Save as FHIR file and Save a backup on Android, with the real share step
  (not a stand-in): the virtual phone. Both files saved. On the live site the same day, on
  the virtual phone: sign-in, allergies, As needed, I'm taking this, offline, signed out.
- 2026-11-24, Done at the end, swiping the QR code away, Edit on allergies, and the unnamed
  allergy popup, before publishing: the test browser (320 to 1440 wide, 200 percent text)
  and both virtual phones. Passed. On the iPhone the swipes were made by the page, not a
  finger, so a real swipe there is still to check.
- 2026-11-24, "Source:" on allergies from records, and one swipe down closing a code a little
  taller than the screen: the test browser. Passed.
- 2026-11-24, swiping the QR code up as well, before publishing: real touches on the
  virtual Android phone (down, up, left, right, slow, quick flicks, nudges, a tap), and
  made-up touches on the virtual iPhone. Passed. A real finger on the iPhone is still to check.
- 2026-11-24, allergies as one list, before publishing: the test browser (320 to 1440
  wide, 200 percent text) and both virtual phones. Passed.
- 2026-11-24, the QR code crumpling into the bag, before publishing: the test browser
  (and Reduce Motion) and both virtual phones, with real touches on Android. Passed. How
  smooth it looks on a real iPhone is still to check.
- 2026-11-24, Say what it is on the unnamed allergy: the test browser and the virtual
  iPhone. Passed.
