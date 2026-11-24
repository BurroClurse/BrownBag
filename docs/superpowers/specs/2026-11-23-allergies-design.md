# Brown Bag: allergies, with the reaction

Status: approved by Tyler, 2026-11-23.

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

- **A. A section at the top of My medicines (chosen).** Home keeps its
  layout.
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
me)", with "Change the reaction" and "Remove my reaction". They can only add
one when the record has none. If the record gains its own later, both show.

**One card per allergy.** When the patient's own allergy and a record name
the same thing (same code or same plain name), they show as one card, the
record's, with the patient's reaction marked "added by me" and "Remove mine".

### No allergies

- None anywhere, patient hasn't said: "No allergies in your records." with
  "+ Add an allergy" and "I have no known allergies".
- After tapping it: "No known allergies", big and on its own line, then "You
  said this on Nov 23, 2026." with "Undo" at the right, and "+ Add an allergy".
  The box is soft teal instead of red (Tyler, 2026-11-24), unless the
  allergies didn't load or an entry doesn't say what it's to: then it stays
  red. Adding an allergy clears it.
- The staff page matches (Tyler, 2026-11-24): soft teal, "No known allergies"
  big, "The patient says this." It stays red when there's any allergy warning,
  a saved copy included. Only the page's look; the QR code is unchanged.
- The button only shows when nothing is listed and the records' allergies
  loaded (now, or in the saved copy). After a failed or refused load with
  nothing saved it isn't offered. If the records later bring
  an allergy, the patient's statement is ignored on the phone and left out
  of the QR code, and stays saved.
- A record that itself says "No known allergy" (SNOMED CT 716186003), "No
  known drug allergy" (409137002), "No known food allergy" (429625007) or
  "No known environmental allergy" (428607008) is a statement, not an
  allergy: "Your records say: No known drug allergy." It isn't counted, and
  it goes in the QR code. Beside a listed allergy, both show, on the phone
  and to staff. It doesn't hide the patient's own button.

### Loading problems

- Refused (an older sign-in without the permission): home shows its usual
  sign-in note, "Sign in again to add your allergies.", and so does the
  section. Nobody is signed out. Allergies already saved stay, with "These
  are from Nov 21."
- A list saved before this feature: "Your allergies haven't been loaded
  yet."
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
  as  for medicines: "Penicillin is already on your list." Go back, or (when it
  has no patient reaction) Use my reaction for it. There is no Add it anyway,
  so an allergy never shows twice.
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

- Medicines and allergies refresh on their own: if one fails, the other
  still updates, and each keeps its own date.
- A record allergy's key is its code (system and code), else its plain name.
  A merged allergy keeps its other keys, as insurance-only medicines do, so
  the patient's reaction stays with it.

## Saved on the phone

- Records' allergies go in the encrypted records copy with their own date
  and status, so they work offline.
- The patient's own (`allergies`, `allergyReactions` by the record allergy's
  key, `noKnownAllergies` date) go in the same encrypted data as additions,
  so they are in the backup. Restore merges and never replaces: own
  allergies by id; the phone's reaction wins; a "no known allergies" date is
  dropped if either side has an own allergy.
- `js/vault.js` already keeps every saved field on load and restore (fixed
  2026-11-23: the log of offline changes used to be lost on reopen).
- Changes made while the list is a saved copy join the QR screen's warning:
  "Added the allergy Penicillin", and so on. Each change belongs to the
  medicines or the allergies, and is cleared when that part updates.

## In the QR code and on the staff page

- FHIR R4 AllergyIntolerance entries in the same Bundle:
  - Records: code text (and the record's SNOMED or RxNorm code when it has
    one), each reaction with its severity, criticality, type,
    verificationStatus, and the note "From records: SMART sandbox". A
    reaction the patient added is its own `reaction` entry with the note
    "From the patient".
  - Patient's own: `asserter` the patient, verificationStatus
    `unconfirmed`, code text, reaction text.
  - The patient's statement: SNOMED CT 716186003 "No known allergy",
    `asserter` the patient.
- Two Bundle tags: the records' allergies status (`loaded`, `failed`,
  `refused`, `not-loaded`) and, when they are a saved copy, the date.
- The link's prefix becomes `v3.`; the page still opens `v2.` codes. A staff
  page running old code then refuses a new code ("This link is damaged")
  instead of showing a list with the allergies silently missing.
- Staff page: an "Allergies" section first, under the name, with "From
  records" and "From patient", reactions with severity, "Not confirmed",
  "Intolerance" and "Marked high risk". The patient's own aren't labeled
  "Not confirmed"; "From patient" says it.
- **The status line shows whether or not anything is listed:** "Allergies
  from records couldn't be loaded. Ask the patient." (failed, refused,
  not-loaded) or "Allergies from records are a copy saved on Nov 21. They
  may be out of date."
- Nothing listed:
  - "Patient says: no known allergies."
  - "None in the records. The patient hasn't said." (loaded or a saved copy)
  - A `v2.` code: "This code doesn't include allergies. Ask the patient."
