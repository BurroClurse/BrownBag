# Brown Bag

**Every pill bottle, without the bag.**

<img src="assets/BrownBagLogoReadme.png" alt="Brown Bag logo" width="320">

Brown Bag helps patients give every healthcare worker an accurate medication
list. It's a SMART on FHIR R4 patient app: the patient signs in with their
health system's patient portal, and Brown Bag gathers their prescriptions,
listed medicines, allergies and insurance pharmacy fills, adds what they take
over the counter, and shares the whole list with one QR code. When their
records disagree, it asks the patient, and shows staff every version until
the patient has answered.

It's for patients who see more than one care team, and the nurse, pharmacist
or front desk checking their medicines. Plain words, big buttons, WCAG 2.2 AA,
and no Brown Bag server: it all runs in the browser.

**Live:** <https://burroclurse.github.io/BrownBag/>. **Sandbox data only:** the
SMART Health IT sandbox's made-up [test patients](docs/SANDBOXES.md#test-patients).
The pictures are Riley Reconcile, made up, with the home server's test clinic.

<p>
<img src="assets/readme-home.png" width="240" alt="Home for test patient Riley R.: the Brown Bag logo, Show my QR code, My medicines (9), a link that says Your records don't agree on 3 things, and More options.">
<img src="assets/readme-qr.png" width="240" alt="The QR code screen: Show this to the person checking your medicines, See what's inside, a large QR code, then After they scan it, tell them this code, with the 6-digit code blurred until Tap to show the code, and a Close button.">
<img src="assets/readme-staff.png" width="240" alt="The staff page for Riley Reconcile: under Medicines (9), the part Records disagree: ask the patient (3), with atorvastatin from the SMART sandbox (Records say: current) and from Valley Clinic (Records say: stopped).">
</p>

## Standards

The standards Brown Bag uses, and where each one shows up. The links in the
last column go to a snippet below of what it sends, reads or builds.

**Health data**

