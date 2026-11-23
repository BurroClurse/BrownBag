# Brown Bag: design

Status: approved by Tyler 2026-11-17, with accessibility, the Safari storage
guard, dose-change grouping, disclaimer, Android and the sign-in check added
the same day.

## Why

Medication lists are often wrong when a patient checks in. Stopped medicines
stay on the list, store-bought medicines and supplements are missing, and
each doctor's office only knows what it prescribed. A pharmacist's "brown bag
review" fixes this by having the patient bring every bottle. Brown Bag is
that bag on the patient's phone.

Purpose sentence: *Brown Bag helps patients give every healthcare worker an
accurate medication list by gathering their medicines from all their records,
adding what they buy over the counter, and sharing it with one QR code.*

Evidence gathered during planning: pharmacists found medication mistakes in
48% of US ER patients (JAPhA 2026, doi 10.1016/j.japh.2026.103483); a single
list shared by doctor, home care and pharmacy cut mismatches from 389 to 122
(BMC HSR 2021, doi 10.1186/s12913-021-07346-8).

## Who

Patients. Fall 2026 is patient-facing only. A staff screen is a later idea.

This is the HL7 Break the Code course app (one app per semester). Staff said
the app passes when it completes SMART sign-in, reads FHIR data, and Tyler can
explain how. Tyler also wants it to be able to grow into a real product.

## Goals

- One clean, current medication list built from the patient's records.
- The patient's own additions (OTC medicines, vitamins, supplements) on the
  same list, clearly marked as theirs.
- One QR code that shows the list to whoever scans it.
- Super simple. A patient who is not technical can use it.

## Non-goals (this fall)

- Staff or nurse screen.
- Insurance, billing, denials.
- Caregivers managing several people.
- Last dose taken (Tyler: not realistic).
- Writing anything back into a doctor's records.

## Anti-goals

- A list that looks complete but silently drops medicines. If the app can't
  read a source, it says so on screen.
- Health data sent anywhere the patient didn't choose.

## Constraints

- Starter code: static HTML on GitHub Pages, fhirclient.js 3.0.1, standalone
  patient launch against the SMART Health IT R4 sandbox
  (`launch.smarthealthit.org`). No server of our own.
- The sandbox is one FHIR server with synthetic patients. It has
  MedicationRequest (prescriptions) and MedicationStatement ("what the patient
  says they take") records, and no MedicationDispense (pharmacy fill) records.
- Retail pharmacies don't offer patient SMART access. Pharmacy fill data
  reaches apps through the patient's health plan (Patient Access API). That is
  a later source, read-only, with no insurance features (Tyler: yes, later,
  2026-11-17). Fills paid in cash or with a coupon won't appear there.
- Patient access APIs are read-only. The app cannot fix a doctor's chart.
- About three weeks of build time left in the fall sequence.
- Work is backed up to the public `BurroClurse/BrownBag` repo on branch
  `brown-bag-v1` (Tyler, 2026-11-17). `main` is the live GitHub Pages site and
  only changes when Tyler says so. The repo is public, so anyone can read the
  code and these documents. Testing during the build runs
  on Tyler's Mac, with his phone opening it over home Wi-Fi (Tyler,
  2026-11-17). Camera access, encryption and passkeys all need https, so the
  local test server runs https (see Security).

## Approaches considered

1. **Patient screen only (chosen).** Smallest build, matches the course
   video, and the list is what both sides need anyway.
2. Patient screen plus a nurse screen in one app. Two sign-ins and two
   screens. Tyler: too much work for now.
3. Nurse screen only (ER med history helper). Easier to sell to hospitals,
   but moves away from the patient carrying the list. Parked.

QR approaches:

1. **QR opens a read-only page on GitHub Pages, with the list packed into the
   part of the link after `#` (chosen for fall).** Browsers don't send that
   part to the web server, so GitHub never sees the list. Any phone camera can
   open it. Staff read it. They can't import it into their records system yet.
2. SMART Health Link (the national standard behind Kill the Clipboard). The
   QR points to an encrypted file that records systems can import. Needs a
   small server to hold the file, and the receiving system must support it.
   Later. The fall version packs the list in the same FHIR shape so this
   upgrade doesn't change the data.
3. The whole FHIR list inside the QR as raw data. No records system reads
   this, and it runs out of room fast. Rejected.
4. Brown Bag issuing its own SMART Health Cards (HL7 SMART Health Cards and
   Links IG, hl7.org/fhir/uv/smart-health-cards-and-links). Rejected. A card
   is trusted because a known issuer signs it and publishes its public key.
   Brown Bag has no server to keep a signing key, so scanners would show
   "issuer not recognized". Signing would also make the patient's own
   additions and "stopped" marks look confirmed by a provider. A card holds
   about 1,200 characters, less than the fall QR's 2,331 bytes.

