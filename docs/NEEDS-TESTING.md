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

Test patients whose records disagree: Riley Reconcile and Jordan Partial. The
sandbox deletes them every night, so run `node tools/reconcile-patients.mjs`
first, then `BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`, then
`git checkout -- tests/fixtures/reconcile/clinics` when done. After setting up
the lock, open the home server's address with one of these added:

- Riley: `/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImJyb3duYmFnLXJlY29uLXJpbGV5IiwiIiwiQVVUTyIsMSwxLDAsIiIsIiIsIiIsIiIsIiIsIiIsIiIsMCwxLCIiXQ%2Ffhir`
- Jordan: `/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImJyb3duYmFnLXJlY29uLWpvcmRhbiIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir`

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

**The review cards when records disagree** (2026-11-25, Task 10; test right
away: it changes the patient's list and what the QR code says). Checked only
in headless Chromium (iPhone 15 size, PIN lock, the live sandbox, self-signed
certificate); screenshots `task-10-*.png` in
`.superpowers/sdd/2026-11-25-medication-reconciliation/`. Run
`node tools/reconcile-patients.mjs` first, then
`BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`, then
`git checkout -- tests/fixtures/reconcile/clinics` when done. Sign in as
Riley. On both virtual phones:

- Home: under My medicines, "Your records don't agree on 3 things" as a
  link. My medicines: a box under Allergies, above Medicines, with the same
  line and **Check them**.
- Check them: "atorvastatin 20 MG Oral Tablet" and "1 of 3", "Do you still
  take it?", three choices, none chosen, Save greyed out until one is picked.
  "Yes, I take it" says "SMART sandbox says current, Jan 2026. Filled Aug
  2026". Save goes to lisinopril, "2 of 3", "How much do you take?"; then
  methotrexate, "3 of 3", "How often do you take it?".
- On lisinopril, lock the phone (or wait 5 minutes), unlock: back on
  lisinopril, "2 of 3".
- **Do this later** on methotrexate: back on My medicines, the box says "on
  1 thing" and **Check it**. From home's line it opens as "1 of 1"; Back goes
  home. Answer it: My medicines, the box is gone, and the screen reader says
  "Saved. Your list is up to date."
- Before checking, lisinopril's card on My medicines is named "Lisinopril"
  (no strength), as is its review heading; atorvastatin and methotrexate keep
  their full names. Each of the three has **Check this**, which opens that
  card alone ("1 of 1"); Do this later comes back to My medicines.
- Answering atorvastatin "No, I stopped" says "You said: No, I stopped";
  "I don't take this anymore" on lisinopril says the same words back.
- A Not taking mark against a newer prescription (mark one Not taking,
  then set the phone's date back a few months before marking, or use a list
  where the mark is older than the record): the card is back on the list
  with "You marked Not taking on …". **Yes, I take it** takes the Not taking
  mark away and the card stays on the list with no question; **No, I
  stopped** keeps the mark, the card goes under Not taking with "You said:
  No, I stopped", and an As needed mark on it is gone.
- Do this later from **Check this** or **Change** puts focus back on that
  card's own button.
- A double tap on Save moves on one card, never two ("2 of 3", not "3 of 4").
- Each answered card says "You said: … (Nov 25)" with **Change**. Change on
  lisinopril opens it as "1 of 1"; Do this later keeps the old answer; saving
  10 MG shows the 10 MG card.
- With TalkBack, each choice is read with its detail ("Yes, I take it, SMART
  sandbox says current, Jan 2026…"), and the question is read as the group's
  name. The heading is read with "1 of 3". VoiceOver on Tyler's iPhone the same.
- Show my QR code afterwards: on the staff page, a chosen version says
  "Patient confirmed this", and a "Not sure" one "Patient isn't sure" under
  "Records disagree: ask the patient".
- The cards wrap well on the iPhone SE size and at the largest text.

**The shared link, birth dates, old fills and one Back** (2026-11-26, Task
10c, from Tyler's iPhone check of 2026-11-25; test right away: the staff
page, the QR code and the patient's list). Checked only in headless Chromium
(iPhone 15 profile, self-signed certificate, PIN lock, the live sandbox as
Chantell Bartell); scripts and screenshots `task-10c-*` in
`.superpowers/sdd/2026-11-25-medication-reconciliation/`. On both virtual
phones:

- **The staff page drops the list from its address.** Sign in as Chantell,
  Show my QR code, and open its link (the Mac reads it from a screenshot).
  The address bar shows plain `share.html` as soon as the page opens, before
  the 6 digits. Type them: the list shows (Allergies (1) with the unnamed
  allergy note, Medicines (2), Added by patient (0), Patient says not taking
  (0)), and Save as FHIR file still saves it. Back still leaves the page in
  one step (no extra step was added). Reload: "This link has no list in it.
  Ask the patient to show their QR code again." Share or copy the page's
  address and open it in a new tab: the same message. In Chromium the
  address was `https://localhost:8443/share.html` with `location.hash`
  empty, history length 2 before and after (the blank tab and the page),
  and the saved file had Chantell's 2 medicines and her birth date.
- **Birth dates as words.** "Born May 8, 1974" under Chantell's name on the
  staff page and in See what's inside; on Choose a test patient, "Born May 8,
  1974. Fills, an allergy, …" and each other patient's whole birth date. On
  Android, set the emulator's time zone west of UTC (Hawaii) if it's easy:
  the same day shows. Chromium set to Honolulu showed May 8.
- **"Last filled over a year ago."** Chantell's Chlorpheniramine (filled
  only Feb 15, 1979) has the note under its directions on My medicines and on
  the staff page, and still sits under As needed; Naproxen (last filled Sep
  10, 2026) has none, and nor do medicines with no fills. See what's inside
  says it too. It's a yellow line like "Hospital order". In Chromium set to
  Honolulu at 11:30 PM on Nov 26 (already Nov 27 in UTC), fills 364 and 365
  days back had no note and 366 days back had it.
- **One Back from the sandbox.** Connect, a test patient (or Someone else),
  then the phone's Back (and Safari's) from the sandbox's page: "Choose a
  test patient", then one more Back: the lock, then Connect your health
  records. The same after More options ▸ Sign out, Sign in, unlock, Connect.
  Chromium did this on both paths, from the sandbox's own list and its
  approval page (4 history steps on a first run: the blank tab, home, the
  list once, the sandbox).

**Fixes from the 2026-11-25 pass** (Task 10b; test right away: the staff
page and sign-in). Checked only in headless Chromium (iPhone 15 profile,
self-signed certificate, PIN lock, the live sandbox); scripts and screenshots
`task-10b-*` in `.superpowers/sdd/2026-11-25-medication-reconciliation/`.
On both virtual phones:

- **The staff page's code box at 200 percent text.** iPhone simulator,
  Settings ▸ Accessibility ▸ Larger Text at Accessibility Large: make a QR
  code, open its link, and type 6 digits. All 6 show inside the box, with
  room either side, and the page doesn't scroll sideways. At normal text the
  box looks as before (digits as big, same spacing). Also at the iPhone SE
  size (320 px wide) with Accessibility Large. In Chromium the 6th digit
  ends at 326 px in a box whose inside edge is 359 px (393 px wide, 200
  percent), and at 261 px of 286 px at 320 px wide; before, it was at 417 px.
  On Android, use Chrome's own text size (Chrome's Settings ▸
  Accessibility, 200 percent) if the system font scale still doesn't reach it.
