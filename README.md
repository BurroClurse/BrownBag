# Brown Bag

**Every pill bottle, without the bag.**

<img src="assets/BrownBagLogoReadme.png" alt="Brown Bag logo" width="320">

Brown Bag helps patients give every healthcare worker an accurate medication
list. It gathers their medicines from their health records, adds what they
take over the counter and their allergies, and shares the whole list with one QR code.

The records come from the patient's own health system, the hospital or
clinic whose patient portal they already use. They sign in with that portal
account, and Brown Bag reads their prescriptions and listed medicines
through SMART on FHIR, which US certified health record systems must offer
to patient apps. It adds pharmacy fills from insurance claims, showing what
was actually picked up. Today it connects to the SMART Health IT sandbox
(test patients only), whose claims stand in for an insurer's.

The connections screen also names, under **Not connected**, what Brown Bag may add later:
Epic, Oracle Health and MEDITECH (health systems), Medicare and Medicaid
(insurance), and pharmacy fills. The test systems looked at so far, and why each
fits or doesn't, are in [`docs/SANDBOXES.md`](docs/SANDBOXES.md).

It's built to be simple: one main screen, big buttons, plain words, and made to
WCAG 2.2 AA. It's static pages with no Brown Bag server: everything runs on the
patient's phone, and the staff page in the staff member's browser.