Borrowed from SMART Health Cards for the fall QR (Tyler, 2026-11-20):

- **Trimming rules.** The shared Bundle follows the guide's FHIR Bundle
  minimization rules: no resource ids, no meta, no narrative text, and
  `resource:N` references with matching `entry.fullUrl` values. One
  exception: the medicine name stays in `medicationCodeableConcept.text`,
  because `share.html` reads offline and can't look names up. The Bundle is
  already small, so this mostly makes the data match the guide; the size
  gain is small.
- **Digit encoding.** QR codes pack digits more tightly than letters. As in a
  Health Card, the packed list after the `#` is written as digits (each
  base64url character becomes two digits, its character code minus 45), and
  the QR is built from two parts: the web address as text, the list as
  digits. About 15 to 20% more medicines fit in one code. Nothing changes on
  screen.

## The three features

### 1. One medication list from all sources

- Read the patient's MedicationRequest and MedicationStatement records (and
  Medication when a request points to one).
- Remove duplicates: group by RxNorm code; keep the newest record in each
  group; show "prescribed 6 times since 2019" instead of six rows.
- Group strengths of the same medicine by active ingredient (RxNav), so
  lisinopril 10 mg and 20 mg become one line that says "dose changed from
  10 mg to 20 mg on 2024-05". If RxNav can't be reached, fall back to grouping
  by exact product.
- The real sandbox data is looked at before these rules are final.
- Show for each medicine: name, strength, dose, route, how often, start and
  end dates, who prescribed it, and which source it came from.
- Current medicines first. Older or stopped prescriptions sit under a
  collapsed "Older prescriptions" heading.
- "I stopped this" button on each one. The medicine moves to a "Stopped by
  me" group. It stays on the QR list in a "Patient says stopped" group, so
  staff see that their chart is out of date (Tyler, 2026-11-17).
- Built so more sources can be added later (a second health system, health
  plan pharmacy claims). Fall connects to one: the SMART sandbox.

### 2. Your own additions

- "Add a medicine or supplement": the patient types a name, picks from
  matches in RxNorm (the National Library of Medicine's free drug list, via
  its RxNav lookup service), then sets how much and how often.
- Labelled "Added by me" everywhere, including on the QR list.
- Saved on the patient's own device (browser storage), keyed by patient. If
  they clear their browser, these are lost; the screen says so.
- iPhone Safari deletes a site's saved data after 7 days of Safari use
  without visiting it. Two guards: the app asks the patient to add Brown Bag
  to their Home Screen (apps there are exempt), and "Save a backup" writes an
  encrypted backup file the patient keeps in Files or iCloud, with "Restore"
  to bring it back.

### 3. Share by QR code

- "Show my QR code" makes a code from: current chart medicines, the ones the
  patient marked stopped, the patient's additions, and name and birth date.
  Older prescriptions are left off (Tyler, 2026-11-17).
- Scanning it opens `share.html`, a read-only page showing the list in large
  print in three groups, "From records", "Added by patient" and "Patient says
  stopped", with the date the code was made.
- The code comes with a 6-digit share code shown to the patient, who reads it
  out to the staff member (see Security). Without it the list can't be read.
- If the list is too long for one QR code, say so and offer the on-screen
  list instead.

### Works with no signal (Tyler, 2026-11-20)

An ER or a basement clinic may have weak Wi-Fi and no cell signal. Sign-in
ends when the app closes, so without this the patient couldn't load their
records list there, and couldn't make a QR code.

- Each time the records list loads, Brown Bag saves a copy in its encrypted
  storage on the phone, with the date it was saved.
- The app's own files (pages, scripts, the QR library) are kept on the phone
  by a service worker (a small script the browser runs to keep a site's
  files for offline use), so the app opens with no connection.
- With no connection, the patient unlocks with Face ID, fingerprint or PIN as
  usual (this works offline) and sees the saved list under a notice: "No
  connection. Showing your list saved on Nov 20, 2026. It may be out of
  date." The notice is text, not just a color.
- "Show my QR code" works the same offline, with the same 6-digit code.
- The service worker never keeps health data. Records and RxNav lookups are
  never cached by it, only the app's own files. Health data stays in the
  encrypted storage.
- The staff member's phone or computer still needs a connection to open
  `share.html`. Hospital devices usually have one.

## What the patient sees

