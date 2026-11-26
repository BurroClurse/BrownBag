# Brown Bag: one-screen redesign

Status: draft for the developer's approval, 2026-11-21.

## Why

The first build works, but its main screen is a long scrolling list that
looks basic and doesn't feel like Brown Bag. The developer wants it simple enough
for a 90-year-old: one screen, no scrolling, big buttons, decent-size
text, built around the logo, with the QR code a tap away.

## Who and what for

Patients open Brown Bag for two jobs (the developer, 2026-11-21):

1. **Show the QR code** at a check-in desk or to a nurse. This must be the
   easiest thing in the app and shows only the code.
2. **Review and change the list**: see their medicines, add one, mark one
   stopped.

## Goals

- The main screen fits one phone screen with no scrolling at normal text
  sizes.
- The approved logo (`icons/logo.png`) is the center of the screen.
- Big buttons with plain words; text never small.
- Showing the code takes one tap from the main screen.

## Non-goals

- No change to what the app does: same records, additions, stopped marks,
  encryption, lock, QR packing, backup, offline list.
- No change to the staff page (`share.html`) beyond the logo at its top.

## Anti-goals

- A screen that looks clean but hides how to do something. Every action is
  a labeled button, not a picture you have to know to tap.
- Motion that makes anyone dizzy: the swoosh respects the phone's Reduce
  Motion setting.
- A QR code that's harder to scan because of styling: the code is always
  plain black on white with its quiet margin.

## Constraints

- WCAG 2.2 AA stays (design, Accessibility). At the phone's largest text
  sizes the main screen may not fit; then it scrolls rather than cutting
  anything off. No scrolling is the goal at normal sizes, not at the cost
  of hiding text.
- Static pages on GitHub Pages, no new libraries. The animation is CSS.
- Long medicine lists (20+) can't fit one screen; the list lives on its own
  screen and scrolls there only.

## Approaches considered

1. **The bag plus two big labeled buttons (chosen by the developer, 2026-11-21).**
   The bag sits in the middle; under it "Show my QR code" and "My
   medicines (N)". Tapping the bag also opens the code. Words on the
   buttons say exactly what happens.
2. Tap the bag, one button below. Cleaner, but many older people don't
   think to tap a picture.
3. Tabs along the bottom (Home, Medicines, Settings). Familiar to younger
   people, but more to learn and small tab labels. Dropped.

## The screens

### Main screen

```
┌─────────────────────────┐
│      Jane Example       │  name, large
│                         │
│      [ BAG LOGO ]       │  logo.png, as large as fits
│                         │
│ ┌─────────────────────┐ │
│ │  Show my QR code    │ │  primary: dark teal, white text
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │   My medicines (8)  │ │  secondary: outlined
│ └─────────────────────┘ │
│ This list is what you…  │  disclaimer, one or two lines
│      More options       │  backup, restore, sign out
└─────────────────────────┘
```

- Tapping the bag does the same as "Show my QR code".
- "My medicines (N)" counts current medicines from records plus additions.
- A notice bar at the very top only when needed: no connection / saved
  copy, a source failed to load, or the Home Screen hint. It pushes the
  rest down; on short phones that may mean a little scrolling.
- "More options" opens a short screen with Save a backup, Restore a
  backup, and Sign out, each a big button.

### The QR code

- Opens from the button or the bag. The code swooshes up out of the bag
  and grows to fill the screen (about half a second), then tucks back into
  the bag on Close. With Reduce Motion on, it fades in and out instead.
- Shows only: "Show this to the person checking you in", the QR code as
  large as the screen allows (black on white, margin kept), the 6 digits
  very large with "Read this code out loud", and one big Close button.
- If the list is too long for one code, the same screen says so and offers
  "Show my medicines instead".

### My medicines

- A full screen with a big "Done" button at the top to go back.
- Sections as today, in big rows: From your records (with "I stopped
  this"), Older prescriptions (folded), Added by me (with Remove and
  Undo), Stopped by me (with Undo), and a big "+ Add a medicine or
  supplement" button.
- This is the only screen that scrolls in everyday use.

### Lock, signed out, loading

- Same look: the logo in the middle, the words and buttons under it.

## Left to the builder

- Exact sizes, spacing and the animation's curve, within "big and simple".
- How the logo scales on short phones (it shrinks first, buttons never do).
- Moving the current section code into the medicines screen without
  changing its behavior or tests.
