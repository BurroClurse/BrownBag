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
    back to current; "Not taking", "As needed" and added medicines are
    the patient's own.
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
  - Ideas: scan the bottles (Tyler, 2026-11-24, for later): read each label,
    fill in the medicine, update the one already listed, skip duplicates. The
    patient checks each one before it's saved; the photo stays on the phone.
    Needs a library or a service to read the label, so ask first. Also
    "upload to Brown Bag" from a pharmacy.
  - ML (Tyler, 2026-11-25): the first place Brown Bag would use a trained
    model. Reading the label (text recognition, then the drug, strength and
    directions) runs on the phone, so the photo never leaves it; the model is
    small, loads from Brown Bag's own address, and works with no signal. It
    only fills in the add form: the patient checks every field, and the add
    check runs as for typing. Trained (for example in Colab) on public and
    synthetic label images only, never real patients' photos.
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
  review, and a public privacy policy.
  - Now: `privacy.html` (2026-11-24). Before real patients: a lawyer reads it,
    and Questions gets an email address instead of GitHub issues.
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
- [ ] **12. Most allergens and reactions the patient picks go as words.** Only
  drug ingredients (and bee venom) have a code, from RxNorm.
  - Ideas: SNOMED CT codes, once there is a UMLS license; they are checked
    and listed in the allergies design. Route codes are SNOMED too, so a route
    goes in the QR code as words.
- [ ] **13. Backups made before backups were sealed (2026-11-23) aren't
  protected.** They can be relabeled, and ones made with a PIN can be opened by
  trying every PIN.
  - Now: new backups are sealed to each person, and PIN backups have a long
    password.
  - Ideas: stop opening the old kind once nobody needs them.
- [x] **14. Signed out, on Wi-Fi that doesn't reach the internet, the saved
  list can't be opened.** The phone says it has a connection, so only Sign in
  shows. The same goes for a health system that's down.
  - Now (2026-11-24): a sign-in that couldn't start offers Open my saved list,
    behind the lock. With no signal, the signed-out screen offers it.
- [ ] **15. A QR code never expires, and its 6 digits can be guessed.** Someone
  with a picture of it could try all million codes on a computer.
  - Now: the privacy page says so; a new code is made each time.
  - Ideas: SMART Health Links, which can expire but need a server.
- [ ] **16. A record that names a drug only by its package number (NDC) can show
  beside the same drug from another record.** They join only when the names match.
  Seen once: a patient another student added to the sandbox (saved 2026-11-20 in
  `tests/fixtures/`). None of the app's test patients.
  - Now: both show, so nothing is hidden. The NDC goes in the QR code when it fits.
    A fill coded only by NDC gets its RxNorm code from RxNav by the fill's date
    (2026-11-25); a record coded only by NDC doesn't yet.
  - Careful: joining two cards joins their marks. If the patient marked one copy
    Not taking to tidy the list, the one they take must not go with it.
  - When (Tyler, 2026-11-24): with Medicare, its fills first, then joining cards.
  - Ideas: look up the NDC in RxNav by the record's date (Medicare plan, Task 1),
    join only cards with no marks, and make a mark on the joined card cover all.
- [ ] **17. A medicine or allergy found in two places names only one of them.**
  - Now: one source is connected, so nothing is missing yet.
  - When (Tyler, 2026-11-24): with the second source. The card and the QR code
    say "Source: SMART sandbox and Epic", and the unnamed allergy row names its
    source too.
- [ ] **18. Names alone often don't join.** openFDA and DailyMed write one medicine
  many ways ("LISINOPRIL TABLET", "Lisinopril", strength "40 mg/1"), with package
  numbers with or without dashes, and brand or generic (looked at 2026-11-24).
  - Now: one RxNorm code is one card. Without codes both show, so nothing is hidden;
    `tests/spellings.test.mjs` holds the examples. Typing Tylenol with Acetaminophen
    listed, and no code or connection, isn't asked about.
  - Careful: one FDA product can list several RxNorm codes, for different strengths,
    so the first one can't be taken. Dropping "tablet" and strengths from names could
    join a regular and an extended-release tablet.
  - When (Tyler, 2026-11-24): with Medicare, which brings package numbers.
- [ ] **19. The QR code only works with Brown Bag's own staff page.** Staff read
  the list and type it in; a clinic's system can't take it in, and it holds about
  seven medicines with codes before codes are dropped.
  - Now: Brown Bag's own encrypted link (prefix `v3.`), built on the phone, works
    with no signal and no server, and "Save as FHIR file" gives an IPS file.
  - Idea (Tyler, 2026-11-25): a second QR code for the same list, a SMART Health
    Link carrying the IPS file, so a clinic's system can read it. A flip on the QR
    screen: one side today's code, the other the SMART Health Link. The flip is a
    labelled button, not only a gesture. Today's code stays the default and the
    one that works with no signal.
  - Careful: a SMART Health Link always points to an encrypted file on a server,
    so this needs a small store (the Medicare plan's Netlify function is the
    precedent) and a signal when it's made. Its passcode is checked by the
    server, unlike today's 6-digit code, which is half the key.
  - When it comes: its own design (shared with reading incoming SMART Health
    Links); the privacy page says what the store keeps, for how long, and how
    it's deleted; and the README says Brown Bag is built for server deployment.
