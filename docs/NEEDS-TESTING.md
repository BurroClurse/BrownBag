# Needs testing

Changes waiting for a phone check, tested together in one pass instead of
after every change (Tyler, 2026-11-23). Claude adds a line here with each
change, and moves it to "Tested" with the date when the pass is done.

## How a test pass works

1. **Android emulator** (`Peregrine_Pixel9_API36`, Chrome): Claude drives it
   on the Mac. TalkBack can be switched on.
2. **iPhone 15 simulator** (Safari): Claude drives it with Apple's built-in
   Safari driver. No VoiceOver or Face ID in the simulator.
3. **Tyler's iPhone**: VoiceOver, Face ID, the Home Screen app, and anything
   the simulators can't do. Listed under "On a real iPhone".

Test patient: Loria Jenkins (`e7de504a-311d-49be-b2bc-566a328bcc72`), a
built-in sandbox patient. The demo patient Avery Brownbag is wiped by the
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

- Nothing yet.

## On a real iPhone (Tyler)

- VoiceOver on the "… is already on your list" panel: it reads the heading
  first, and every button can be reached.

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
