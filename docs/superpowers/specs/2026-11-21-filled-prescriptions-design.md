# Brown Bag: filled prescriptions from the insurer

Status: approved by the developer, 2026-11-21.

## Why

Brown Bag's list shows what was prescribed and what the record says the
patient takes. The developer (2026-11-21): showing what was actually filled is "an
incredibly important aspect of what Brown Bag should show", and "the focus
here is interoperability and combining resources/APIs in order to get the
best picture." A prescription that was never filled, or a fill from a
prescriber outside this health system, is exactly what a medication review
needs to catch.

## Who and what for

The patient, and the person checking their medicines, who sees the result
through the QR code. They want to know, for each medicine: was it actually
picked up, and when last.

## Goals

- Each medicine on My medicines and in the QR code says whether insurance
  claims show it was filled, how many times, and when last, and from which
  insurer.
- Fills of medicines that aren't in the health record show up as their own
  items, so the list catches prescriptions from outside the health system.
- The claims are a separate source in the code, with its own name, so a
  second, truly separate insurer API (Medicare Blue Button 2.0, the next
  design) plugs in without reworking the list.

## Non-goals

- Medicare Blue Button 2.0 itself. The developer chose "both": this design first,
  Blue Button right after, in its own design (it needs a small server and a
  CMS developer account).
- Costs, copays or anything else on a claim besides the drug, the fill date
  and the insurer.
- MedicationDispense records (the sandbox has none).

## Anti-goals

- Saying or implying a medicine isn't taken because no claim was found.
  People pay cash, get samples, or use another insurer. The wording says
  "no insurance fill found", never "not filled".
- Merging two different drugs because their fills look alike. Matching uses
  the drug code and the same ingredient rules the list already uses.
- A slower open. Claims load inside the same update and time limits.
- Showing "no fill found" when claims couldn't be loaded. Then the list
  says the claims didn't load, and makes no fill claims at all.

## Approaches considered

1. **Pharmacy claims from the course sandbox, as a separate "From your
   insurer" source (chosen, with 2 right after; the developer, 2026-11-21).** The
   SMART sandbox holds 27,308 ExplanationOfBenefit records; the pharmacy
   ones carry the RxNorm code, the fill date and the insurer (for example,
   "Aetna"). One more read scope, same sign-in, no server.
2. **Medicare Blue Button 2.0 as a second sign-in.** A truly separate API,
   but confidential clients only (needs a server for the secret), a CMS
   developer account, and test patients who aren't the SMART sandbox's.
   Next design.