- **Back after signing out.** Signed in, More options ▸ Sign out, then Sign
  in, unlock, Connect: the phone's Back button (and Safari's) from "Choose a
  test patient" comes back to the lock and then Connect your health records,
  not "You're signed out". Then Connect, a patient, and Back from the
  sandbox's own page: "Choose a test patient", then one more Back to the
  lock and the connections screen (once since Task 10c, below). One more
  Back is "You're signed out". A first run (lock, connections, Connect,
  Back) is as before.
  While on the connections screen, wait 5 minutes for the auto-lock: unlock
  comes back to the connections screen.

**Found in the 2026-11-25 pass, not fixed.** The other two are kept in
`docs/LIMITS.md`: text past 200 percent (number 28, an idea) and Deny on the
sandbox's approval page (number 27, the sandbox's own behavior). No phone
check waits on them.

**Answering a disagreement: "Not sure, ask my doctor"** (Tasks 8 and 9). The
rest of both entries passed on 2026-11-25 (see Tested). Blocked: the answer
buttons are plan Task 10, not built yet. When they are, on both virtual
phones, signed in as Riley:

- Answer one card "Not sure, ask my doctor" and make a new code: that card on
  the staff page starts with "Patient isn't sure", and in Save as FHIR file
  its versions say "Patient isn't sure".
