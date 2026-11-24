# My medicines polish

Asked for by Tyler 2026-11-24, with the obvious choices left to Claude.

- **Done at the bottom** of My medicines too, for a long list.
- **Swipe the QR code away**: down, left or right. It follows the finger, and a
  short swipe goes back. Up still scrolls. The phone's own edge swipe, two
  fingers and a zoomed page are left alone. Close stays, for anyone who can't
  swipe (WCAG 2.5.1).
- **Reaction buttons fold away.** Once the patient has said something about an
  allergy, its buttons are under a small Edit. The same for ones they added,
  which can now change their reaction instead of being removed and added again.
  "Add the reaction" stays in the open: it still needs doing.
- **The unnamed allergy note.** After adding an allergy of the same kind (or one
  in their own words, whose kind isn't known), a popup asks if it's the unnamed
  one. Yes takes the note off My medicines. It starts on No.
  - The record is never hidden from staff: the QR code and file still have it,
    with "patient says it's Latex". A patient's guess doesn't remove a record.
  - Edit on that allergy has Show the note again. Removing the allergy brings
    the note back too.
  - A saved list from before this has no way to tell entries apart, so it
    doesn't ask until the records load again.
- **Saving by download** says "Check your downloads" instead of "Saved", because
  Android may still ask.

**Approaches for the note:** hide the record everywhere (rejected: it would turn
a guess into a missing allergy) or only the note on the phone (chosen).
