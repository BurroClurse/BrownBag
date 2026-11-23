# Brown Bag

**Every pill bottle, without the bag.**

<img src="assets/BrownBagLogoReadme.png" alt="Brown Bag logo" width="320">

Brown Bag helps patients give every healthcare worker an accurate medication
list. It gathers their medicines from their health records, adds what they
take over the counter, and shares the whole list with one QR code.

The records come from the patient's own health system, the hospital or
clinic whose patient portal they already use. They sign in with that portal
account, and Brown Bag reads their prescriptions and listed medicines
through SMART on FHIR, which US certified health record systems must offer
to patient apps. It adds pharmacy fills from insurance claims, showing what
was actually picked up. Today it connects to the SMART Health IT sandbox
(test patients only), whose claims stand in for an insurer's. Epic, Aetna
and Medicare sandboxes are being added (see the table below).

The accounts it is built to work with: the patient portal of any US
certified health record system, such as Epic MyChart, Oracle Health
(Cerner) HealtheLife or MEDITECH's patient portal, at any hospital, clinic
or practice that uses one; and the patient access of any health plan,
such as Medicare (Blue Button), Medicare Advantage or Medicaid plans, which
federal rules (the CMS Patient Access API) require to offer it. Each one
needs Brown Bag registered with it before real patients can sign in.

**Sandboxes.** Each company's own developer documents were read, and each
test server was checked from Brown Bag's web address to see whether a
browser page can read its records directly (CORS), since Brown Bag keeps
the list out of any server.

| Sandbox | Status | Why |
| --- | --- | --- |
| SMART Health IT | Connected | The course sandbox. Test patients only. |
| Epic (open.epic) | Being added | Self-service, no approval wait. Browser reading works. Test patient Camila Lopez has medicines. A browser-only app gets no stay-signed-in pass. |
| Aetna | Being added | Allows browser apps (PKCE), and records are readable from the browser. Its sign-up questionnaire is reviewed in 2 to 4 business days, even for the sandbox. No stay-signed-in pass. |
| Medicare (Blue Button) | Being added | Pharmacy fills from Medicare claims. Design: `docs/superpowers/specs/2026-11-22-medicare-blue-button-design.md`. |
| Oracle Health (Ignite) | Later | Free account, and browser reading works. Patient apps need a code in the app's own domain's DNS settings, which a github.io address can't hold, so it needs a custom domain. |
| MEDITECH (Greenfield) | Later | Manual sign-up with a license agreement and a call. Three test patients. Each real hospital approves the app separately. |
| UnitedHealthcare | No | Needs a registered organization, and its server doesn't let a browser read data, so claims would have to pass through a server. No MedicationStatement records either. |
| Humana | No | Needs a D-U-N-S number and a registered company, which a student project can't have. |

It's a patient facing SMART on FHIR app that runs as static pages with no backend server. It signs in through SMART App Launch against the SMART Health IT R4 sandbox and reads FHIR R4 records.
It is built to be simple to use: one main screen with no
scrolling, big buttons, plain words, and WCAG 2.2 AA throughout.

**Live:** <https://burroclurse.github.io/BrownBag/launch.html> (sandbox data
only, no real patients).

## What the patient sees

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
  matter.
- **Changed the list with no signal?** The QR code still includes the
  change, and the QR screen lists exactly what changed since the records
  were last updated and says to get a connection to update them.
- **No signal?** The last list is saved, encrypted, on the phone, and the QR
  code still works.
- **Locks itself** after 5 minutes without a tap or 5 minutes away from the
  app. The health record connection ends after 30 days without opening it.

## How it uses SMART and FHIR

**Launch.** `launch.html` starts a patient standalone launch with
`FHIR.oauth2.authorize()` ([fhirclient](https://github.com/smart-on-fhir/client-js)
3.0.1, PKCE, public client). Scopes:

```
launch/patient openid fhirUser offline_access patient/Patient.read
patient/MedicationRequest.read patient/MedicationStatement.read
patient/Medication.read patient/Practitioner.read
patient/ExplanationOfBenefit.read
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
6. RxNav ingredient lookups, to group strengths of the same drug and match
   fills to medicines.

Nothing is written to the health record. Nothing runs on a schedule.

Records whose medicine is only a placeholder word, such as "Medication",
with no drug code, are left out of the list and the QR code; a note on My
medicines says how many there were.

**The refresh token** is stored encrypted (AES-GCM) with a key that comes
from the passkey (WebAuthn PRF) or the PIN (PBKDF2, 600,000 rounds). It is
never put in a backup file. It is deleted on Sign out, when the token server
refuses it, or after 30 days unused.

**The QR code** holds a FHIR `Bundle` (type `collection`) of `Patient` and
`MedicationStatement` resources, compressed, encrypted with a key made from
the 6-digit code, and written after the `#` of a `share.html` link (browsers
never send that part to a server). The packing borrows the trimming rules and
numeric encoding of [SMART Health Cards](https://spec.smarthealth.cards/).
The list never passes through a server.

## Files

| File | Purpose |
| --- | --- |
| `launch.html` | Patient standalone launch. |
| `index.html` | The app: lock, sign-in return, home, My medicines, QR code. |
| `share.html` | The page staff see after scanning. |
| `js/app.js`, `js/view.js` | Screens and the plain helpers behind them. |
| `js/meds.js` | FHIR records into one deduplicated list. |
| `js/rxnorm.js` | Drug name search and ingredient lookup through RxNav. |
| `js/pass.js` | The encrypted refresh token ("the pass"). |
| `js/vault.js`, `js/lock.js`, `js/lock-screen.js` | Encryption, the passkey or PIN lock, backups. |
| `js/idle.js` | When the app locks itself. |
| `js/share.js`, `js/share-view.js` | The shared Bundle, its QR packing, and the staff page. |
| `js/offline.js`, `sw.js` | The saved list and the app's own files for no signal. The service worker never stores health data. |
| `js/install.js` | Home Screen steps and backup helpers. |
| `css/brownbag.css`, `icons/`, `manifest.webmanifest` | Look, logo and Home Screen install. |
| `vendor/` | The two libraries the app uses (fhirclient, qrcode-generator), unchanged copies with their licenses (`vendor/LICENSES.md`). |
| `assets/` | The full-size logo and app icon (2048 px), the sources for `icons/`, and the see-through logo this README shows. |
| `tests/` | Node tests, with saved sandbox records in `tests/fixtures/`. |
| `tools/` | Local https server and the logo source. |
| `docs/` | Designs, build plans and the learning log. |

## Test patients

- **Avery Brownbag** (`brownbag-demo-patient`), made-up, shows every fill
  case. `node tools/demo-patient.mjs` puts her on the public sandbox (it
  replaces, never duplicates).

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
[samoanGuy7/Smart-App](https://github.com/samoanGuy7/Smart-App). Libraries
loaded from jsDelivr keep their own licenses: fhirclient (Apache 2.0) and
qrcode-generator (MIT).

This list is what the patient and their records say. Their care team
confirms it. Brown Bag is not a medical device and does not give medical
advice.
