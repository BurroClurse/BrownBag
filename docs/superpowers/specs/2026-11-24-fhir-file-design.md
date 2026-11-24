# Codes in the QR code, and a FHIR file for staff: design

Direction approved by Tyler 2026-11-24 ("all three"). This document waits on
his approval; nothing is built before that.

## Why

Tyler: "The most important thing is interoperability, we just need to make sure
that the info in the QR code is the most interoperable in its format, structure,
and terminology." Today the list is FHIR R4 with RxNorm, but the record's other
codes and coded directions are dropped, and only Brown Bag's own page can open
the code, so a hospital system can't take the list in.

## Goals

1. What a record says in codes reaches the person who scans.
2. Staff can save the list as a standard file: an International Patient Summary
   (IPS 2.0.1) FHIR document.
3. The patient's list reads the same. Their QR code is denser, and its help and
   the privacy page say staff can save a file.

Not goals: a server, SMART Health Links, signed SMART Health Cards, US Core
profiles, writing to a hospital system, reading health problems.

Must never happen: a medicine, allergy or warning lost to make room for codes; a
coded direction that says something different from the words; a file that looks
complete when something didn't load; the unlocked file saved without staff being
told; the patient's name in a file name; anything sent anywhere.

## Part 1. Codes in the QR code

**What's added to each medicine from records:**

- The record's RxNorm and NDC codes (system and code), RxNorm first. No other
  systems: some are licensed, and some only say "no code". Display words are
  left out; the name is already there.
- Coded directions, all or nothing. Only when the record has exactly one dosage
  entry, and everything in it is one of: `text`, `sequence`,
  `patientInstruction`, `route`, `asNeededBoolean`, one `doseAndRate` with a
  `doseQuantity` (its `type` is ignored), and `timing` whose `repeat` has only
  frequency, period, periodUnit and when. Any other field (a range, a maximum, a
  day of the week, "as needed for pain", a modifier) means no coded directions
  for that medicine: part of a direction can mean something else.
- What goes: `timing.repeat`, `doseQuantity`, and `asNeededBoolean` when true.
  Route goes as words, as now. Route codes are SNOMED, so they wait for NLM.
- The record's own status when it isn't plainly active: `on-hold`, `intended`,
  `unknown`. A completed record that was filled again, and a medicine only
  insurance knows, go as `unknown`, with the notes they carry now.
- When the patient marked a medicine As needed, the record's `repeat` is left
  out: "twice a day, as needed" would look like the prescription says so.
- The words already sent stay exactly as they are.

When a card stands for several merged records, only the shown record's codes go.
Codes from two records are never mixed. Medicines known only from insurance keep
their RxNorm code as today.

A saved list from before this has no codes kept, and sends what it sends today.

**What the patient adds:** a unit such as "tablet" also gets its UCUM code
(`{tbl}`, `{capsule}`, `{drop}`, `{puff}`, `{spray}`, `{patch}`,
`{suppository}`, `{lozenge}`, `{scoop}`). Already saved additions get it when
the QR code is made.

**Room.** Measured with made-up records and 3 allergies (squares across):

| Medicines | Today | With codes |
|---|---|---|
| 5 | 125 | 137 |
| 15 | 141 | 157 |
| 25 | 153 | 173 |

More squares are harder to scan. So codes are added only while the code stays at
161 squares (version 36) or fewer. Over that, the whole list loses the NDC codes first, then the coded directions. If it's still over,
the list goes exactly as today, and today's limit (version 40) stays. Nothing
else is ever dropped.

The link still starts `v3.`: an older staff page ignores the added parts. The
staff page and See what's inside read the same words as now.

## Part 2. "Save as FHIR file" on the staff page

Under the list, after the 6 digits:

```
[ Save as FHIR file ]
For systems that read FHIR. The file isn't locked.
```

Tapping opens a popup in the app's look:

```
Save an unlocked file?
Anyone who opens this file can read the patient's
name, birth date, allergies and medicines. Save it
only where you keep patient records.

[ Cancel ]   [ Save the file ]
```

- Cancel has focus. Escape and Back close it.
- The file is made on that device. Nothing is sent.
- It uses the phone's share sheet when it can share files, and a download
  otherwise, the way backups do. Only the file is shared.
