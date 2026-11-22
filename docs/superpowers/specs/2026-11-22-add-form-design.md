# Brown Bag: adding a medicine, with lists and a check

Status: draft for Tyler, 2026-11-22.

## Why

Tyler (2026-11-22): "How much" and "How often" as dropdowns after the
medicine is chosen "would be much better and optimal as opposed to free
text." And: "sometimes users could accidentally add something that is
already there or add a dose/frequency/med that is slightly different, it
needs to be able to check against what's already there so that it
doesn't add a duplicate or the wrong med." Picked answers should go into
the QR code in a form other systems can read (the interoperability focus).

## Goals

- "How much" and "How often" are lists. "How much" fits the medicine's
  form. Both keep an "Other…" choice with a small text box.
- Picked answers go into the QR code as structured FHIR dosage (numbers
  and units), with the words alongside.
- Saving checks the new medicine against the whole list and asks the
  patient to confirm when it is a duplicate, the same medicine with a
  different dose or schedule, a look-alike name, or a medicine they
  marked stopped.

## Non-goals

- Editing a medicine already added (Remove and add again, as now).
- Changing records from the health system; the check only warns.
- Dose advice of any kind: the lists are what is on the bottle's label,
  not what is safe.

## Anti-goals

- Blocking a save. Every check ends in a choice the patient makes.
- A browser pop-up (`confirm()`): VoiceOver and the page lose it. The
  check is a panel in the page.
- A dose list that can't hold what is on a real label (insulin units, a
  taper): "Other…" always exists.

## Approaches

1. **Native lists (`<select>`) under the name (chosen, Claude's call).**
   The phone's own picker (a wheel on iPhone), labelled, read by
   VoiceOver, no new code to maintain.
2. Big tappable chips (1 · 2 · 3 tablets). Faster with one thumb, but
   long lists wrap and need their own keyboard and VoiceOver handling.
3. A custom dropdown. Most work, most accessibility risk. Dropped.

## How it works

### The lists

```
Medicine or supplement name
[ amoxicillin 250 MG/5ML Oral Suspension ]

How much                         How often
[ Choose ▾ ]                     [ Choose ▾ ]
  2.5 mL · 5 mL · 7.5 mL           Once a day · Twice a day
  10 mL · 15 mL · 20 mL            3 times a day · 4 times a day
  Other…                           At bedtime · Every other day
                                   Once a week · As needed · Other…
```

- Both lists are always on screen under the name and both stay optional
  ("Choose" means not given).
- "How much" depends on the form named at the end of the picked RxNorm
  name (Claude's call):
  - Tablet, Capsule (any kind: chewable, extended release…), Suppository,
    Lozenge: ½, 1, 1½, 2, 3, 4 of that form ("2 tablets").
  - Oral Solution, Suspension, Syrup, Elixir: 2.5, 5, 7.5, 10, 15, 20 mL.
  - Inhaler (ACTUAT, Inhalation), Nasal Spray: 1, 2, 3, 4 puffs or sprays.
  - Ophthalmic or Otic drops: 1, 2, 3 drops.
  - Transdermal (patch): 1 patch.
  - Cream, Ointment, Gel, Lotion: "Apply a thin layer".
  - Anything else, or a name typed by hand: 1 tablet, 1 capsule, 5 mL,
    1 scoop.
  - Always last: "Other…".
- Picking a different medicine resets "How much", so a tablet amount
  can't stay on a liquid. "How often" is kept.
- "How often": Once a day, Twice a day, 3 times a day, 4 times a day, At
  bedtime, Every other day, Once a week, As needed, Other….
- "Other…" shows a text box right under that list, labelled "How much,
  in your words" or "How often, in your words", and focus moves to it.

### What is saved and shared

- An addition keeps `dose` and `frequency` as words (as now), plus,
  when picked from a list, a structured copy: amount and unit, and the
  schedule (times, period, period unit, as needed, at bedtime).
- In the QR code's MedicationStatement, `dosage[0]` keeps `text` and
  gains `doseAndRate[0].doseQuantity` (value, unit; UCUM `mL` for mL)
  and `timing.repeat` (frequency, period, periodUnit; `when: ["HS"]` for
  at bedtime) and `asNeededBoolean` for As needed. "Other…" answers are
  words only.
- Additions made before this change have words only and are shared as
  before.
- Offline: the QR code is made on the phone, so a new addition is in the
  code at once, and the existing "This code isn't fully up to date"
  alert lists it until the next update (Tyler asked; it already works).

### The check on Save

Save compares the new medicine with everything on the list: from your
records, added by you, filled but not in your records, and stopped by
you. If one matches, a panel replaces the Save button's result; nothing
is saved until the patient chooses. Focus moves to the panel's heading,
and Go back returns focus to the name field.

```
Lisinopril is already on your list

On your list:  10 mg · once a day · from your records
Adding:        20 mg · twice a day

[ Go back and change it ]
[ Add it anyway ]
```

Same medicine means the same RxNorm code, or the same ingredients from
RxNav (so Zestril matches lisinopril). The cases, first match wins:

1. **Marked stopped.** "You marked Metformin stopped on Nov 20." Start
   it again (undoes the stop) · Go back.
2. **Same medicine, same dose and schedule.** "Lisinopril 10 mg once a
   day is already on your list." Don't add it · Add it anyway.
3. **Same medicine, different strength, dose or schedule** (sketch
   above). If the one on the list was added by the patient, a third
   choice: Replace the one I added.
4. **Look-alike name.** A different medicine whose name is spelled
   closely (Hydroxyzine and Hydralazine), and also a hand-typed name one
   or two letters off a listed one (Lisinoprill and Lisinopril; Tyler,
   2026-11-22: treat near-miss spellings as look-alikes). "Hydroxyzine
   looks like Hydralazine, which is already on your list. They're
   different medicines. Check the bottle." Go back · Add Hydroxyzine.

Offline, or when RxNav doesn't answer within its time limit, the check
uses the codes and names only, and says nothing about it.

## Constraints

- Static site, no new libraries. WCAG 2.2 AA: every list labelled, the
  panel announced, 44 px targets, works at large text sizes.
- The QR stays inside its version 40-M budget; if a list no longer fits,
  the existing "too long for one QR code" path shows.

## Left to the builder

- The exact spelling-distance rule for look-alikes (Claude's proposal:
  at most 2 letters different, names of 5 letters or more, compared on
  the drug name before its strength).
- How "same dose and schedule" compares a picked answer with a record's
  words.

## Calls made by Claude, for Tyler to check

- Native phone lists, not chips.
- The "How much" lists for each form, and the general list for typed
  names.
- "How often" list, nine choices.
- Changing the medicine resets "How much" only.
- The order of the four checks, and "Start it again" for a stopped one.