```
┌──────────────── Brown Bag ──────────────────┐
│ Jane Example · born 1961-04-02              │
├──────────────────────────────────────────────┤
│ FROM YOUR RECORDS                           │
│  Lisinopril 10 mg tablet · by mouth · daily │
│   Dr. Patel · since 2023-03 · SMART sandbox │
│   [ I stopped this ]                        │
│  ▸ Older prescriptions (12)                 │
├──────────────────────────────────────────────┤
│ ADDED BY ME                                 │
│  Vitamin D3 2000 IU · daily                 │
│  [ + Add a medicine or supplement ]         │
├──────────────────────────────────────────────┤
│ STOPPED BY ME                               │
│  Metformin 500 mg · stopped 2026-10         │
├──────────────────────────────────────────────┤
│        [ Show my QR code ]                  │
└──────────────────────────────────────────────┘
```

## Information and FHIR resources

| Information | FHIR resource | Details shown |
|---|---|---|
| Who the patient is | Patient | Name, birth date |
| Prescriptions | MedicationRequest | Drug, dose, route, frequency, dates, prescriber, status |
| What the record says they take | MedicationStatement | Drug, dose, dates, status |
| Drug details when referenced | Medication | Name, strength, form |
| Who prescribed it | Practitioner (via requester) | Name |
| Patient additions | None on the server; stored on device, packed as MedicationStatement on the QR | Name, dose, how often |

Sign-in scopes grow from `patient/Patient.read` to add
`patient/MedicationRequest.read`, `patient/MedicationStatement.read`,
`patient/Medication.read`, and `patient/Practitioner.read`, keeping the
starter's `.read` style.

## Disclaimer

Shown on the main screen and on `share.html`: "This list is what you and
your records say. Your care team confirms it."

## Accessibility

The app meets WCAG 2.2 level AA (Tyler, 2026-11-17). In practice:

- Text contrast at least 4.5 to 1, and meaning never shown by color alone.
- Works at the phone's largest text size without cutting off or scrolling
  sideways.
- Every button and field has a label a screen reader reads aloud. Checked with
  VoiceOver on iPhone and TalkBack on Android.
- Buttons at least 44 by 44 points. A visible focus outline for keyboards.
- Everything works with a keyboard alone. The QR screen also shows the
  6-digit code as text.
- Respects the phone's reduce motion setting.
- An automated check (axe) runs on every page with no serious issues.

## Platforms

Tested on iPhone (Safari and Home Screen) and Android (Chrome), plus desktop
browsers. If Tyler has no Android phone, the Android emulator is used.

## Staying signed in

Sign-in lasts while the page is open (fhirclient keeps it in
sessionStorage). Reopening the app means signing in to each source again.
Staying signed in needs refresh tokens (`offline_access`). The build checks
whether the SMART sandbox offers them and records the answer. Not built this
fall.

Checked 2026-11-17: the SMART sandbox's `.well-known/smart-configuration`
lists `offline_access` in `scopes_supported` and `permission-offline` in
`capabilities`, so staying signed in can be built against it later.

## Security

Tyler asked for encryption, fingerprint unlock and two-factor sign-in
(2026-11-17). What each one means here:

**Encryption in transit (TLS).** Already covered. GitHub Pages serves the app
over https, and the SMART sandbox and RxNav are https only, so everything the
app sends or receives is encrypted on the way. A reverse proxy (a server that
sits in front of an app) isn't needed while the app is static files. It comes
back with the SMART Health Link server in Later, which must be https only.

**Encryption on the device.** The patient's additions and "stopped" marks are
encrypted before they go into browser storage (Web Crypto, AES-GCM). The key
comes from the fingerprint or Face ID unlock below where the phone supports
it (passkey PRF), or from the patient's PIN where it doesn't. The FHIR sign-in
session stays where fhirclient.js keeps it (sessionStorage), which clears when
the tab closes.

**Fingerprint or Face ID lock.** Opening Brown Bag asks for the phone's
fingerprint, Face ID, or device PIN (a passkey, through WebAuthn) before the
list shows. First use sets it up. Phones or browsers without passkey support
fall back to a 6-digit app PIN. With no server, this is a lock on the device,
not an account login.

**Two-factor sign-in.** The app has no accounts of its own. Signing in to
records happens on each health system's own login page (MyChart and the
others), so their two-factor sign-in applies there. Brown Bag's own second
factor is the device lock above. The SMART sandbox has no real login, so the
fall version can't show two-factor sign-in.

**QR code protection.** The list inside the QR link is encrypted. The key is
split: part travels in the link, and part is a 6-digit code the patient reads
out to the staff member, who types it on `share.html`. This stops anyone who
only photographs the code from reading it. Without a server nothing can limit
guesses, so a determined attacker with the photo could still break it. The
SMART Health Link server in Later fixes that by limiting PIN attempts and
expiring links.