- The name is `patient-summary-2026-11-24.json`: the date the QR code was made,
  no patient name.
- After it: "Saved." or "Couldn't save the file." A cancelled share sheet says
  "Not saved."
- Codes made before this change can be saved too, with fewer codes in the file.
- **Not when the list is incomplete.** If medicines, the patient's own part or
  allergies didn't load, the button is replaced by "This list is incomplete, so
  it can't be saved as a file." Systems that take the entries skip the words.
- A code that holds anything unexpected can't be saved either ("This list can't
  be saved as a file."). It still shows as now.

**The privacy page** gains, under When you share: "The person who opens it can
save it as a file that isn't locked." "Last changed" changes too. The "What's in
this code?" help on the QR screen says the same.

## Part 3. The file is an International Patient Summary

A new `js/ips.js`, no DOM: `patientSummary(bundle, options)` takes the opened QR
bundle and returns the IPS document. Anyone can make a valid link, so every
resource is rebuilt from known fields and checked, never copied.

- **Bundle**: `document`, a new `urn:uuid` identifier, `timestamp` when the file
  is made, every entry with its own `urn:uuid`. References point to those.
- **Composition**: type LOINC 60591-5; `date` is when the QR code was made;
  subject the patient; authors the patient and a `Device` named Brown Bag; title
  "Patient summary from Brown Bag". Status is `preliminary`, always: nobody at a
  clinic has checked it.
- **Medications** (LOINC 10160-0): every medicine in the code. The effective date
  is always data-absent-reason `unknown`: the code has no date of taking.
  Not taking: `stopped`, with `dateAsserted` the day the patient marked it. Each
  record entry with no medicine name is its own entry, name unknown.
  `timing.code` is left out where there's a `repeat`; the words are in `text`.
- **Allergies** (48765-2): as they travel now, except that "no known" codes (the
  patient's or the records') are left out when any allergy is listed, an entry
  has no name, or it's a saved copy. The words stay in the text.
- **Problems** (11450-4): required by IPS, never read by Brown Bag: emptyReason
  `unavailable`, and the words "Brown Bag doesn't read health problems."
- An empty Medications or Allergies section has emptyReason `unavailable`, never
  `nilknown`: an empty list isn't a doctor's "none".
- **The readable text** of each section (required) has the same words the staff
  page shows, every warning first: didn't load, saved copy, entries with no
  name, "Patient says not taking", "The patient says this." It is escaped.
- Brown Bag's own tags stay out; their warnings are in the text.
- The patient: name text and birth date. Either one missing is a
  data-absent-reason, never the words "Name not recorded".
- A saved copy, or insurance fills that didn't load, also goes in the section's
  title and note, so a system has a sign of it.

## Terms and licenses

- New LOINC codes (the four above) are in the code, so the README gains LOINC's
  notice. UCUM codes are used as its terms allow; its notice too.
- No new SNOMED CT code goes into the repo or through it. Allergy codes travel as
  they do today.

## Checks

- Tests first: every rule above, each "must never happen", and the IPS rules
  read (cardinalities, section rules, unique fullUrls, every reference found).
- HL7's official FHIR validator on made-up patients, if Tyler allows it.
- Test browser, 320 to 1440 wide, 200 percent text; both virtual phones at once
  (staff page change); scanning a denser code on a real phone.

## Approaches

1. IPS inside the QR code: about 7 medicines fit with codes. Dropped.
2. IPS built on the staff page from the QR code (picked): no size limit, no
   server, and the patient's QR code stays scannable.
3. IPS behind a SMART Health Link: needs a server Tyler doesn't have approval
   for. The same `js/ips.js` would feed it later.

## First: directions fixes (their own change, before this)

Found while designing. The file would carry these into a hospital system:

- A record with two dosage entries shows only the first. All are shown, in order.
- "As needed for pain" without words shows as a schedule. It says "as needed for
  pain".
- "1 to 2 times a day" without words shows as once. It says both numbers; timing
  Brown Bag can't put in words says "See the record for how often".
- A medicine the records have on hold shows as a current one. It says "On hold in
  your records", on the phone and to staff.
