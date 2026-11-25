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
  A record that says the patient has no known allergies ("NKA", "NKDA",
  "Patient has no known allergies") is shown as "Your records say: No known
  allergy.", never as an allergy, and never hides one listed beside it. Words
  that say none and also name something ("NKA to food, allergic to
  penicillin") stay an allergy row.
- **Medicines** from the records: repeats merged, strengths of one drug grouped,
  directions in full, on-hold ones marked, older prescriptions folded away. Another
  release type (12 or 24 hour, XL), salt (tartrate, succinate) or form (eye drops,
  tablets) is its own line, and so is a combination such as Excedrin beside
  Tylenol.
- A second source is added only when its name and birth date match the
  patient's. One that doesn't gets a line: "Records from <Source> don't match
  your name and birth date, so they aren't on your list." One that shares no
  name or birth date gets "<Source> didn't share a name and birth date, so its
  records aren't on your list."
- A source that lists no medicine and says it has no information about the
  patient's medicines, or knows of none, gets a line of its own ("<Source> has no information about your
  medicines." or "<Source> says: no medicines known."), never a card, and the
  list never reads as none.
- **As needed** and **Not taking** move a medicine to its own part, with Undo.
  A prescription dated after a Not taking mark puts the medicine back on the list.
  **I'm taking this**, on an older prescription, asks first.
- **Filled**: how many times, and when last, from insurance claims. A prescription
  the record calls finished but filled since is current again, and says so. Fills the
  record doesn't list get their own part. How much a fill was for is only for
  the person checking medicines: My medicines never says what a fill suggests.
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
  A source with no medicines to give is named under the heading ("<Source>: no
  information about medicines" or "<Source>: no medicines known").
- When the patient's records disagree and they haven't said which is right,
  "Records disagree: ask the patient" is the first part under Medicines, with
  one card per medicine. The patient's answer comes first when there is one
  ("Patient isn't sure"), then each source's version under its source and its
  record's date, and, when they disagree on whether it's still taken,
  "Records say: current" or "Records say: stopped". The same goes for a Not
  taking mark against a newer prescription: the record, then the mark, under
  "Patient says not taking". A version the patient chose is an ordinary card
  that says "Patient confirmed this", with each other source's as "Other
  record". See what's inside says the same, word for word.
- A source that didn't load is named under Medicines: "<Source> didn't load."
- **Fill suggests**: when the newest fill says how many and for how many days,
  the card says "Fill suggests about 2 a day (60 for 30 days)", to the nearest
  half, and only between half and 12 a day. It's something to ask about, never
  the dose.
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
   claims: the drug (RxNorm, or an NDC looked up in RxNav's `ndcstatus` by the
   fill's date), the fill date, the insurer, and how many for how many days
   (the item's `quantity` and its CARIN Blue Button `dayssupply`). It starts
   alongside steps 3 and 4 with its own 6-second limit, so a slow insurer
   never holds up the medicines.
6. `GET AllergyIntolerance?patient={id}`, all pages, alongside, with its own
   6-second limit. Mistaken, ruled-out and past entries are left out.
7. RxNav lookups for each RxNorm code: its ingredients and salt
   (`related?tty=IN+PIN`), and its term type and whether RxNorm retired it for
   another code (`historystatus`), asked together under one time limit. They
   group strengths of the same drug and match fills to medicines, but only of
   the same form and salt.

Nothing is written to the health record. Nothing runs on a schedule.

A record goes by its most specific RxNorm code (the one marked `userSelected`,
else a product before its parts and ingredients), so Epic's Excedrin, coded
acetaminophen first, isn't Tylenol. A record coded only by ingredient or brand
name (Cerner's "lisinopril") never joins another by code. A record finds its
Medication whether it's contained, a document's `urn:uuid`, or an address.
Release words, the time ("24 HR") and salt words are part of the form wherever
the name says them, and a form the name doesn't say never matches.

Records that name no medicine ("Medication", "Unknown medication", "None", no
drug code) are left out; a note on My medicines and the staff page counts them.
An IPS "no medication" entry (`no-medication-info`, `no-known-medications`) is
never a medicine: it's kept as that source's line, unless that source lists a
medicine too. Without RxNav, a code counts only when its name reads as a
product (a strength and a form); any other is taken as an ingredient's. So
does a code RxNav types as anything but a product, except a strength alone
(SCDC) when the record's own words name the form. A form needs a dose-form
word (tablet, injection, ophthalmic solution); release and salt words only
narrow it. A coded medicine with no name still shows, as "Unnamed medicine
(RxNorm <code>)". Each code is looked up once, and a record's lookups stop
at its first product. An allergy entry that doesn't say
what it's to gets its own row, or a note for staff, with everything else it says.
So does one whose code only holds a place: IPS `no-allergy-info`, a
nullFlavor or data-absent-reason code, or "Allergy to substance"
(SNOMED `419199007`); it's never called "NoInformation" or "Unknown". "No known
allergies" is read from SNOMED's codes (no known allergy, drug, food,
environmental or latex allergy), IPS `no-known-allergies` by its code alone,
and from the whole entry's words, any case, with a dot or not: "NKA", "NKDA",
"NKMA", "N.K.A.", "No Known Allergies (NKA)", "Patient has no known
allergies". A none code beside words that name something is an allergy, and
so is any "none" with a real allergen code beside it ("NKA" over RxNorm
penicillin shows as the penicillin) or with a reaction (an unnamed allergy
that keeps its reaction), so nothing it says is lost.

**The same person.** A second source joins the list only when its patient has
the same name and birth date as the first source's. The name is the
`official` one, else the `usual` one, else the first that isn't old, maiden, a
nickname or anonymous, skipping any without a family and a given name. Text-only names are read as "LAST, FIRST" when there's a
comma and "First Last" when not, with "van de" and other particles kept in the
family name. The whole family name must match ("García López" isn't "Garcia"),
and given names are compared word by word as far as both go: a middle name
left off or cut to its initial still matches ("Amy V." is "Amy" and "Amy
Victoria"), but two different ones don't ("Mary Ann" isn't "Mary Beth", as
twins can be). Capitals, accents,
punctuation and Synthea's numbers at the end of a word ("Loria621") don't
count; letters of any alphabet do, and ü, ö, ä and ß match ue, oe, ae and ss.
Jr. against Sr., or II against III, is two people, however they're written
(Junior, 2nd); an ending on one side only, or a degree such as MD, is
ignored. A birth date is read as written: a datetime's first 10 characters,
never moved to local time. 1900-01-01, 1901-01-01, 1800-01-01, 0001-01-01, a
partial date, and `_birthDate` with a data-absent-reason count as no birth date.

**Unknown is never none.** When medicines, insurance fills, allergies or the
patient's own additions couldn't be loaded, or the server says it left
something out, My medicines and the staff page say so and no empty part says
"none". Home and the Medicines heading leave the number off when the
medicines or the patient's own part didn't load, no record has a medicine
name, or a source said it has no medicines to give.

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
A source's "no medicines" line travels as a Bundle tag (`no-medicines`), never
as a medicine. When sources disagree and the patient hasn't settled it, or
isn't sure, each source's version is its own `MedicationStatement` with its own
source and words, and a `differs` tag lists their entry numbers. A Not taking
mark against a newer record travels the same way: the record and the patient's
mark. An answered one is the chosen version, with the others as notes. A source
other than the first that didn't load is named in a `source-not-loaded` tag,
which the staff page, See what's inside and the FHIR file's text say as
"<Source> didn't load.". What the newest fill suggests a day is a note on that
medicine, for staff only.
Brown Bag's own tags carry their value in `display` and mean nothing to another
system, so an older staff page still shows every version, each with its notes.
Each unsettled version also says its record's date. When the list is long,
codes go first, then the other versions' notes shorten to the source and month,
then the record dates go; a version is never left out, and the list is too long
for one QR code first. The packing borrows the trimming rules and
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
  are to check. Staff see a "Records disagree: ask the patient" part (built),
  one card per medicine with the patient's answer first, and a source that
  didn't load is named.
- **A second QR code** (idea): a flip on the QR screen, one side today's code, the
  other a SMART Health Link a clinic's system can read.
- **Scanning pill bottles** (idea): a small model on the phone reads a
  bottle's label into the add form, and the patient checks every field before
  it's saved. The photo never leaves the phone.
- **Reading directions** (idea): a small model on the phone recognizes that
  "Take 1 tab PO BID" and "1 tablet by mouth twice a day" say the same thing.
  It only suggests, and never settles a disagreement.
- **Other ideas:** reminders to open Brown Bag before an appointment, and,
  with several sources, a line for each saying when Brown Bag last read it.

### Back end

- **Medicare fills** (designed and planned): Part D fills from Medicare's Blue
  Button API join the fills from claims. It adds one small server function that
  only swaps and renews Medicare's sign-in; the list never passes through it.
  Waiting on Medicare's approval. Design:
  [`docs/superpowers/specs/2026-11-22-medicare-blue-button-design.md`](docs/superpowers/specs/2026-11-22-medicare-blue-button-design.md).
- **When sources disagree** (being built): every source's version is
  kept and compared fresh on each update; nothing is overwritten. The
  comparing is built and runs on every update; with one source the list is
  as before. The QR code carries both sides of anything unresolved (built);
  the FHIR file is next, with a `DetectedIssue` for each. Design:
  [`docs/superpowers/specs/2026-11-25-medication-reconciliation-design.md`](docs/superpowers/specs/2026-11-25-medication-reconciliation-design.md);
  plan: [`docs/superpowers/plans/2026-11-25-medication-reconciliation.md`](docs/superpowers/plans/2026-11-25-medication-reconciliation.md).
- **More health systems and insurers** (named, not designed): Epic, Oracle Health,
  MEDITECH, Medicaid and pharmacy fills, as listed under **Not connected**.
- **SMART Health Links** (ideas): the second QR code carries the International
  Patient Summary, and links others share with the patient can be read. Both need
  a server to hold the encrypted file, so when they arrive Brown Bag becomes built
  for server deployment, and the privacy page says what that server keeps, for how
  long, and how it's deleted.
- **Two sign-ins for one person** (idea): two sandbox records for the same
  made-up person, connected separately, so reconciliation meets a real second
  health system. Needs more than one connection, which comes with Medicare.
- **Sending changes back to the clinic** (idea), with the clinic's permission.
- **Testing at scale** (idea): tens of thousands of synthetic patients from
  Synthea, copied into several sources and roughed up the way real ones are, so
  every run counts wrong joins and wrong splits; plus openFDA, FAERS, RxNorm and
  CMS synthetic claims. Before real patients, a pharmacist reviews the rules.
  The first piece exists: a Google Colab notebook that runs Brown Bag's own
  matching on hundreds of synthetic patients, counts its mistakes, and uses a
  model only to flag cases for a person to review. The model never goes into
  the app.
- **Records as real sources write them** (built; waiting on the phone pass):
  Epic's, Cerner's, claims' and IPS's ways of writing medicines, allergies
  ("NKA", IPS "no information about allergies"), names ("SMART, JOE", an old
  name first, any alphabet) and birth dates are read as described above. Still
  open: a nickname against a legal name (Bill and William) stays apart, and an
  old or maiden name is never compared. Research:
  [`docs/superpowers/research/2026-11-25-messy-data-findings.md`](docs/superpowers/research/2026-11-25-messy-data-findings.md);
  plan: Task 6d of
  [`docs/superpowers/plans/2026-11-25-medication-reconciliation.md`](docs/superpowers/plans/2026-11-25-medication-reconciliation.md).
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
| `js/med-list.js` | One source's search answers into its list: references, RxNav term types, "no medicines" entries. |
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
| `tools/` | Local https server, the demo patient scripts and the logo source. |
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

Two more added patients have records that disagree, for trying two sources with
the home server's test clinic (below). They're there only after
`node tools/reconcile-patients.mjs`, until the next reset. The script also writes
each one's test clinic file, with dates from the same day, so run it again before
testing on another day.

- **Riley Reconcile** (`brownbag-recon-riley`, born 1948-06-02): lisinopril 10 mg
  in the sandbox and 20 mg at the clinic; methotrexate weekly against daily;
  atorvastatin current in the sandbox, stopped later at the clinic; Zoloft and
  generic sertraline, which agree; regular and extended-release metformin, a
  possible duplicate, whose fill says 60 for 30 days; lisinopril with hydrochlorothiazide beside lisinopril; an
  active hospital IV order; levothyroxine stopped in the record but filled since;
  and amlodipine, which only the clinic lists.
- **Jordan Partial** (`brownbag-recon-jordan`, born 1955-11-20): a stop dated by
  year only, an undated stop, and a clinic file that says it held records back.

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
Riley and Jordan (Test patients, above) each get their own clinic file; anyone
else gets Loria's. Against Loria Jenkins it disagrees on a dose and on a stop,
agrees on one medicine and adds one she doesn't have. `?demo=someone-else` in the page
address makes its birth date a day off, so it's kept out as not matching. Only the home server
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