**Testing.** Web Crypto and passkeys only run on secure pages: https or
`localhost`. A phone opening the Mac over home Wi-Fi by plain address is not
secure. The local test server must use https with a local certificate
(mkcert), and Tyler's phone must trust that certificate once. No outside
tunnelling services, since that would send data off the Mac.

Fall builds: encryption on the device, the device lock, and QR protection.
TLS is already there. Two-factor sign-in belongs to each health system.

## Later

- Scan home bottles and store packages with the camera, match them to the
  list, and flag differences (upgrade to feature 2).
- Pharmacy fills through the health plan's Patient Access API, read-only.
- A second real source, such as Epic's or Oracle Health's public test system.
  Epic first, when Tyler picks it up again (parked 2026-11-23 to focus on the
  SMART sandbox). His choices: one system at a time, so sign-in offers either
  sandbox and home shows the one signed in to last, ending at a demo with
  Epic's test patient; combining two systems' lists is its own later design.
  Ask open@epic.com about the Client ID in a browser app before adding it to
  this repo. Before making an account, read
  [Epic's terms](https://fhir.epic.com/Resources/Terms) and ask the
  instructors about the responsibility they put on the developer. Brown Bag
  needs the trademark sentence, a privacy page and an erase button on More.
- SMART Health Link QR codes that records systems can import. The link can
  also carry signed SMART Health Cards the patient already has from their
  providers (vaccine records, CARIN digital insurance card), so staff see
  those as verified next to Brown Bag's patient-reported list (Tyler,
  2026-11-20).
- Provider Health Cards inside Brown Bag. The patient adds signed SMART
  Health Cards they already have (vaccine record, lab result, insurance
  card) and Brown Bag keeps them in its encrypted storage to show offline.
  Scanners verify them; anyone who scans one can read it. Needs a second
  source that issues cards: the SMART sandbox can't (checked 2026-11-20).
  Course staff suggested Epic's sandbox; Oracle Health documents the issue
  operation; the Inferno test kit only checks cards. Provider cards hold
  vaccines, labs and insurance, not medication lists. Moved to Later by
  Tyler, 2026-11-20.
- Allergies with the reaction, health history, implanted devices, emergency
  contact.
- Staff screen (Med History Helper).
- Native iPhone and Android apps, Apple Wallet and Google Wallet.
- Staying signed in with refresh tokens.

## Future updates and watch items (Tyler, 2026-11-17)

Course:
- The course may need a live link. If showing the app requires its GitHub
  Pages address, merge `brown-bag-v1` into `main` before that date. Ask staff
  (questions are in the calendar note for the Nov 18 session).
- Backups: the code lives on Tyler's Mac and on the `brown-bag-v1` branch on
  GitHub, so a dead drive doesn't lose it.
- A classmate's app, MyMedBridge, covers similar ground (prescribed
  medicines, allergies, prescription vs. reported use). Brown Bag's
  differences for any demo: the QR sharing, the "Stopped by me" list, the
  over-the-counter additions, and the lock.

If it becomes a business:
- Privacy law. HIPAA mostly doesn't cover a consumer app like this, but the
  FTC Health Breach Notification Rule does: users must be told if their health
  data leaks. A privacy policy is needed.
- The QR link points to `burroclurse.github.io`. Staff may trust a proper
  domain more, such as `brownbag.app` if it's available.
- Allergies. Nurses almost always ask for them next.

## Left to the builder

- Exact duplicate rules once the sandbox data has been looked at (records
  with no RxNorm code, same drug at different strengths).
- How "current" is decided from MedicationRequest status and dates.
- Page layout and styling, within "super simple".
- Packing and compressing the QR data, and the QR library (from an allowed
  CDN).
- Whether RxNav allows calls straight from the browser; if not, a fallback.

## Calls made by Claude, for Tyler to check

- QR opens a read-only page with the list after `#` in the link, instead of
  a SMART Health Link, for the fall.
- Duplicates grouped by RxNorm code, newest record kept.
- Patient additions stored on the device only.
- Drug lookup through the National Library of Medicine's RxNav service.
- Security: passkey (fingerprint or Face ID) lock with a 6-digit PIN
  fallback, device storage encrypted, QR list encrypted with a spoken 6-digit
  code, local https testing with mkcert.
- SMART Health Card trimming rules applied with one exception: the
  medicine name stays in the shared Bundle, because `share.html` works
  offline.

## Spring (answered by course staff, 2026-11-20)

- Keep building Brown Bag in the spring and add a provider-facing side. No
  need to start a new app.
- Spring adds AI components and topics like AI transparency and
  provenance (a record of where each piece of data came from). Brown Bag's
  "From records", "Added by patient" and "Patient says stopped" labels are
  already a simple form of provenance, and FHIR has a Provenance resource
  for it.

## Still open

- Nothing that affects the fall build.
