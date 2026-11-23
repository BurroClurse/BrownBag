# Limits on keeping the list up to date

What can keep Brown Bag's list from matching what the patient really takes,
and what we do about each (Tyler, 2026-11-23). Check a box when a limit is
solved or handled well enough; add new ones at the end. Ideas are not plans:
an idea becomes a plan only after its own design.

- [ ] **1. The list only updates when the app is open, with signal.** A web
  app can't fetch in the background.
  - Now: the saved list shows its date; opening updates it in place.
  - Ideas: remind the patient to open it before an appointment (calendar
    file, or a Home Screen app push once iPhone and Android allow it for
    this app); an app-store version with background refresh.
- [ ] **2. Health records are only as current as the last visit.**
  "Completed" and "stopped" can be wrong for months.
  - Now: a completed prescription filled again after it was written moves
    back to current; "I stopped this" and added medicines are the
    patient's own.
  - Ideas: show "last updated by your clinic" per medicine; send changes
    back to the clinic (FHIR write, needs the clinic's permission).
- [ ] **3. Claims arrive late.** Medicare Part D: five times a week in Blue
  Button v3 (weekly in v2, CMS's pages disagree; check on real data). Other
  insurers under CMS-9115-F: within one business day after the claim is
  processed.
  - Now: each card shows the last fill date and the insurer.
  - Ideas: pharmacy fills directly (CMS Aligned Networks, SMART Health
    Links at pickup).
- [ ] **4. Some medicines are in no source:** cash, discount cards, free
  samples, over-the-counter.
  - Now: the patient adds them; the add check catches duplicates.
  - Ideas: scan the bottle's barcode; "upload to Brown Bag" from a pharmacy.
- [ ] **5. Every source is its own sign-in, and some can't stay signed in.**
  Epic and Aetna give a browser app no refresh token; Medicare and the
  SMART sandbox do.
  - Now: one unlock for the sandbox; the pass renews.
  - Ideas: hold those sources' secrets on the small server so they renew
    too (Epic confidential client); a connection service.
- [ ] **6. Not every insurer has to share.** Medicare Advantage, Medicaid,
  CHIP and HealthCare.gov plans must (CMS-9115-F, CMS-0057-F); most employer
  plans don't.
  - Now: "No fill found" only when every connected insurer answered (from
    the Medicare build on).
  - Ideas: connection services that reach employer plans.
- [ ] **7. Patients can withhold things.** Medicare: demographics, and
  substance use claims in v3.
  - Now: without name and birth date, Medicare fills aren't added (Medicare
    build).
  - Ideas: say plainly on the Medicare screen what is being left out.
- [ ] **8. Sources disagree** (two strengths, stopped in one and current in
  another).
  - Now: one card per drug, the source named, "Marked completed (or stopped), but filled"
    and "dose changed" lines; the patient and care team decide.
  - Ideas: a "differences to check" screen for the person at the desk.
- [ ] **9. Sandbox only.** Real patients need each company's production
  review, and a public privacy policy (Brown Bag has none yet).
- [ ] **10. The public SMART sandbox resets nightly,** so made-up demo
  patients (Avery Brownbag) disappear.
  - Ideas: the SMART team adds Avery to the built-in data (Tyler holds the
    request).
- [ ] **11. Allergies are only what the records and the patient say.** The
  SMART sandbox has no reactions and none marked as medicine allergies
  (2026-11-23: 372 in all, 369 food, 3 environment), so in a demo those come
  from the patient.
  - Now: the patient adds allergies and reactions; a missing reaction, a
    failed load, and an entry that doesn't say what it's to are all said.
  - Ideas: Epic's sandbox; warnings against medicines are left to the care
    team.