**Live:** <https://burroclurse.github.io/BrownBag/> (sandbox data
only, no real patients). To open it as a certain patient, see
[Test patients](#test-patients).

This README has two halves: the **front end**, what the patient and the person
checking their medicines see, and the **back end**, what happens behind the
screen to make that work.

## Front end: what people see

### The patient

**Signing in**
- **First run:** set up the lock (Face ID, a fingerprint or a 6-digit PIN), then
  **Connect your health records** lists the sources. **Connect** on the SMART
  sandbox opens a list of 20 test patients. After each sign-in the patient
  unlocks and comes back to that screen to connect the next; **Done** goes home.
  The same screen is **Health records** under More options.
- After that, the lock opens Brown Bag and the list updates by itself. It locks after 5 minutes without a tap or
  away, and the connection ends after 30 days unused.
- **Sign out** is for everyone on the phone. Saved lists stay, locked.

**Home** has their first name and last initial, **Show my QR code**, **My medicines
(N)** and **More options** (Health records, backups, the Home Screen, Privacy, Sign out).

**My medicines**
- **Allergies** come first, in their own box: closed, it names them and counts the
  severe ones; open, it has each reaction and who says so. The patient can add one, add or change their reaction, or say they have none
  known. A record that names no allergen is the last row; the patient can say
  what it is, or remove it if it repeats another. Staff still see the record.
- **Medicines** from the records: repeats merged, strengths of one drug grouped,
  directions in full, on-hold ones marked, older prescriptions folded away.
- **As needed** and **Not taking** move a medicine to its own part, with Undo.
  A prescription dated after a Not taking mark puts the medicine back on the list.
  **I'm taking this**, on an older prescription, asks first.
- **Filled**: how many times, and when last, from insurance claims. A prescription
  the record calls finished but filled since is current again, and says so. Fills the
  record doesn't list get their own part.
- **Add a medicine** uses lists for how much and how often, checks the name
  against RxNorm, and asks when it's already there or looks like one that is.
  Added ones can be edited.
- **Sort** by name, newest, or who prescribed it.

**The QR code**
- It fills the screen; Close or a swipe crumples it into the bag. The patient tells
  staff the 6-digit code, hidden until tapped.
- **See what's inside** shows everything in the code on the patient's own phone,
  and can save the FHIR file too.
- It says when the medicines and allergies were last updated. Changes made with no
  signal are in it, and listed on the screen.

**When things go wrong**
- **No signal:** the last list is kept encrypted on the phone, and the QR code
  works. The list updates when the signal is back, or says to sign in again.
- **Signed out with no signal, or a sign-in that couldn't start:** Open my saved list.
- **Interrupted while adding:** what was typed is kept until Brown Bag locks or
  closes, and home says it isn't saved.
- **Slow connection:** a file that doesn't arrive is tried once more, then Brown
  Bag says what to do.
- **New phone:** a backup holds what the patient added or marked, never a sign-in,
  sealed to each person. With a PIN, it gets its own long password.

### The person checking medicines

- They scan the QR code and type the patient's 6 digits on `share.html`.
- Allergies come first, then the medicines in parts: from records, filled but not
  in the health record, as needed, added by the patient, and what the patient
  says they're not taking. Each says who says so, and when it was last updated.
- **Save as FHIR file** saves an
  [International Patient Summary](https://hl7.org/fhir/uv/ips/) (2.0.1), after a
  warning that it isn't locked. A list where something didn't load can't be saved.

## Back end: what happens behind the screen

There's no Brown Bag server. All of this runs in the patient's browser (and, for
the staff page, the staff member's), and talks only to the servers named here.

### Signing in

**Launch.** The app's connections screen lists the sources. Connect on the sandbox opens `launch.html`'s test patients; choosing one (or a link
that names its server with `iss`) starts a patient standalone launch with
`FHIR.oauth2.authorize()` ([fhirclient](https://github.com/smart-on-fhir/client-js)
3.0.1, PKCE, public client). Scopes:

```
launch/patient openid fhirUser offline_access patient/Patient.read
patient/MedicationRequest.read patient/MedicationStatement.read
patient/Medication.read patient/Practitioner.read
patient/ExplanationOfBenefit.read patient/AllergyIntolerance.read
```

Every resource scope is read-only. `offline_access` asks for a refresh token
([SMART App Launch: scopes](https://hl7.org/fhir/smart-app-launch/scopes-and-launch-context.html)).

**The refresh token** is stored encrypted (AES-GCM) with a key that comes
from the passkey (WebAuthn PRF) or the PIN (PBKDF2, 600,000 rounds). It is
never put in a backup file. It is deleted on Sign out, when the token server
refuses it, or after 30 days unused. Sign out is for everyone who signed in
on the phone: every refresh token is deleted first, then each server whose
SMART configuration offers a `revocation_endpoint` is told to end its side
([RFC 7009](https://www.rfc-editor.org/rfc/rfc7009)); the sandbox has none.

### Reading the records

**Reads, each time the app is opened and unlocked, when the signal comes back, and on Update now:**

1. Refresh token → new access token (about an hour).
2. `GET Patient/{id}`.
3. `GET MedicationRequest?patient={id}&_include=MedicationRequest:medication`, all pages.
4. `GET MedicationStatement?patient={id}&_include=MedicationStatement:medication`, all pages.
5. `GET ExplanationOfBenefit?patient={id}`, all pages, keeping pharmacy
   claims: the drug (RxNorm), the fill date and the insurer. It starts
   alongside steps 3 and 4 with its own 6-second limit, so a slow insurer
   never holds up the medicines.
6. `GET AllergyIntolerance?patient={id}`, all pages, alongside, with its own
   6-second limit. Mistaken, ruled-out and past entries are left out.
7. RxNav ingredient lookups, to group strengths of the same drug and match
   fills to medicines.

Nothing is written to the health record. Nothing runs on a schedule.

Records that name no medicine ("Medication", no drug code) are left out; a note
on My medicines and the staff page counts them. An allergy entry that doesn't say
what it's to gets its own row, or a note for staff, with everything else it says.

**Unknown is never none.** When medicines, insurance fills, allergies or the
patient's own additions couldn't be loaded, or the server says it left
something out, My medicines and the staff page say so and no empty part says
"none". Home and the Medicines heading leave the number off when the
medicines or the patient's own part didn't load, or no record has a medicine
name.

### Keeping it on the phone

- The list is saved encrypted on the phone, with the lock's key, so it opens and
  the QR code works with no signal.
- The service worker keeps only the app's own files for no signal. It never
  stores health data, and asks the network first, except for the pictures.
- A backup holds what the patient added or marked, never a sign-in, sealed to
  each person.

[Privacy](https://burroclurse.github.io/BrownBag/privacy.html) says what's kept and
who can see it. Each page's content security policy names the servers it may
contact: the app, only the sandbox and the drug name service; the staff page, none.

### The QR code and the FHIR file

**The QR code** holds a FHIR `Bundle` (type `collection`) of `Patient`,
`MedicationStatement` and `AllergyIntolerance` resources, compressed, encrypted with a key made from
the 6-digit code, and written after the `#` of a `share.html` link (browsers
never send that part to a server). The allergies keep the FHIR R4 rules and follow
[US Core AllergyIntolerance](https://hl7.org/fhir/us/core/StructureDefinition-us-core-allergyintolerance.html)
where the data allows: the records' codes and coded reactions, who said it,
RxNorm codes for drug ingredients, and "no known allergies" as a confirmed
statement. From records it also carries RxNorm and NDC codes and, when the whole direction
can be coded, its amount and timing; the words are always there. Codes are left
out when they'd make the QR code more than 161 squares across.
The packing borrows the trimming rules and
numeric encoding of [SMART Health Cards](https://spec.smarthealth.cards/).
The list never passes through a server.

**The FHIR file** is made in the browser from the opened QR code (`js/ips.js`): an
IPS 2.0.1 document, with every part read, checked and written again. Brown
Bag's own tags stay out; their warnings are in its readable text.

## What's planned

The sections above are what Brown Bag does today. This is what's coming, and how
far along each part is. Each idea becomes a plan only after its own design; the
reasons behind them are in [`docs/LIMITS.md`](docs/LIMITS.md).

### Front end

- **When sources disagree** (being built): when two sources list a
  medicine differently, one card shows both versions. That card is built,
  and can be tried with the home server's test clinic. The patient is asked only
  what they do (how much, how often, whether they still take it), one card at a
  time, with "Not sure, ask my doctor". Home and My medicines say how many there
  are to check, and staff see a "Records disagree: ask the patient" part.
- **A second QR code** (idea): a flip on the QR screen, one side today's code, the
  other a SMART Health Link a clinic's system can read.
- **Other ideas:** scanning pill bottles to add or update a medicine,
  reminders to open Brown Bag before an appointment, and, with several sources,
  a line for each saying when Brown Bag last read it.

### Back end

- **Medicare fills** (designed and planned): Part D fills from Medicare's Blue
  Button API join the fills from claims. It adds one small server function that
  only swaps and renews Medicare's sign-in; the list never passes through it.
  Waiting on Medicare's approval. Design:
  [`docs/superpowers/specs/2026-11-22-medicare-blue-button-design.md`](docs/superpowers/specs/2026-11-22-medicare-blue-button-design.md).
- **When sources disagree** (being built): every source's version is
  kept and compared fresh on each update; nothing is overwritten. The
  comparing is built and runs on every update; with one source the list is
  as before. The QR code and
  the FHIR file carry both sides of anything unresolved. Design:
  [`docs/superpowers/specs/2026-11-25-medication-reconciliation-design.md`](docs/superpowers/specs/2026-11-25-medication-reconciliation-design.md);
  plan: [`docs/superpowers/plans/2026-11-25-medication-reconciliation.md`](docs/superpowers/plans/2026-11-25-medication-reconciliation.md).
- **More health systems and insurers** (named, not designed): Epic, Oracle Health,
  MEDITECH, Medicaid and pharmacy fills, as listed under **Not connected**.
- **SMART Health Links** (ideas): the second QR code carries the International
  Patient Summary, and links others share with the patient can be read. Both need
  a server to hold the encrypted file, so when they arrive Brown Bag becomes built
  for server deployment, and the privacy page says what that server keeps, for how
  long, and how it's deleted.
- **Sending changes back to the clinic** (idea), with the clinic's permission.
- **HL7's validator on every push** (idea): a GitHub Action checks the test files
  and the FHIR file Brown Bag makes against HL7's own FHIR and IPS rules.

## Files

| File | Purpose |
| --- | --- |
| `launch.html`, `js/launch.js` | The sandbox's test patients, then the patient standalone launch. A plain `launch.html` goes to the connections screen. |
| `index.html` | The app: lock, sign-in return, home, My medicines, QR code. |
| `share.html` | The page staff see after scanning. |
| `js/app.js`, `js/view.js` | Screens and the plain helpers behind them. |
| `js/meds.js` | FHIR records into one deduplicated list. |
| `js/claims.js` | Insurance pharmacy claims into fills, matched to the list. |
| `js/reconcile.js` | Whether two sources are the same person, and how two records match. |
| `js/snapshot.js` | A shared list opened again (an IPS file or Brown Bag list) as one more dated source. |
| `js/demo-source.js` | Test records from a made-up second clinic, offered only by the home test server. |
| `js/allergies.js` | Allergy records and the patient's own, one row each. |
| `js/sources.js`, `js/source-list.js` | The sources: which are connected, how current they are, and what shows for the rest. |
| `js/connections.js` | The connections screen's choices: where a sign-in comes back to, and what the screen says. |
| `js/read.js` | Reads claims and allergies without risking the sign-in. |
| `js/card.js` | One medicine's card: how to take it, anything to check, then the rest, each labelled. |
| `js/quiet.js` | Keeps the sign-in library's messages (passes, record addresses) out of the browser's log. |
| `js/rxnorm.js` | Drug name search and ingredient lookup through RxNav. |
| `js/add-choices.js`, `js/add-check.js` | The add form's lists, and the check for medicines already there. |
| `js/pass.js` | The encrypted refresh token ("the pass"). |
| `js/vault.js`, `js/lock.js`, `js/lock-screen.js` | Encryption, the passkey or PIN lock, backups. |
| `js/popup.js`, `js/backup-popups.js` | Popups in the app's look, and the backup password's. |
| `js/idle.js` | When the app locks itself. |
| `js/share.js`, `js/share-view.js` | The shared Bundle, its QR packing, and the staff page. |
| `js/share-list.js` | The shared list on the staff page. |
| `js/ips.js`, `js/fhir-file.js` | Save as FHIR file: the International Patient Summary, and its button and warning. |
| `js/swipe.js`, `js/crumple.js` | Swiping the QR code away, and crumpling it into the bag. |
| `js/save-file.js` | Saves that file, or a backup: the share sheet, or a download where sharing is refused. |
| `privacy.html` | The privacy page: what Brown Bag keeps, who is contacted, and the limits of the locks. |
| `js/test-patients.js` | The sandbox's test patients, and the sandbox address that signs in as one. |
| `js/options.js` | What More options offers, in groups. |
| `js/edit.js` | Changing a medicine the patient added. |
| `js/sort.js` | The order of My medicines, and the short name on home. |
| `js/older.js` | Older prescriptions the patient says they still take. |
| `js/inside.js` | See what's inside: everything in the code as one short text. |
| `js/signed-out.js` | When a signed-out phone can open its saved list: no signal, or a sign-in that couldn't start. |
| `js/offline.js`, `sw.js` | The saved list and the app's own files for no signal. The service worker never stores health data; it asks the network first, except for the pictures. |
| `js/install.js` | Home Screen steps and backup helpers. |
| `css/brownbag.css`, `icons/`, `manifest.webmanifest` | Look, logo and Home Screen install. |
| `vendor/` | The two libraries the app uses (fhirclient, qrcode-generator), unchanged copies with their licenses (`vendor/LICENSES.md`). |
| `assets/` | The full-size logo and app icon (2048 px), the sources for `icons/`, and the see-through logo this README shows. |
| `tests/` | Node tests, with saved sandbox records in `tests/fixtures/`. |
| `tools/` | Local https server, the demo patient script and the logo source. |
| `docs/` | Designs, build plans, the learning log, the limits on keeping the list current, and what's waiting for a phone test. |
| `prompts/` | A prompt that has an AI agent list the sandbox's test data. |
| `health.html` | From the course starter; not part of Brown Bag. |

## Test patients

Sign in, then SMART Health IT sandbox, lists 20 made-up patients grouped by what
they show. A choice goes to the sandbox's approval page. **Someone else** opens the
sandbox's own list, which changes because anyone can add patients.

These links sign in as one patient directly, with no list, no approval and no
password:

| Patient | What it shows | Link |
| --- | --- | --- |
| Chantell Bartell `e89af71d-4aa4-2237-e71d-6fa8e4b5af09` | Insurance fills, one allergy, and an allergy entry that doesn't say what it's to. | [Open as Chantell](https://burroclurse.github.io/BrownBag/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImU4OWFmNzFkLTRhYTQtMjIzNy1lNzFkLTZmYThlNGI1YWYwOSIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir) |
| Loria Jenkins `e7de504a-311d-49be-b2bc-566a328bcc72` | Four current medicines, no insurance claims and no allergies. | [Open as Loria](https://burroclurse.github.io/BrownBag/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImU3ZGU1MDRhLTMxMWQtNDliZS1iMmJjLTU2NmEzMjhiY2M3MiIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir) |

Chantell and Loria come with the sandbox, so its nightly reset keeps them. Added
patients are deleted: **Avery Brownbag** (`brownbag-demo-patient`), who shows every
fill case, is there only after `node tools/demo-patient.mjs`, until the next reset.
Nothing done in Brown Bag is sent to the sandbox; what you add stays on your phone.

## Run the tests

Node 22 or later, nothing to install. From this folder:

```bash
node --test "tests/*.test.mjs"
```

## Run it locally on a phone

Passkeys and encryption need https. `tools/serve.mjs` serves this folder with
a certificate from [mkcert](https://github.com/FiloSottile/mkcert) kept in
`.certs/` (never committed). See the comments at the top of that file.

To try two sources, start it with `BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`.
It then serves the demo clinic, Valley Clinic (test records), which the app
adds as a second source with the signed-in patient's name and birth date.
Against Loria Jenkins it disagrees on a dose and on a stop, agrees on one
medicine and adds one she doesn't have. `?demo=someone-else` in the page
address makes it someone else's, so it's kept out. Only the home server
(port 8443) asks for it; the published app never does.

## Copyright

Copyright © 2026 Tyler Beattie. All rights reserved.

The code is public so that reviewers, instructors and the HL7 FHIR community
can read how it works. Reading it is welcome. Copying it, using it, changing
it or sharing it requires written permission. See [`LICENSE`](LICENSE).

The course starter it grew from is
[samoanGuy7/Smart-App](https://github.com/samoanGuy7/Smart-App). The libraries
in `vendor/` keep their own licenses: fhirclient (Apache 2.0) and
qrcode-generator (MIT).

This material contains content from LOINC (http://loinc.org). LOINC is copyright
© Regenstrief Institute, Inc. and the Logical Observation Identifiers Names and
Codes (LOINC) Committee and is available at no cost under the license at
http://loinc.org/license. LOINC® is a registered United States trademark of
Regenstrief Institute, Inc. Units use UCUM codes (https://ucum.org), copyright
© Regenstrief Institute, Inc. and the UCUM Organization.

Epic is a trademark of Epic Systems Corporation. Oracle is a registered
trademark of Oracle and/or its affiliates. Other names may be trademarks of
their respective owners. Brown Bag isn't affiliated with or endorsed by any of
them, or by any government agency.

This list is what the patient and their records say. Their care team
confirms it. Brown Bag is not a medical device and does not give medical
advice.
