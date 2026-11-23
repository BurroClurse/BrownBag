# Brown Bag: allergies, with the reaction

Status: draft, waiting on Tyler's approval.

## Why

Tyler (2026-11-23): add allergies with the reaction. The first design's
notes say "Nurses almost always ask for them next." Brown Bag answers what
the patient takes; this answers what they must not be given.

## Who and what for

The patient, and the nurse or pharmacist who scans the QR code. Staff want
the allergy, the reaction, and who says so (the records or the patient).

## What the sandbox has (Tyler ran the counts, 2026-11-23)

372 AllergyIntolerance records, none with a reaction: 369 food, 3
environment, none marked medication. Chantell Bartell
(`e89af71d-4aa4-2237-e71d-6fa8e4b5af09`) has "Mold (organism)". So in a demo
the reaction, and medicine allergies, come from the patient.

## Goals

- Allergies from the records, and the patient's own, with their reactions,
  at the top of My medicines.
- The patient can add an allergy with its reaction, and add a reaction to an
  allergy from their records.
- The QR code and the staff page carry them, right under the patient's name.
- Staff can tell "no known allergies" (the patient said so) from "none in
  the records, and the patient hasn't said" and from "couldn't be loaded".

## Non-goals

- Warning when a medicine conflicts with an allergy. That is a clinical
  judgment; the care team makes it.
- Editing or removing an allergy that came from the records.
- Past allergies (inactive or resolved).
- Sending anything back to the clinic.

## Anti-goals

- Anything that makes a failed or refused load look like "no allergies".
- A blank where the reaction is missing. It says "Reaction not in your
  records", so nobody reads it as "no reaction".
- Losing allergies the phone already has because one update failed.
- Slowing down or failing the medicine list because of allergies.
- Inventing codes. Words are always sent; a code only when checked.

## Approaches (Tyler chose A, 2026-11-23: "if it doesnt look right, option B")

- **A. A section at the top of My medicines (chosen).** Home is unchanged.
- **B. Its own screen, with a third button on home.** The fallback. Home is
  tight: on the iPhone 15 with two notes showing, it ends 17 points from the
  bottom, so the logo would shrink.
- **C. Under More options.** Smallest, but easy to miss. Dropped.

The section is drawn by its own function, so moving it to its own screen (B)
is a small change. **Stop point:** when A is built, Tyler sees screenshots
from both virtual phones before anything goes to `main`, and says A or B.

## What the patient sees

```
[ Done ]
My medicines
Note: This list is what you and your records say…

Allergies (2)

  Penicillin
  Reaction: Hives or rash
  Added by me · Nov 23, 2026
  [ Remove ]

  Mold
  Reaction not in your records
  SMART sandbox
  [ Add the reaction ]

[ + Add an allergy ]

From your records
…
```

A record allergy can also show, each on its own line and only when the
record says so: "Intolerance" (the record's type is intolerance), "Not
confirmed" (verification unconfirmed or presumed), "Marked high risk"
(criticality high), and "Reaction: hives (severe)" with the severity.

When the patient added the reaction: "Reaction: Hives or rash (added by
me)", with "Change the reaction" and "Remove my reaction".

### No allergies

- None anywhere, patient hasn't said: "No allergies in your records." with
  "+ Add an allergy" and "I have no known allergies".
- After tapping it: "You said you have no known allergies on Nov 23, 2026."
  with "Undo" and "+ Add an allergy". Adding an allergy clears it.
- The button only shows when nothing is listed. If the records later bring
  an allergy, the patient's statement is ignored on the phone and left out
  of the QR code, and stays saved.
- A record that itself says "No known allergy" (SNOMED CT 716186003), "No
  known drug allergy" (409137002), "No known food allergy" (429625007) or
  "No known environmental allergy" (428607008) is a statement, not an
  allergy: "Your records say: No known drug allergy." It isn't counted.

### Loading problems

- Refused (an older sign-in without the permission): "Sign in again to add
  your allergies."
- Failed, with allergies saved on the phone: they stay, with "Your allergies
  couldn't be updated. These are from Nov 21."
- Failed, with none saved: "Your allergies couldn't be loaded." The "No
  allergies in your records" line never shows then.

## Adding an allergy

```
Allergic to           [ Choose ▾ ]
   Penicillin · Amoxicillin · Sulfa antibiotics · Aspirin · Ibuprofen ·
   Codeine · Contrast dye · Latex · Peanuts · Tree nuts · Shellfish ·
   Eggs · Milk · Bee stings · Other…
What happened         [ Choose ▾ ]
   Hives or rash · Itching · Swelling of the face, lips or throat ·
   Trouble breathing · Severe reaction (anaphylaxis) ·
   Nausea or vomiting · Not sure · Other…
[ Save ]  [ Cancel ]
```

