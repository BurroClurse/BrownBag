# Fills on Health records

Approved by the developer 2026-11-24 (insurance fills, plus pharmacy or anything else).

**Why:** the screen under More options dates the medicines and allergies, but a
patient can't see whether insurance fills are current.

**What:** two more lines on the SMART sandbox card. "Insurance fills last
updated" and the date, only when they loaded; else "None found" with the date,
"Sign in again to add them" or "Not loaded". "Pharmacy fills: Not connected",
because no pharmacy sends Brown Bag anything. A new source gets its own line
when it is connected.

**Changed the same day (the developer):** the pharmacy line moved to the Not connected
card, as "Pharmacies: Pharmacy fills", on Health records and the sign-in list.
Pharmacies aren't part of the sandbox.

**Approaches:** a new Your data screen (repeats this one) or lines on this
screen (chosen: one place to look).

**Not in this:** a count of what the patient added (the developer, 2026-11-24). The QR
code and the staff page don't change.