| Standard | Version | What Brown Bag uses it for |
| --- | --- | --- |
| [HL7 FHIR](https://hl7.org/fhir/R4/) | R4 (4.0.1) | Every record it reads, the QR code's list and the FHIR file. [Reads](#reads) |
| [SMART App Launch](https://hl7.org/fhir/smart-app-launch/) | Patient standalone launch, `.read` (v1) scopes | Signing in with the patient's portal account. [Sign-in](#sign-in) |
| [US Core](https://hl7.org/fhir/us/core/) | As the server sends it | How US health records shape medicines, allergies and "no known allergies". |
| [CARIN Blue Button](https://hl7.org/fhir/us/carin-bb/) | As the server sends it | Pharmacy claims (`ExplanationOfBenefit`): what was filled, how many, for how many days. [Reads](#reads) |
| [International Patient Summary](https://hl7.org/fhir/uv/ips/) | 2.0.1 | The FHIR file staff can save. [The FHIR file](#the-fhir-file) |
| [SMART Health Cards](https://spec.smarthealth.cards/) | Ideas only | The QR code borrows its trimmed Bundle (`resource:N` references) and digits, which a QR code holds more of. It isn't a Health Card: it's locked, not signed. [The QR code](#the-qr-code) |
| [RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/), through [RxNav](https://lhncbc.nlm.nih.gov/RxNav/) | Live | Medicine codes: ingredients, strengths, retired codes, and checking what the patient adds. |
| [NDC](https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory) | Live, through RxNav | Package codes on pharmacy fills, turned into RxNorm by the fill's date. |
| [SNOMED CT](https://www.snomed.org/) | — | Allergies, and the codes for "no known allergies". |
| [LOINC](https://loinc.org/) | — | The FHIR file's document and section codes. |
| [UCUM](https://ucum.org/) | — | Units such as `mL` on what the patient adds. |

**Security and access**

| Standard | Version | What Brown Bag uses it for |
| --- | --- | --- |
| [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749) with [PKCE](https://www.rfc-editor.org/rfc/rfc7636) | `S256`, public client | Sign-in with no app secret. [Sign-in](#sign-in) |
| [OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html) | `openid fhirUser` | Asked for at sign-in: who signed in. |
| [OAuth 2.0 Token Revocation](https://www.rfc-editor.org/rfc/rfc7009) | — | Sign out ends the refresh token where the server offers it. |
| [Web Crypto](https://www.w3.org/TR/WebCryptoAPI/) | AES-GCM 256, PBKDF2-SHA-256, HKDF | Locking the saved list, the sign-in and the QR code. [Storage and the lock](#storage-and-the-lock) |
| [WebAuthn](https://www.w3.org/TR/webauthn-3/) | Level 3, PRF extension | Face ID or a fingerprint makes the lock's key. [Storage and the lock](#storage-and-the-lock) |
| [Content Security Policy](https://www.w3.org/TR/CSP3/) | Level 3 | Each page names what it may contact; the staff page, nothing. |
| [WCAG](https://www.w3.org/TR/WCAG22/) | 2.2 AA | Every screen: contrast, text size, screen readers. |

## Front end: what people see

**The patient** ([the full tour](docs/HOW-IT-WORKS.md#the-patient))
- **Lock and sign-in:** a lock first (Face ID, a fingerprint or a 6-digit
  PIN), then **Connect your health records**. After that, the lock opens Brown
  Bag and the list updates by itself. It locks after 5 minutes idle.
- **My medicines:** allergies first, then the medicines from the records,
  repeats merged, directions in full, each card naming every source that
  lists it. Older prescriptions fold away, with a hospital's order for a stay
  among them, labelled "Hospital order".
- **Fills** from insurance claims: how many, and when last. When the newest is
  over a year old, the card says "Last filled over a year ago."
- **When sources disagree** on how much, how often or whether it's still
  taken, the medicine is one card with each source's version and date, and
  home and My medicines say "Your records don't agree on 3 things".
- **The review cards** ask one at a time ("Do you still take it?"), with each
  source's version, "I don't take this anymore" and "Not sure, ask my doctor".
  An answer reads "You said: …" with **Change**, and is asked again only when
  a source says something new.
- **As needed**, **Not taking** and **Add a medicine** (checked against
  RxNorm) are the patient's own. With no signal, the saved list still opens.
- **The QR code** fills the screen, with a 6-digit code to tell staff. **See
  what's inside** shows all of it. Birth dates read "Born May 8, 1974".

**The person checking medicines** ([in full](docs/HOW-IT-WORKS.md#the-person-checking-medicines))
- They scan the QR code and type the 6 digits in the **code box**: name, birth
  date, allergies, then the medicines in parts, each saying who says so.
- **"Records disagree: ask the patient"** comes first while the patient
  hasn't settled one: each source's version and date, with "Records say:
  current" or "stopped". A source that didn't load is named.
- **The fill hint**, "From the fill: about 2 a day (60 for 30 days)", is
  something to ask about, never the dose.
- The address drops the list as the page opens, so a copied address carries
  none. The tab keeps the list locked until it's closed: a reload asks for the
  code again. Back and Forward between two patients show each one's code box.
- **Save as FHIR file**: an International Patient Summary, after a warning.

## Back end: what happens behind the screen

Both halves are in full in [How it works](docs/HOW-IT-WORKS.md). There's no
Brown Bag server: it all runs in the browser. Each page's content security
policy names what it may contact: the app, the sandbox and RxNav; the staff
page, nothing. The snippets use made-up values; the scopes, addresses and
codes are the app's own.

### Sign-in

A SMART patient standalone launch (fhirclient 3.0.1, PKCE, public client),
read-only scopes and `offline_access`. fhirclient finds the sign-in page in
the server's `.well-known/smart-configuration`, then sends the patient there:

```http
GET {authorization_endpoint}?response_type=code
    &client_id=my_web_app
    &redirect_uri=https://burroclurse.github.io/BrownBag/index.html
    &scope=launch/patient openid fhirUser offline_access patient/Patient.read
           patient/MedicationRequest.read patient/MedicationStatement.read
           patient/Medication.read patient/Practitioner.read
           patient/ExplanationOfBenefit.read patient/AllergyIntolerance.read
    &aud={iss}&state={random}
    &code_challenge={SHA-256 of a random verifier}&code_challenge_method=S256
```

The token answer names the patient and carries the refresh token:

```jsonc
{
  "token_type": "Bearer",
  "access_token": "eyJ…",      // about an hour
  "patient": "e7de504a-311d-49be-b2bc-566a328bcc72",
  "id_token": "eyJ…",          // openid fhirUser
  "refresh_token": "…"         // locked, then saved on the phone
}
```

The refresh token is encrypted (AES-GCM) with a key from the passkey
(WebAuthn PRF) or the PIN (PBKDF2). Sign out deletes it, and revokes it where
the server allows.

### Reads

Patient, MedicationRequest, MedicationStatement, pharmacy claims
(ExplanationOfBenefit) and AllergyIntolerance, every page, plus RxNav for
ingredients, term types and package codes. Nothing is written back.

```http
GET {iss}/Patient/{patient}
GET {iss}/MedicationRequest?patient={patient}&_include=MedicationRequest:medication
GET {iss}/MedicationStatement?patient={patient}&_include=MedicationStatement:medication
GET {iss}/ExplanationOfBenefit?patient={patient}
GET {iss}/AllergyIntolerance?patient={patient}
Authorization: Bearer {access_token}
```

Each answer is a `searchset` Bundle; Brown Bag follows every `next` link.

### Storage and the lock

The list is saved encrypted on the phone. The patient's additions, marks and
answers are saved the same way and go in backups; the list and the sign-in
never do. The service worker keeps app files only. The key comes from the
PIN or from Face ID or a fingerprint (shortened from `js/vault.js` and
`js/lock.js`):

```js
// The PIN: 600,000 rounds of PBKDF2 make a 256-bit AES-GCM key.
subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 600000 },
  pinMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

// Face ID or a fingerprint: the passkey's PRF answer, the same every time...
credentials.get({ publicKey: { rpId, userVerification: "required",
  extensions: { prf: { eval: { first: salt } } } } });
// ...shaped by HKDF (SHA-256) into the same kind of key.
```

### Reconciliation

Every source's records are kept and compared fresh on each update; nothing
is overwritten. A second source joins only with the same name and birth
date. Today it's the home server's test clinic.

### The QR code

A FHIR `Bundle` (`collection`) of Patient, MedicationStatement and
AllergyIntolerance. Each side of an unsettled disagreement goes in, tied by a
`differs` tag, and a `source-not-loaded` tag names a source that didn't load.
Two clinics that disagree on a dose:

```jsonc
{
  "resourceType": "Bundle",
  "type": "collection",
  "timestamp": "2026-11-17T15:00:00.000Z",
  "meta": { "tag": [{ "system": "https://burroclurse.github.io/BrownBag/tags",
                      "code": "differs", "display": "1 2" }] },
  "entry": [
    { "fullUrl": "resource:0", "resource": { "resourceType": "Patient",
        "name": [{ "text": "Jane Example" }], "birthDate": "1961-04-02" } },
    { "fullUrl": "resource:1", "resource": { "resourceType": "MedicationStatement",
        "status": "active", "subject": { "reference": "resource:0" },
        "medicationCodeableConcept": { "text": "lisinopril 10 MG Oral Tablet",
          "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "314076" }] },
        "dosage": [{ "text": "10 mg · once a day" }],
        "note": [{ "text": "From records: SMART sandbox" }, { "text": "Records disagree" },
                 { "text": "Record date: 2026-03" }] } }
    // resource:2 is the 20 mg side (RxNorm 314077), "From records: Valley Clinic"
  ]
}
```

It's compressed and encrypted with a key made from the 6 digits, after the
`#` of a `share.html` link, which the browser never sends to a server
(shortened from `js/share.js`):

```js
var code = sixDigitCode();                        // read out loud, never in the link
var secret = crypto.getRandomValues(new Uint8Array(16));
var iv = crypto.getRandomValues(new Uint8Array(12));
var key = await deriveKeyFromPin(code, secret);   // PBKDF2, as for the PIN
var packed = await deflateRaw(JSON.stringify(bundle));
var sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, packed);
var url = baseUrl + "share.html#v3." + toDigits(toBase64Url(secret + iv + sealed));
// https://burroclurse.github.io/BrownBag/share.html#v3.29303036707643127053…
```

### The FHIR file

IPS 2.0.1, made in the browser; HL7's validator passes its test files. A
source with no medicines is said in the text. There's no `DetectedIssue`:
IPS 2.0.1 allows only medicine records in that section.

```jsonc
{
  "resourceType": "Bundle",
  "meta": { "profile": ["http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips"] },
  "type": "document",
  "entry": [
    { "resource": { "resourceType": "Composition", "status": "preliminary",
        "type": { "coding": [{ "system": "http://loinc.org", "code": "60591-5" }] },
        "title": "Patient summary from Brown Bag",
        "section": [
          { "title": "Medicines", "code": { "coding": [{ "system": "http://loinc.org", "code": "10160-0" }] } },
          { "title": "Allergies", "code": { "coding": [{ "system": "http://loinc.org", "code": "48765-2" }] } },
          { "title": "Problems",  "code": { "coding": [{ "system": "http://loinc.org", "code": "11450-4" }] } }
        ] } }
    // then the Patient, a Device named "Brown Bag", and each
    // MedicationStatement and AllergyIntolerance the sections point to
  ]
}
```

### The staff tab

The locked list moves from the address into the history step's
`history.state`, so a reload asks for the code, and Back or Forward reloads
only when the step holds a different list.

## What's planned

What Brown Bag doesn't do yet. An idea becomes a plan only after its own
design; the reasons behind each are in [LIMITS](docs/LIMITS.md).

**Front end**
- **A second QR code** (idea): a SMART Health Link a clinic's system can read. [LIMITS #19](docs/LIMITS.md)
- **Scanning pill bottles** (idea): a model on the phone fills the add form. [LIMITS #4](docs/LIMITS.md)
- **Reading directions** (idea): "1 tab PO BID" read as "twice a day". [LIMITS #24](docs/LIMITS.md)
- **A reminder before appointments** (idea). [LIMITS #1](docs/LIMITS.md)
- **When each source was last read** (idea), with several sources. [LIMITS #21](docs/LIMITS.md)
- **Text past 200 percent** (idea): My medicines, the QR screen and the staff page's title fit. [LIMITS #28](docs/LIMITS.md)
- **The unnamed allergy's source** (idea): it names its source once a second source sends allergies. [LIMITS #17](docs/LIMITS.md)

**Back end**
- **Medicare Part D fills** (designed and planned; waiting on Medicare's approval). It adds one small server function, which only handles Medicare's sign-in and never sees the list. [Design](docs/superpowers/specs/2026-11-22-medicare-blue-button-design.md)
- **Epic, Oracle Health, MEDITECH, Medicaid, pharmacy fills** (idea; named on the connections screen). [SANDBOXES](docs/SANDBOXES.md#sandboxes-looked-at)
- **SMART Health Links** (idea; needs a server to hold the file). [LIMITS #19](docs/LIMITS.md)
- **Two sign-ins for one person** (idea; comes after Medicare). [LIMITS #22](docs/LIMITS.md)
- **Sending changes back to the clinic** (idea; needs its permission). [LIMITS #2](docs/LIMITS.md)
- **Testing at scale** (idea; the Colab notebook is the first piece). [LIMITS #23](docs/LIMITS.md)
- **Nicknames and old names** (idea): Bill and William stay apart; old names aren't compared. [Research](docs/superpowers/research/2026-11-25-messy-data-findings.md)
- **A `DetectedIssue` in the FHIR file** (idea; waiting on IPS or US Core). [LIMITS #26](docs/LIMITS.md)
- **HL7's validator on every push** (idea; run by hand today). [LIMITS #20](docs/LIMITS.md)

## Run it

Node 22 or later, nothing to install: `node --test "tests/*.test.mjs"` runs
the tests. On a phone, passkeys and encryption need https: `node
tools/serve.mjs` serves this folder at `https://localhost:8443` with a
certificate made with mkcert and kept in `.certs/`. For two sources, start
it with `BROWN_BAG_DEMO=two-clinics`. Both are in
[the test clinic](docs/SANDBOXES.md#the-home-servers-test-clinic).

## More docs

- [How it works](docs/HOW-IT-WORKS.md): the full tour, front end and back end.
- [Sandboxes and test patients](docs/SANDBOXES.md): who to sign in as, and the test clinic.
- [Limits](docs/LIMITS.md): what can keep the list from matching what the patient takes.
- [Privacy](https://burroclurse.github.io/BrownBag/privacy.html) ([`privacy.html`](privacy.html)): what's kept and who can see it.

## Copyright

Copyright © 2026 Tyler Beattie. All rights reserved.

The code is public so that reviewers, instructors and the HL7 FHIR community
can read how it works. Reading it is welcome. Copying it, using it, changing
it or sharing it requires written permission. See [`LICENSE`](LICENSE). The
notices for the course starter, the libraries, LOINC, UCUM and trademarks are
in [`NOTICE.md`](NOTICE.md).

This list is what the patient and their records say. Their care team
confirms it. Brown Bag is not a medical device and does not give medical
advice.
