# My medicines polish

Asked for by the developer 2026-11-24, with the obvious choices left to Claude.

- **Done at the bottom** of My medicines too, for a long list.
- **Swipe the QR code away**: down, up, left or right (up added the same day).
  It follows the finger, and a short swipe goes back. A code too tall for the
  screen scrolls first. The phone's own edge swipe, two
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

**Reformatted the same day (the developer chose one list of three layouts):** one white list,
a row for each allergy: the name with Edit (or Add reaction) beside it, then the
reaction and "Source: …" or "Added by me". Record marks get their own line. The date
added is under Edit. The unnamed allergy is the last row, not a note, so the popup says
"its line". A saved date is a plain line; warnings keep their yellow box. The staff page
and the QR code don't change.

**Say what it is (same day, the developer: the row had no way to change it and said too
little):** the unnamed row has that button. It opens the add form in the row, and
saving links the two with no second question. The row says the records don't name it
and to ask the care team, or say what it is if known.

**From the developer's video (same day):** the code screen is taken off the page while the ball
falls, so the status bar strip isn't left white. "Removed Latex." and the like show
above the last Done. Added by me shows only with something in it, an Undo or a failed
load.

**Remove the unnamed allergy (same day, the developer: it could repeat one already there, like
mold):** the row gets Remove beside Say what it is, when there's another allergy. A popup
starting on No says when not to. Only the phone's line goes: staff, the QR code and the
file keep the record with "patient thinks it's already listed". A line with Show it again
stays, and the row returns by itself if no other allergy is left.

**Shorter Allergies box (same day, the developer chose folding the box and the unnamed row, and
the word over "!"):** it starts closed each time, names showing, title "Allergies (2) · 1
severe". Severe: anaphylaxis, trouble breathing, swelling of the face, lips or throat,
fainting, blistering or peeling skin, or the records' "severe", "high risk" or like words.
Nothing is ever called mild; no mark isn't a rating. A failed load, a Sign in note and
"your records say" never fold. Staff pages don't change. A nurse or pharmacist has yet to
check the rule.

**"?" pills (same day, the developer):** each "?" is an upright pill, white over teal like the
logo's, shorter, with the mark in the opposite color. Side by side halves were tried: they
split the mark down its middle and it was hard to read. Still 44 by 44 to tap.

**Approaches for the note:** hide the record everywhere (rejected: it would turn
a guess into a missing allergy) or only the note on the phone (chosen).
