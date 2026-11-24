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

- See what's inside and the two blocks: both phones before publishing (QR and
  staff pages).
- The sign-in list on Android: the phone's own Back button and TalkBack. Claude
  in Chrome stood in for the emulator (the Mac's disk was full).

## On a real iPhone (Tyler)

- Nothing yet.

## Tested

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