- [ ] **20. Nothing checks Brown Bag's FHIR against HL7's own rules on every change.**
  The tests check Brown Bag's rules, not the FHIR standard's, so a shape HL7
  wouldn't accept can slip in.
  - Now: HL7's FHIR validator is run by hand on test data when a design asks for
    it (the FHIR file design, and the IPS file's `DetectedIssue`).
  - Idea (Tyler, 2026-11-25, from looking at github.com/anpheros): a GitHub Action
    that runs HL7's validator (`validator_cli.jar`, FHIR 4.0.1, IPS 2.0.1) on every
    push, against the test fixtures and the IPS file Brown Bag makes from them.
    Run it on GitHub, not through someone else's validation service, so the files
    never leave GitHub.
- [ ] **21. The patient can't see when each source was last read.**
  - Now: Health records under More options shows when the medicines, allergies and
    insurance fills last updated, for the one connected source.
  - Idea (Tyler, 2026-11-25, from looking at github.com/anpheros, whose patients see
    an access log): with several sources, a short per-source line of when Brown Bag
    last read it and what it read (medicines, allergies, fills), kept on the phone
    with the list. Only Brown Bag's own reads: it can't see who else reads the
    record.
- [ ] **22. Reconciliation has never met a real second health system.** Its second
  source is the home server's test clinic, a file served beside the app.
  - Now: the test clinic follows the signed-in sandbox patient (Loria Jenkins,
    or the made-up Riley Reconcile and Jordan Partial from
    `tools/reconcile-patients.mjs`).
  - Careful: two vendors' sandboxes have different made-up patients, so
    Brown Bag's same-person check would keep them apart, and connecting Epic's
    sandbox beside the SMART sandbox would only ever show "someone else".
    Anpheros' sandbox (looked at 2026-11-25) is also European and ATC-coded,
    and US sources only is the scope for now (Tyler, 2026-11-25).
  - Idea: two records for the same made-up person on the SMART sandbox, which
    lets us add patients (same name and birth date, different ids, different
    medicines), connected as two separate sign-ins. That's how one person ends
    up with two charts in real life. It needs Brown Bag to hold more than one
    connection, which comes with Medicare (connections design).
- [ ] **23. Matching has been tested on dozens of cases, not tens of thousands.**
  A real app would meet tens of thousands of records from many sources, and
  the rare shapes only show up at that scale.
  - Now: hand-made fixtures, the real sandbox records, Riley Reconcile and
    Jordan Partial, and the 54 real-world cases in
    `docs/superpowers/research/2026-11-25-messy-data-findings.md`.
  - Idea (Tyler, 2026-11-25): test on tens of thousands of records and many
    data sets before real patients.
    - **Generated, with known answers:** Synthea (open source, runs on a
      laptop) makes thousands of synthetic patients in FHIR R4. A Brown Bag
      tool copies each into two or three "sources" and roughs them up the way
      the findings show real sources do (codes at other levels, brand for
      generic, ".5 mg", "QW", "LAST, FIRST", a datetime birth date, a typo).
      Because the tool did the roughing up, it knows which records are the same
      medicine and the same person, so every run can count wrong joins and
      wrong splits, not just pass or fail.
    - **Real public data:** openFDA's NDC directory and FAERS drug names
      (millions of strings people typed), RxNorm's full list of current
      products, and CMS's synthetic Medicare claims.
    - **What to measure:** wrong joins (two medicines or two people made one)
      should be zero. Wrong splits are the cost of being careful. Also the
      time to reconcile a long list on an old phone.
    - **Careful:** credentialed real-patient sets (for example MIMIC) can't go
      in the repo or near the app. Before real patients, a pharmacist reviews
      the matching rules, and Brown Bag is still not a medical device.
  - Testing aid (Tyler, 2026-11-25): a Google Colab notebook, "Brown Bag Matching
    Check", built and run once on 40 Synthea patients. It roughs records up four
    ways for medicines and five for people, asks Brown Bag's own `matchOf` and
    `samePerson` about 4,026 pairs, and counts wrong joins and wrong splits; a
    gradient-boosting model then flags the pairs worth a person's review, and
    tries real openFDA product names. Its first run, before Tasks 6c and 6d,
    found 176 wrong joins, all finding D1 (an ingredient code listed first, so
    acetaminophen joined acetaminophen with oxycodone). The model stays a test
    tool and never goes into the app.
- [ ] **24. Directions written in different words read as different.** "Take 1
  tab PO BID" and "1 tablet by mouth twice a day" are the same, but unless both
  are coded, Brown Bag calls them "worded differently", which goes to staff only.
  - Now: the words are compared after small clean-ups (add-check.js `words`).
  - Idea (Tyler, 2026-11-25): a small trained model reads free-text directions
    (dose, route, how often, as needed) into the same parts FHIR codes. It only
    suggests: two directions it reads the same stop counting as worded
    differently, but it never settles a dose or schedule disagreement, never
    changes what the record says, and the rules stay the fallback. Runs on the
    phone, offline, from Brown Bag's own address. Trained on public and
    synthetic directions (FAERS, openFDA labels, Synthea, the research's
    examples), never real patients'. A pharmacist checks its rules before real
    patients.