- The same native lists as the add-a-medicine form; "Other…" opens a text
  box. Both answers are required; "Not sure" shows "Reaction not known".
- Same name as one already listed (ignoring case): a panel in the form asks,
  as for medicines: "Penicillin is already on your list." Don't add it, or
  Add it anyway.
- A half-typed allergy is kept like a half-typed medicine, and home says it
  isn't saved.
- "Add the reaction" opens just "What happened" under that allergy.
- Adding or removing is announced, focus moves to a sensible place, Remove
  has Undo until the patient leaves the screen, and every control works with
  VoiceOver (WCAG 2.2 AA).

## Reading the records

- `launch.html` adds `patient/AllergyIntolerance.read`. Everyone signs in
  once more.
- On each update, alongside the medicines and claims, with its own 6-second
  limit: `GET AllergyIntolerance?patient={id}`, every page. Filtering
  happens in the app, not in the search.
- Left out: verificationStatus `entered-in-error` or `refuted`;
  clinicalStatus `inactive` or `resolved`. A missing status stays in.
- The name: `code.text`, else the first coding's display, without the
  SNOMED ending ("(organism)", "(substance)", "(disorder)"…). No name at
  all: "Unnamed allergy", still shown.
- Reactions: every `reaction[].manifestation` (text, else display), with
  `severity`. Two records of one allergy (same code, or same plain name)
  show once, with all reactions, and keep the highest risk.
- Each keeps its source name ("SMART sandbox") for later health systems.

## Saved on the phone

- Records' allergies go in the encrypted records copy with their own date
  and status, so they work offline.
- The patient's own (`allergies`, `allergyReactions` by the record allergy's
  key, `noKnownAllergies` date) go in the same encrypted data as additions,
  so they are in the backup. Restore merges and never replaces: own
  allergies by id; the phone's reaction wins; a "no known allergies" date is
  dropped if either side has an own allergy.
- **Fix while there:** the loader in `js/vault.js` keeps only additions and
  stopped marks, so the log of offline changes is dropped when Brown Bag
  reopens and the QR screen's warning disappears. It must keep every field.
- Changes made while the list is a saved copy join the QR screen's warning:
  "Added the allergy Penicillin", and so on.

## In the QR code and on the staff page

- FHIR R4 AllergyIntolerance entries in the same Bundle:
  - Records: code text (and the record's SNOMED or RxNorm code when it has
    one), reaction, criticality, type, and the note "From records: SMART
    sandbox". A reaction the patient added carries the note "Reaction from
    the patient".
  - Patient's own: `asserter` the patient, verificationStatus
    `unconfirmed`, code text, reaction text.
  - The patient's statement: SNOMED CT 716186003 "No known allergy",
    `asserter` the patient.
- A Bundle tag says whether the records' allergies were `loaded`, `failed`,
  `refused` or are `saved-on` a date.
- Staff page: an "Allergies" section first, under the name, with "From
  records", "From patient" and the notes. Empty cases:
  - "Patient says: no known allergies."
  - "None in the records. The patient hasn't said." (loaded only)
  - "Allergies from records couldn't be loaded. Ask the patient."
  - A code made before this feature: "This code doesn't include allergies.
    Ask the patient."
- "What's in this code?" adds "Your allergies and reactions".
- The QR budget is unchanged (version 40-M). Too long uses the existing
  screen.

## Codes

The common list sends words. Ones that are RxNorm ingredients (amoxicillin,
aspirin, ibuprofen, codeine) also send the RxNorm code, each checked against
RxNav during the build; any that can't be checked sends words only.

## Constraints

- Static site, no server, no new libraries. WCAG 2.2 AA.
- Home unchanged (A). Sandbox data only.
- Both virtual phones are checked right after the build (sign-in, saved
  list, QR code and staff page all change).

## Left to the builder

- Module and function names; how the two forms share code.
- Exact card layout within the existing card style.
- How `saved-on` and status are stored.

## Calls made by Claude, for Tyler to check

- The two lists' wording and choices, and one reaction per own allergy
  (Other… for several).
- The patient's "no known allergies" is ignored when anything is listed.
- "Not confirmed", "Intolerance" and "Marked high risk" lines.
- Duplicate check by name only.
- A failed load keeps the saved allergies and says their date.
- Approval of screenshots before `main` (the A or B stop point).
