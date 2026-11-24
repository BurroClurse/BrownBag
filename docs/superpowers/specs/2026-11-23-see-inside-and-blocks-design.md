# See what's inside, and two blocks: short design

Status: approved by Tyler, 2026-11-23.

## Why

- Staff can't always scan: no work phone or 2D scanner, the website is
  blocked, or their personal phone is the only one. The patient's own screen
  always works, and seeing the contents builds trust.
- Allergies and medicines look alike on My medicines: the same cards, the
  same red buttons.

## Approaches

- **See what's inside: a button on the QR screen (chosen).** Others: the real
  staff page with the 6 digits (leaves the app), a third button on home
  (crowded).
- **Two blocks on one screen (chosen).** Others: tabs, or a screen for
  allergies. Both can put allergies out of sight.

## 1. See what's inside

- A button under the 6 digits: "See what's inside". It opens over the QR
  screen: "What's in your code", then the same page staff see, drawn by the
  same code. Brown Bag unlocks the very code on the screen and draws what comes
  out, so the two can't differ.
- First line: "This is what opens when your code is scanned." Read-only: no
  Remove, no "I stopped this", no forms. "Back to the code" at the top and the
  bottom; Escape and the phone's Back do the same. It works with no signal.
- If the code can't be unlocked: "Couldn't open the code. Close it and show a
  new one." Never an empty list.
- List too long for one code: the button is there too, "See my list", in place
  of "Show my medicines instead", which opens My medicines with its buttons.
- The lock still applies: 5 minutes idle closes it like the rest.

## 2. Two blocks

```text
┌─ ⚠ Allergies (1) ───────────┐   tinted, thick border
│  Codeine                     │
│  Reaction: Severe reaction…  │
│  [ Remove ]                  │
│  [ + Add an allergy ]        │
└──────────────────────────────┘

Medicines (1)                      big heading, line under it
  From your records                smaller headings
     Metformin 500 mg
  Filled, not in your records
  Added by me
     [ + Add a medicine or supplement ]
  Stopped by me
```

- The same on My medicines, the staff page and "See what's inside". Nothing
  moves: allergies first, then medicines in today's order.
- The box is pale rose with a thick dark red border. The symbol is decoration
  (VoiceOver skips it) and shows when there is an allergy, or when allergies
  didn't load. With none, the box and its words stay, without the symbol.
  Color is never the only sign.
- "Medicines (N)" has the same N as the home button: current ones, filled ones
  and added ones; not stopped or older ones. The staff page counts the same way.
- When some records didn't load, there is no number, and the warning sits right
  under Medicines (found in review).
- Headings: h2 Allergies and Medicines, h3 for the parts.

## Dates (Tyler, 2026-11-23, after it was live)

- Under the name, here and on the staff page: "Records last updated: …" (last
  loaded into Brown Bag), then "QR code made: …" ("List made" for a list too
  long for one code). Some didn't load: "Records: some didn't load", no date.
- Allergies that loaded at another time: their own line in the box. The "may be
  out of date" warnings stay. Codes without the date show no line for it.

## Left to the builder

Exact colors (4.5 to 1 text, 3 to 1 border), sizes, and sharing the staff
page's drawing (a new `js/share-list.js`). Tests first; README, LEARNING; both
virtual phones, or Claude in Chrome where one won't run, before publishing (it
touches the QR and staff pages).

## Not in this

Reading the code straight into an EHR (SMART Health Cards or Links; the Later
list), printing, and a test with a real clinic scanner.