- "What's in this code?" adds "Your allergies and reactions".
- The QR budget is unchanged (version 40-M). Too long uses the existing
  screen.

## Codes

The common list sends words. Ones that are RxNorm ingredients (amoxicillin,
aspirin, ibuprofen, codeine) also send the RxNorm code, each checked against
RxNav during the build; any that can't be checked sends words only.

## Constraints

- Static site, no server, no new libraries. WCAG 2.2 AA.
-Home keeps its layout (A). Sandbox data only.
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
- Duplicate check by name only, and one card per allergy.
- "I have no known allergies" only after the records' allergies loaded.
- An older sign-in gets the home note instead of being signed out.
- New codes don't open on a staff page that is still running old code.
- A failed load keeps the saved allergies and says their date.
- Approval of screenshots before `main` (the A or B stop point).

## Settled while building (2026-11-23)

- Tyler chose A from the screenshots.
- "Allergic disposition" (SNOMED 609328004), which names no allergen, isn't a
  card or counted. The section and the staff page say the records have an
  entry that doesn't say what it's to (Tyler). One that has a reaction stays
  a card.
- Records that share a code but have different names stay apart: codes like
  "Allergy to drug" cover many. Placeholder codes never join records.
- A patient's reaction follows the allergy's name, then its code.
- Typed words that mean "none" aren't taken as an allergy or a statement.
- A server that withholds entries, or says there are some and sends none,
  counts as a failed load.
- Claims and allergies are read outside the SMART library (`js/read.js`), so
  a 401 on either can't drop the medicines or the pass.
- If the patient's own saved part can't be opened, staff are told to ask.
- The review's ten minor leftovers are fixed (Tyler, same day). Claims and
  allergies get only the time left before the medicines' own limit; each
  form keeps its half-typed answers; the QR warning says one true line per
  reaction; every code of a record travels; a record with no status is sent
  as active, as it's shown (FHIR requires a status).
- Chrome's offer to save the PIN stays (Tyler): WCAG 2.2 (3.3.8) counts
  password managers as help.

## Standards (2026-11-23; Tyler: the most interoperable, FHIR R4 and what's recommended)

Read that day: FHIR R4 AllergyIntolerance, US Core 9.0.0 (and 6.1.0, the one
ONC's (g)(10) names), IPS 2.0.1, SMART Health Cards and Links 1.0.0, CMS Kill
the Clipboard.

Done:
- What's shared keeps the R4 rules, with a test that checks every allergy:
  required elements, the required code lists, ait-1 and ait-2. Values R4
  doesn't have ("presumed", an unknown type or severity) are mapped or left
  out.
- A record's codes, coded reactions, verificationStatus, type, category,
  criticality and recordedDate all travel. Before, the reactions' codes and
  most of the rest were dropped.
- The patient's own: recorder and asserter are the patient, recordedDate,
  category, verificationStatus `unconfirmed` (R4 has no status for
  "patient-reported"; our reading), RxNorm ingredient codes where there is
  one (amoxicillin 723, aspirin 1191, ibuprofen 5640, codeine 2670, honey
  bee venom 124427; checked against RxNav).
- "No known allergies": SNOMED 716186003 with verificationStatus `confirmed`
  (US Core).
- No name and no code: data-absent-reason `unknown`.
- Reactions are one thing each (Hives, Rash, Nausea, Vomiting), so each can
  carry one code. Older answers still show as they were.

Waiting on a SNOMED CT license (free in the US through a UMLS account, which
Tyler would sign up for): codes for the other allergens and for reactions.
Checked on tx.fhir.org against US Core's value set 1267.43 and clinical
findings: Penicillin-containing product 890458001, Sulfonamide-containing
product 763875007, Iodinated contrast media-containing product 1144611009,
Latex 111088007, Peanut 762952008, Tree nut 442571000124108 (US extension),
Shellfish 735029006, Eggs (edible) 102263004, Cow's milk 3718001; Urticaria
126485001, Eruption 271807003, Itching 418290006, Angioedema 41291007,
Dyspnea 267036007, Anaphylaxis 39579001, Nausea 422587007, Vomiting
422400008. The license asks for a notice to NLM before distributing, a short
yearly report, a credit with the version, and the SNOMED CT notice.

Not done: SMART v2 scopes (`.rs`; the sandbox and older systems take v1
`.read`), Provenance, a US Core Patient (Brown Bag shares only the name and
birth date), and an IPS document or SMART Health Link (Later list; a link
needs a server).

## Changed 2026-11-24 (Tyler): shorter reactions

- For staff, See what's inside and the FHIR file's readable text: "Reaction:
  Hives, severe (records) · Vomiting (patient)". "Reaction: not listed" when
  nobody gave one, "not known (patient)" when the patient isn't sure. Never
  "none" or "null".
- "Marked high risk", "Intolerance" and "Not confirmed" have their own line first.
- The source is in the heading, "From records (SMART sandbox)", when every record
  has the same one. Otherwise each says "Source: ...".
- The QR code's data didn't change.
