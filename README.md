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

Sign in also names, under **Not connected**, what Brown Bag may add later:
Epic, Oracle Health and MEDITECH (health systems), Medicare and Medicaid
(insurance), and pharmacy fills. The test systems looked at so far, and why each
fits or doesn't, are in [`docs/SANDBOXES.md`](docs/SANDBOXES.md).

It's static pages with no backend server, built to be simple: one main screen,
big buttons, plain words, and made to WCAG 2.2 AA.

**Live:** <https://burroclurse.github.io/BrownBag/launch.html> (sandbox data
only, no real patients). To open it as a certain patient, see
[Test patients](#test-patients).

## What the patient sees

**Signing in**
- **Sign in** lists the sources. The SMART sandbox opens a list of 20 test patients.
- After the first sign-in, Face ID, a fingerprint or a 6-digit PIN opens Brown
  Bag and the list updates by itself. It locks after 5 minutes without a tap or
  away, and the connection ends after 30 days unused.
- **Sign out** is for everyone on the phone. Saved lists stay, locked.

**Home** has their first name and last initial, **Show my QR code**, **My medicines
(N)** and **More options** (Health records, backups, the Home Screen, Privacy, Sign out).

**My medicines**
- **Allergies** come first, in their own box, with each reaction and who says
  so. The patient can add one, add or change their reaction, or say they have none
  known. A record that names no allergen shows as a note; after adding an allergy
  that could be it, the patient can say it is. Staff still see the record.
- **Medicines** from the records: repeats merged, strengths of one drug grouped,
  directions in full, on-hold ones marked, older prescriptions folded away.
- **As needed** and **Not taking** move a medicine to its own part, with Undo.
  **I'm taking this**, on an older prescription, asks first.
- **Filled**: how many times, and when last, from insurance claims. A prescription
  the record calls finished but filled since is current again, and says so. Fills the
  record doesn't list get their own part.
- **Add a medicine** uses lists for how much and how often, checks the name
  against RxNorm, and asks when it's already there or looks like one that is.
  Added ones can be edited.
- **Sort** by name, newest, or who prescribed it.

**The QR code**
- It fills the screen; Close or a swipe puts it away. After scanning, staff type 6
  digits the patient tells them (hidden until tapped) on `share.html`.
- **See what's inside** shows everything in the code on the patient's own phone.
- **Save as FHIR file** (staff, or the patient under See what's inside) saves an
  [International Patient Summary](https://hl7.org/fhir/uv/ips/) (2.0.1), after a
  warning that it isn't locked. A list where something didn't load can't be saved.
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

[Privacy](https://burroclurse.github.io/BrownBag/privacy.html) says what's kept and
who can see it. Each page's content security policy names the servers it may
contact: the app, only the sandbox and the drug name service; the staff page, none.

## How it uses SMART and FHIR

**Launch.** `launch.html` lists the sources. Choosing the sandbox, then a test patient (or a link
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

**Reads, each time the app is opened and unlocked:**

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
what it's to gets a note too, with everything else it says.

**Unknown is never none.** When medicines, insurance fills, allergies or the
patient's own additions couldn't be loaded, or the server says it left
something out, My medicines and the staff page say so and no empty part says
"none". Home and the Medicines heading leave the number off when the
medicines or the patient's own part didn't load, or no record has a medicine
name.

**The refresh token** is stored encrypted (AES-GCM) with a key that comes
from the passkey (WebAuthn PRF) or the PIN (PBKDF2, 600,000 rounds). It is
never put in a backup file. It is deleted on Sign out, when the token server
refuses it, or after 30 days unused. Sign out is for everyone who signed in
on the phone: every refresh token is deleted first, then each server whose
SMART configuration offers a `revocation_endpoint` is told to end its side
([RFC 7009](https://www.rfc-editor.org/rfc/rfc7009)); the sandbox has none.

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

## Files

| File | Purpose |
| --- | --- |
| `launch.html`, `js/launch.js` | The list of sources, then the patient standalone launch. |
| `index.html` | The app: lock, sign-in return, home, My medicines, QR code. |
| `share.html` | The page staff see after scanning. |
| `js/app.js`, `js/view.js` | Screens and the plain helpers behind them. |
| `js/meds.js` | FHIR records into one deduplicated list. |
| `js/claims.js` | Insurance pharmacy claims into fills, matched to the list. |
| `js/allergies.js` | Allergy records and the patient's own, one card each. |
| `js/sources.js`, `js/source-list.js` | The sources: which are connected, how current they are, and what shows for the rest. |
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
| `js/swipe.js` | Swiping the QR code away. |
| `js/save-file.js` | Saves that file, or a backup: the share sheet, or a download where sharing is refused. |
| `privacy.html` | The privacy page: what Brown Bag keeps, who is contacted, and the limits of the locks. |
| `js/test-patients.js` | The sandbox's test patients, and the sandbox address that signs in as one. |
| `js/options.js` | What More options offers, in groups. |
| `js/edit.js` | Changing a medicine the patient added. |
| `js/sort.js` | The order of My medicines, and the short name on home. |
| `js/older.js` | Older prescriptions the patient says they still take. |
| `js/inside.js` | See what's inside: everything in the code as one short text. |
| `js/signed-out.js` | When a signed-out phone can open its saved list: only with no signal. |
| `js/offline.js`, `sw.js` | The saved list and the app's own files for no signal. The service worker never stores health data. |
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