3. **Both** (the developer's choice): 1 now, 2 right after.

## How it works

### Reading the claims

- `launch.html` adds the scope `patient/ExplanationOfBenefit.read`.
- On each update (sign-in or the pass), alongside the medicines:
  `GET ExplanationOfBenefit?patient={id}`, every page, keeping only claims
  whose `type` is `pharmacy`
  (`http://terminology.hl7.org/CodeSystem/claim-type`). The app filters
  them itself: the sandbox answers a `type=pharmacy` search with an empty
  list rather than an error (checked 2026-11-21), 50 claims per page.
- From each pharmacy claim: the drug from `item[].productOrService`
  (RxNorm code and text), the fill date from `item[].servicedDate` or
  `servicedPeriod.start` (the sandbox uses `servicedPeriod.start`), and the
  insurer from `insurer.display`. A claim whose insurer is `NO_INSURANCE`
  is still a fill, shown as "paid without insurance" (Claude's call).
- A pass saved before this change lacks the new scope. If the claims read
  is refused (401 or 403), the list shows everything else and a note:
  "Sign in again to add your insurance fills." Signing in again asks for
  the new scope and saves a new pass.

### Matching fills to the list

- A fill belongs to a list item when their RxNorm codes match, or when
  RxNav says they have exactly the same ingredients (the rule the list
  already uses to group strengths). If an ingredient match fits two items
  (two current prescriptions of one drug are kept apart on purpose), the
  fill goes to the one started most recently (Claude's call).
- Each matched item gains: fill count, last fill date, insurer name(s).
- Fills that match nothing become their own items, "Filled, not in your
  records". Last filled within 12 months: listed with the current
  medicines. Older: with the older prescriptions.
- A prescription the record marks completed or stopped, with a fill in the
  last 12 months, moves to the current list with a line "Marked completed
  in your records, but filled Dec 24, 2025" (the developer, 2026-11-21: a recent
  fill means the pills are likely still at home).

### What the patient sees

On each medicine card in My medicines, under the existing lines:

```
Lasix 40mg
1 · once a day
since 1992-08-10 · SMART sandbox
Filled 3 times · last Jul 23, 2025 · Aetna claims      <- new
[ I stopped this ]
```

- With claims loaded but no match: "No fill found in your claims"
  (Claude's call, so a cash fill shown elsewhere doesn't contradict it).
- Claims didn't load: no fill lines on any card, and a note at the top of
  From your records: "Your insurance fills couldn't be loaded."
- A new section after From your records, only when there are any:
  **Filled, not in your records**, with a note: "Your insurance paid for
  these, but your health record doesn't list them. Check with your care
  team." Each card shows the drug, "Last filled Jul 23, 2025 · Aetna
  claims", and the same red "I stopped this".
- "My medicines (N)" counts current fill-only items too.

### In the QR code and on the staff page

- Each MedicationStatement in the shared Bundle gains a note "Last filled
  2025-07-23 (Aetna claims), 3 fills" or "No insurance fill found".
- Fill-only items go in as MedicationStatements with the note "Filled, not
  in the health record".
- `share.html` shows those notes under each medicine, as it shows the
  others.
- The "What's in this code?" explanation adds "insurance fills".

### Offline and the update

- Fills are saved with the records copy (encrypted, as now) and work
  offline. The offline-changes alert is unchanged.
- The claims read has its own 6-second limit inside the records step
  (Claude's call). If it's slow or fails, the medicines still update and
  the "couldn't be loaded" note shows.

## Constraints

- Static site, no new libraries, no server.
- WCAG 2.2 AA; home stays one screen; the QR must still fit (version 40-M
  budget). Fill notes are short so the QR stays inside its limit; if a
  list no longer fits, the existing "too long for one QR code" path shows.
- The claims source lives in its own module with a source name, so Blue
  Button adds a second claims source the same way.

## Test data

- Chantell Bartell, `e89af71d-4aa4-2237-e71d-6fa8e4b5af09`: 15
  prescriptions, 15 pharmacy claims (Aetna).
- e7de504a (Loria Jenkins): no claims, which tests "No insurance fill
  found" never shows when there are no claims at all. (Claims loaded but
  empty: the cards show nothing about fills, and no note.)

## Demo patient (the developer, 2026-11-21)

In the sandbox every prescription has exactly one matching claim, so the
interesting cases never appear. The developer chose to add a made-up **Brown Bag
demo patient** to the public SMART sandbox (r4.smarthealthit.org), read
through the real API like any other patient. A script in `tools/` creates
it (a Patient, MedicationRequests, and pharmacy ExplanationOfBenefits)
so it can be re-created if the sandbox is reset. It shows: a prescription
filled recently, one never filled, a fill with no prescription in the
record, a fill paid without insurance, and a "completed" prescription
filled recently. Only made-up data; nothing else on the sandbox is changed.

## Which insurers can share claims (background, 2026-11-21)

Federal rules (CMS-9115-F, 2020; CMS-0057-F, 2024) require a FHIR Patient
Access API from Medicare Advantage plans, Medicaid and CHIP, and plans on
the federal marketplace (HealthCare.gov), with claims data back to
January 1, 2016. Original Medicare offers Blue Button 2.0. Employer plans
and state-marketplace plans aren't required to, though some offer one.
Brown Bag shows claims only where a patient's insurer offers such an API.

## Fixes added 2026-11-23 (the developer: fix what could be wrong on the list)

- Claims marked cancelled, draft or entered-in-error, and preauthorizations
  and predeterminations, aren't fills.
- Missing or partial dates read "date not given", "Sep 2026" or "2026".
- Fill-only cards for one drug join when the code matches, or the name
  matches apart from case and the [Brand] part. Different strengths stay
  apart (Claude's call). An "I stopped this" under either old card holds.
- An ingredient match goes to a current medicine before a finished one.
- The line names the record's own status: "Marked completed", "Marked
  stopped", "Marked canceled", "Marked not taken", else "Not current in
  your records". The QR note matches.

## Left to the builder

- Exact module and function names.
- Whether `type=pharmacy` works as a search parameter on the sandbox.
- How fills are stored on the saved copy.

## Calls made by Claude, for the developer to check

- Wording "No fill found in your claims", never "not filled".
- A patient with no claims at all sees nothing about fills, rather than
  "No insurance fill found" on every card.
- Fill-only items within 12 months count as current.
- Costs and copays are left out.