- Answer all three with a version: the file's Medicines title is "Medicines",
  and each chosen one has "Other record" notes.

**TalkBack on the disagreement screens** (Tasks 6b to 8). Checked on
2026-11-25 only in Chrome's accessibility tree on the Android emulator, which
TalkBack reads from: the staff page reads each version's source and month just
before its name; My medicines reads each side's source with its dose; the
"don't match your name and birth date" line is read whole, before the cards.
TalkBack itself wasn't switched on (the emulator is shared and very slow).

**Marks and a newer prescription** (2026-11-25, step 1). Passed on both
virtual phones on 2026-11-25 (see Tested), except: a backup made before this
change still restores. That needs a backup file made by the older app.

**Lock first, then the connections screen** (2026-11-25, design
`docs/superpowers/specs/2026-11-25-connections-design.md`). Passed on both
virtual phones on 2026-11-25: the README's test-patient link with no lock
(lock set-up, then the screen); More options, Health records, Sign in again,
Approve (back to Health records, and Done goes home); Sign out, then Sign in
(unlock, then the screen, no saved list shown). Still to check:

- Face ID set-up first, then the screen; Face ID again after the sandbox
  (Tyler's iPhone).
- The Home Screen app: the sandbox sign-in comes back into the app, not
  Safari, and lands on the connections screen (Tyler's iPhone).
- Home's "Sign in" note (expired pass) comes back home, not to the screen.
  Not reproduced: no way to expire the pass on a virtual phone.
- Cancel at the sandbox's approval page: see "Deny at the sandbox's approval
  page" above.

**The folded Allergies box and the severe mark** (2026-11-24): passed on both
virtual phones (Android on 2026-11-25). A nurse or pharmacist has yet to check
which reactions are marked severe.

**As needed, Not taking, the staff code box and the "?" headings** (PR #3).
Passed on 2026-11-25 (see Tested). Still to check:

- A QR code made before this change still opens on the staff page (needs an
  old code and its 6 digits).
- As needed on a "Filled, not in your records" medicine, and its Undo going
  back there: no test patient has one (Riley's lisinopril 20 MG fill joins
  her lisinopril 10 MG card).
- A backup made before this change still restores, and one made after it
  brings the As needed marks back.
- The "?" headings and See what's inside with TalkBack itself (Chrome's
  accessibility tree reads "About …, collapsed" right after each heading).
- Whether a camera reads the slightly smaller code on a short screen (real
  phone).
- The two buttons stacking at the largest text size on Android: the system
  font scale didn't reach Chrome's page. They stack on the iPhone simulator
  at 200 percent text.

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
- Face ID and the Home Screen app (see "Lock first, then the connections
  screen" above).
- Scan Riley's QR code (records that disagree) with a camera, now that a
  camera has opened Chantell's (see Tested, 2026-11-25).

## Tested

**2026-11-25, Tyler's iPhone check: the QR code read by a real camera.**
Chantell's QR code from the live site was scanned with a second iPhone's
camera (not Tyler's, and not on his account). It opened `share.html` in
Chrome and showed the list right: allergies with the unnamed-allergy note,
Medicines (2), Added by patient (0), Patient says not taking (0), and Save as
FHIR file. The page's link he then texted to his own iPhone arrived as plain
`share.html` and showed "This link has no list in it": Chrome's share left
the list part off. Brown Bag didn't clear it then; since Task 10c the staff
page clears it itself (see "Waiting for the next pass"). Face ID and the Home
Screen app are still to do on his iPhone.

**2026-11-25 pass, Android emulator (Chrome) and iPhone 15 simulator (Safari),
on the home server with the test clinic, Riley and Jordan put back on the
sandbox the same day.** Widths also on a temporary iPhone SE (3rd generation)
simulator, and in Android Chrome at 375 and 320 wide. The QR codes were read
from screenshots by the Mac (a stand-in for a camera). The Android emulator
renders very slowly and Chrome showed "isn't responding" several times; each
time Wait was pressed and the step run again. Passed:

- The QR code with a disagreement (Task 7): shows, reads into `share.html`,
  See what's inside and the staff page list Medicines (9) with "Records
  disagree: ask the patient" first (atorvastatin current and stopped,
  lisinopril 10 and 20 MG, methotrexate weekly and daily), then From records;
  sertraline names both sources.
- The staff page with a disagreement, and the fill hint (Task 8): "Records
  disagree: ask the patient (3)", one card each with its source and month,
  From records (6), metformin's "From the fill: about 2 a day (60 for 30
  days)" and nowhere on My medicines; See what's inside says the same, in the
  same order. Wraps on the iPhone SE and at 320 wide. ("Not sure" is still
  waiting.)
- Save as FHIR file with a disagreement (Task 9): one .json from the staff
  page and one from See what's inside, the same apart from ids and time;
  Medicines section "Medicines (records disagree on 3 medicines)", text starts
  "Records disagree on 3 medicines. Ask the patient.", no "DetectedIssue";
  the popup starts on Cancel. ("Not sure" is still waiting.)
- Allergies, names and birth dates as real sources write them (Task 6d):
  Loria as before; Loria at `?demo=someone-else` (the line above the cards, My
  medicines (4)); Chantell's Allergies (1), "Mold, 1 unnamed", the Unnamed
  allergy row, and See what's inside's unnamed allergy line.
- Medicines as real sources write them (Task 6c): Riley (9, 1 older), Loria
  (6, 9 older; Lasix and furosemide two cards; simvastatin under Older;
  metoprolol asks how much), and the "no information" line on My medicines
  (4) and See what's inside, with a temporary clinic file (deleted after).
- Riley and Jordan: every card as the entry said (lisinopril, methotrexate,
  atorvastatin, levothyroxine, one sertraline, the hospital ondansetron under
  Older); Jordan's "Some records didn't load." on Home with no count, Valley
  Clinic's line on My medicines, simvastatin dated 2026 by year after Dec
  2025, metformin's clinic side undated, one amlodipine.
- Two sources on one list: Loria's metoprolol sides, `?demo=someone-else`, and
  without the test clinic My medicines (4) with no notice.
- Marks and a newer prescription: Not taking and Undo, As needed and Undo; a
  medicine marked Not taking the day before a newer prescription comes back to
  My medicines ("You marked Not taking on Nov 24. Your records have a newer
  prescription, Nov 25."), and Not taking again moves it there. (The earlier
  day was made by moving the page's clock back one day.)
- The "?" pills on Android, and with high contrast colors (forced colors,
  emulated in Chrome): labelled "About …", collapsed, 44 px, the explanation
  opening right under its heading, the outline kept.
- The folded Allergies box and the severe mark on Android: "Allergies (2) · 1
  severe", Penicillin with Trouble breathing marked Severe, the folded line
  "Mold, Penicillin, 1 unnamed".
- Remove on the unnamed allergy on Android: the popup starts on "No, keep
  it", which keeps it; "Yes, remove it" leaves "You removed an unnamed allergy
  from this list." with Show it again; See what's inside still lists it,
  "patient thinks it's already listed".
- PR #3: As needed and Not taking side by side, stacking at 200 percent text
  on the iPhone; the As needed part and Undo; Not taking on an As needed
  medicine; the "… is under Not taking" panel and I'm taking it again; with no
  signal (Android, Chrome's offline stand-in) the QR alert says "Marked
  furosemide 40 MG Oral Tablet As needed"; no "Your care team confirms it" on
  the staff page or See what's inside; the staff page's As needed (with
  "Patient says as needed") and Patient says not taking groups; Medicines (4)
  on the staff page equals My medicines (4) on home; the short code box at
  normal text; Android's Back button on See what's inside (back to the code,
  then closes it) and on the sign-in list on a first run (one of three Back
  presses was lost while Chrome wasn't responding).

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
