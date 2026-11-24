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

The same sign-in is built for the patient portal of any US certified health
record system, such as one on Epic, Oracle Health or MEDITECH, and the same
kind of claims access is something health plans, including Medicare and
Medicaid, must offer their members (the CMS Patient Access API). Brown Bag
isn't connected to any of them. Each one needs Brown Bag registered with it
first. The test systems looked at so far, and why each fits or doesn't, are
in [`docs/SANDBOXES.md`](docs/SANDBOXES.md).

Epic is a trademark of Epic Systems Corporation. Oracle is a registered
trademark of Oracle and/or its affiliates. Other names may be trademarks of
their respective owners. Brown Bag isn't affiliated with or endorsed by any
of them, or by any government agency.

It's a patient facing SMART on FHIR app that runs as static pages with no backend server. It signs in through SMART App Launch against the SMART Health IT R4 sandbox and reads FHIR R4 records.
It is built to be simple to use: one main screen with no
scrolling, big buttons, plain words, and WCAG 2.2 AA throughout.

**Live:** <https://burroclurse.github.io/BrownBag/launch.html> (sandbox data
only, no real patients). To open it as a certain patient, see
[Test patients](#test-patients).

## What the patient sees

- **Choose where the records are.** Sign in opens a list. The SMART sandbox
  works today; the health systems and insurers Brown Bag may add later show
  in grey, under "Not connected".
- **Sign in once.** The first time, the patient signs in at their health
  system and approves access. After that, Face ID (or a 6-digit PIN) opens
  Brown Bag and the list updates by itself.
- **One screen.** Their name, the Brown Bag logo, **Show my QR code**,
  **My medicines (N)**, and **More options**.
- **My medicines.** Medicines from their records (repeats merged, strengths of
  one drug grouped, older prescriptions folded away), medicines they added
  (checked against RxNorm). Each medicine from the records has two
  buttons: **As needed** moves it to its own group, still on the list, for
  one taken only when needed (pain medicine after surgery, say), and **Not
  taking** moves it to Not taking, for one finished or stopped. Either can
  be undone.
- **Allergies** come first on My medicines, in their own box, apart from the
  medicines: the ones in their records and
  their own, each with the reaction and who says so. They can add an
  allergy, add a reaction to one from their records, or say they have no
  known allergies. A load that failed says so, and never looks like "none".
- **What was actually filled.** Each medicine shows its insurance fills
  ("Filled 2 times · last Sep 22, 2026 · Aetna claims") or "No fill found
  in your claims". Fills the record doesn't list get their own section,
  and a prescription the record calls finished (completed, stopped or
  canceled) but filled since it was written moves back to the current
  list, saying so.
- **Adding a medicine** uses lists for how much and how often, so the
  QR code carries the dose as numbers other systems can read, and asks
  first when the medicine is already there, was marked stopped, or only
  looks like one on the list.
- **The QR code** comes up out of the bag and fills the screen, for the
  person checking their medicines. A 6-digit code, blurred until tapped, is
  told to that person after they scan; they type it on `share.html` to see
  the list. Two "?" buttons explain what's in the code and why the digits
  matter. **See what's inside** opens the code on the patient's own phone,
  read-only and drawn like the staff page, for when nobody can scan it. Both
  say when the records were last updated and when the QR code was made.
  A note says when insurance fills couldn't be loaded.
- **Changed the list with no signal?** The QR code still includes the
  change, and the QR screen lists exactly what changed since the records
  were last updated and says to get a connection to update them.
- **No signal?** The last list is saved, encrypted, on the phone, and the QR
  code still works. On a slow connection, a file that doesn't arrive is
  tried once more, and then Brown Bag says what to do.
- **Interrupted while adding?** A half-typed medicine or allergy is kept until
  Brown Bag locks or closes, and home says it isn't saved.
- **Sign out** signs out everyone on the phone. Saved lists stay, locked: the
  next open says "You're signed out", with Sign in and Open my saved list.
- **Locks itself** after 5 minutes without a tap or 5 minutes away from the
  app. The health record connection ends after 30 days without opening it.

## How it uses SMART and FHIR

**Launch.** `launch.html` lists the sources. Choosing the sandbox (or a link
that names its server with `iss`, or a connected source with `source`) starts a patient standalone launch with
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
   alongside steps 3 and 4 with its own 6-second limit, and asks for no
   more pages once that is up, so a slow insurer never holds up the
   medicines.
6. `GET AllergyIntolerance?patient={id}`, all pages, alongside, with its own
   6-second limit. Mistaken, ruled-out and past entries are left out.
7. RxNav ingredient lookups, to group strengths of the same drug and match
   fills to medicines.

Nothing is written to the health record. Nothing runs on a schedule.

Records whose medicine is only a placeholder word, such as "Medication",
with no drug code, are left out of the list and the QR code; a note on My
medicines and on the staff page says how many there were. An allergy entry
that doesn't say what it's to gets a note the same way.

**Unknown is never none.** When medicines, insurance fills, allergies or the
patient's own additions couldn't be loaded, or the server says it left
something out, My medicines and the staff page say so and no empty part says
"none". Home and the Medicines heading leave the number off when the
medicines or the patient's own part didn't load.

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
statement. The packing borrows the trimming rules and
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
| `js/sources.js` | The sources: which are connected, and what shows for the rest. |
| `js/read.js` | Reads claims and allergies without risking the sign-in. |
| `js/quiet.js` | Keeps the sign-in library's messages (passes, record addresses) out of the browser's log. |
| `js/rxnorm.js` | Drug name search and ingredient lookup through RxNav. |
| `js/add-choices.js`, `js/add-check.js` | The add form's lists, and the check for medicines already there. |
| `js/pass.js` | The encrypted refresh token ("the pass"). |
| `js/vault.js`, `js/lock.js`, `js/lock-screen.js` | Encryption, the passkey or PIN lock, backups. |
| `js/idle.js` | When the app locks itself. |
| `js/share.js`, `js/share-view.js` | The shared Bundle, its QR packing, and the staff page. |
| `js/share-list.js` | The shared list on screen, for the staff page and See what's inside. |
| `js/offline.js`, `sw.js` | The saved list and the app's own files for no signal. The service worker never stores health data. |
| `js/install.js` | Home Screen steps and backup helpers. |
| `css/brownbag.css`, `icons/`, `manifest.webmanifest` | Look, logo and Home Screen install. |
| `vendor/` | The two libraries the app uses (fhirclient, qrcode-generator), unchanged copies with their licenses (`vendor/LICENSES.md`). |
| `assets/` | The full-size logo and app icon (2048 px), the sources for `icons/`, and the see-through logo this README shows. |
| `tests/` | Node tests, with saved sandbox records in `tests/fixtures/`. |
| `tools/` | Local https server, the demo patient script and the logo source. |
| `docs/` | Designs, build plans, the learning log, the limits on keeping the list current, and what's waiting for a phone test. |
| `health.html` | From the course starter; not part of Brown Bag. |

## Test patients

The sandbox is public and shared. Its sign-in page lists only the first ten
patients on it, and anyone can add patients, so the list changes and the one
you want may not be there. These links sign in as one patient directly, with
no list and no password:

| Patient | What it shows | Link |
| --- | --- | --- |
| Chantell Bartell `e89af71d-4aa4-2237-e71d-6fa8e4b5af09` | Insurance fills, one allergy, and an allergy entry that doesn't say what it's to. | [Open as Chantell](https://burroclurse.github.io/BrownBag/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImU4OWFmNzFkLTRhYTQtMjIzNy1lNzFkLTZmYThlNGI1YWYwOSIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir) |
| Loria Jenkins `e7de504a-311d-49be-b2bc-566a328bcc72` | Four current medicines, no insurance claims and no allergies. | [Open as Loria](https://burroclurse.github.io/BrownBag/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImU3ZGU1MDRhLTMxMWQtNDliZS1iMmJjLTU2NmEzMjhiY2M3MiIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir) |

**The sandbox is reset every night, and patients that people added are
deleted.** Chantell and Loria are made-up patients that come with the
sandbox, so they are still there after the reset and these links still work.
Nothing you do in Brown Bag is sent back to the sandbox; what you add stays
on your phone.

**Avery Brownbag** (`brownbag-demo-patient`) is made up too, and shows every
fill case, but is an added patient, so Avery has no link here and is usually
not on the sandbox. `node tools/demo-patient.mjs` puts Avery there (it
replaces, never duplicates) until the next reset.

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

Epic is a trademark of Epic Systems Corporation. Oracle is a registered
trademark of Oracle and/or its affiliates. Other names may be trademarks of
their respective owners. Brown Bag isn't affiliated with or endorsed by any of
them, or by any government agency.

This list is what the patient and their records say. Their care team
confirms it. Brown Bag is not a medical device and does not give medical
advice.
