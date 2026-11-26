# How Brown Bag works

The whole tour, screen by screen, and what happens behind each screen. The
[README](../README.md) has the short version. This page is in two halves,
the same as the README: the **front end**, what the patient and the person
checking their medicines see, and the **back end**, what happens behind the
screen to make that work. It describes Brown Bag as it is today; what's
coming is in the README's "What's planned".

## Where the records come from

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
fits or doesn't, are in [`SANDBOXES.md`](SANDBOXES.md#sandboxes-looked-at).

It's built to be simple: one main screen, big buttons, plain words, and made to
WCAG 2.2 AA. It's static pages with no Brown Bag server: everything runs on the
patient's phone, and the staff page in the staff member's browser.

## Front end: what people see

### The patient

**Signing in**
- **First run:** set up the lock (Face ID, a fingerprint or a 6-digit PIN), then
  **Connect your health records** lists the sources. **Connect** on the SMART
  sandbox opens a list of 20 test patients, each with their birth date ("Born
  May 8, 1974"). Back from the sandbox's page, or from "Starting sign-in…" or
  "Couldn't start sign-in", comes to that list, and Back again to the
  connections screen. Forward after Back from "Starting sign-in…" or
  "Couldn't start sign-in" never starts the sign-in by itself: it shows
  "Couldn't start sign-in" again. A reload of either screen does the same,
  and nothing starts until **Try again**, which signs in the same patient.
  (Forward after Back from the sandbox's page is the sandbox's page again.)
  After each sign-in the patient unlocks and comes back to that screen to
  connect the next; **Done** goes home. The same screen is **Health records**
  under More options.
- After that, the lock opens Brown Bag and the list updates by itself. It locks after 5 minutes without a tap or
  away, and the connection ends after 30 days unused.
- **Sign out** is for everyone on the phone. Saved lists stay, locked.

**Home** has their first name and last initial, **Show my QR code**, **My medicines
(N)** and **More options** (Health records, backups, the Home Screen, Privacy, Sign out).
When the records disagree, a line under the buttons ("Your records don't agree
on 2 things") opens the review below, unless some of the list didn't load.
There, the box on My medicines stays but drops its number ("Some of your
records don't agree."), as the Medicines heading does.

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
- A hospital's order for a stay (a MedicationRequest whose category is
  `inpatient`) isn't a home medicine: it goes under **Older prescriptions**,
  labelled "Hospital order", and is never compared with another source's
  record.
- A second source is added only when its name and birth date match the
  patient's. One that doesn't gets a line: "Records from <Source> don't match
  your name and birth date, so they aren't on your list." One that shares no
  name or birth date gets "<Source> didn't share a name and birth date, so its
  records aren't on your list."
- A source that lists no medicine and says it has no information about the
  patient's medicines, or knows of none, gets a line of its own ("<Source> has no information about your
  medicines." or "<Source> says: no medicines known."), never a card, and the
  list never reads as none.
- **When sources agree**, the joined card names every source that lists it
  ("Source: SMART sandbox, Valley Clinic (test records)"), as the staff page
  does. A card from one source names that one.
- **When sources disagree** on how much, how often, or whether it's still
  taken, the medicine is one card with each source's version and date, and a
  box under Allergies says "Your records don't agree on 2 things" with **Check
  them**; each such card also has **Check this**, for that card alone. While
  "How much do you take?" is open, the card goes by its plain name, every
  ingredient's whole name ("Lisinopril", "Insulin glargine",
  "Hydrochlorothiazide / Lisinopril"), never one source's strength. An amount
  in front of the name goes too ("0.4 ML enoxaparin …" is "Enoxaparin
  sodium", "72 HR fentanyl …" is "Fentanyl"), and a pack goes by what's in it
  ("{7 (norethindrone …) } Pack" is "Norethindrone"). The review asks one card per
  screen ("1 of 2"): "How much do you
  take?", "How often do you take it?" or "Do you still take it?", with each
  source's version, its source and month, "I don't take this anymore" and "Not
  sure, ask my doctor". Nothing is chosen at the start, and **Save** waits for
  a choice. A fill within the last year shows beside "Yes, I take it" ("Filled
  Oct 2026"), but never answers it; "within a year" is the same calendar rule
  as "Last filled over a year ago.", so a fill gets one or the other. **Do
  this later** closes it, and the box stays. Save or Do this later on a card
  opened with **Check this** or **Change** goes back to that card's button
  (or the My medicines heading when the card has none now). A card
  that's answered says what was picked, "You said: 20 mg, once a day (Nov 25)"
  or "You said: No, I stopped (Nov 25)", with **Change**. One the answer
  stopped ("No, I stopped", "I don't take this anymore") says only that, not
  "You marked: Not taking", even when the patient had tapped Not taking
  before and the review asked them to confirm it; when the records disagreed on how much or how
  often, it keeps each source's version and its plain name, never one
  source's dose.
  It's asked again only when a source says something new. The whole review
  comes back at the same card after the 5-minute lock; a single card opened
  with **Check this** or **Change** doesn't, and the box is there instead.
- **As needed** and **Not taking** move a medicine to its own part, with Undo.
  A prescription dated after a Not taking mark, or a source whose copy wasn't
  marked, puts the medicine back on the list, and the review asks "Do you still
  take it?". "Yes, I take it" takes the mark away; "No, I stopped" keeps it,
  and isn't asked again for that prescription.
  **I'm taking this**, on an older prescription, asks first.
- **Filled**: how many times, and when last, from insurance claims. When the
  newest fill is over a year before the day the list is opened, the card also
  says "Last filled over a year ago." The medicine stays where the records put
  it. A prescription
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
  and can save the FHIR file too. It gives the birth date as words ("Born May
  8, 1974", or "Born 1974" when that's all the record has).
- It says when the medicines and allergies were last updated. Changes made with no
  signal are in it, and listed on the screen, review answers too ("Answered
  Lisinopril: 10 mg, once a day"; a Change keeps only the newest, and Undo
  on a card an answer stopped takes its line away).

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

- They scan the QR code and type the patient's 6 digits on `share.html`. The
  page's address then loses the list, so the page's link shared or copied, or
  opened in a new tab, says "This link has no list in it. Ask the patient to
  show their QR code again." The tab keeps the locked list, so a reload, or
  coming back to the tab after the phone put it aside, asks for the 6 digits
  again. A second patient's link in the same tab takes the first one's place;
  Back and Forward between the two show each one's own code box, and each
  patient's own code opens it. The list on screen and Save as FHIR file keep working.
- The patient's name, then their birth date as words ("Born May 8, 1974").
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
  record"; once "Do you still take it?" is answered, a record that stopped it
  says so: "Other record (stopped): Valley Clinic (test records), 20 MG, …".
  See what's inside says the same, word for word.
- A source that didn't load is named under Medicines: "<Source> didn't load."
- A medicine whose newest fill is over a year before the day the page is
  opened says "Last filled over a year ago.", in the part the records put it
  in.
- **From the fill**: when the newest fill says how many and for how many days,
  the card has a "From the fill" row, "about 2 a day (60 for 30 days)", to the
  nearest half, and only between half and 12 a day. It's something to ask
  about, never the dose.
- **Save as FHIR file** saves an
  [International Patient Summary](https://hl7.org/fhir/uv/ips/) (2.0.1), after a
  warning that it isn't locked. A list where something didn't load can't be saved.
  When the records disagree, the file says so first ("Records disagree on 1
  medicine. Ask the patient."), then lists each source's version, as staff see it.

## Back end: what happens behind the screen

There's no Brown Bag server. All of this runs in the patient's browser (and, for
the staff page, the staff member's), and talks only to the servers named here.

### Signing in

**Launch.** The app's connections screen lists the sources. Connect on the sandbox opens `launch.html`'s test patients; choosing one opens its sign-in
as the next history step, so Back while it starts or after it fails is the
list. Once the sign-in page's address is known, it takes that step's place
(`location.replace`), so the list is in history once. The step notes in its
own `history.state` (`brownBagSignInStarted`) that the sign-in started, so
Forward to it after Back, a reload, or the page brought back as it was left
(`pageshow` with `persisted`) shows "Couldn't start sign-in" instead of
starting again, and never draws the list on that step; Try again takes the
note off and reloads. Choosing one (or a link
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

### Comparing the sources

When more than one source is read, `js/reconcile.js` joins them into one
list on every update, from each source's own records as they are that day.
Every source's version is kept on the card; nothing is overwritten, and an
earlier comparison is never reused. With one source the list is exactly as
before: one source never disagrees with itself. Today the only second
source is the home server's test clinic (`js/demo-source.js`, port 8443
only; see [SANDBOXES](SANDBOXES.md)).

- A second source joins only when it's the same person (above).
- Records from different sources join one card by the same RxNorm code, the
  same product name, or the same ingredients in the same form. A first word
  alone, a different form, or a combination beside one of its ingredients
  stays apart, with a note for staff ("May be the same medicine as …",
  "Possible duplicate of …").
- On a joined card, the current records are compared on strength and coded
  amount ("how much"), coded timing, weekly or longer always counting ("how
  often"), and current against stopped ("still take it"), unless the stop is
  clearly older. Directions that differ only in words are for staff only
  ("Worded differently in <Source>: …").
- A hospital order never joins a card. A source that didn't load, or held
  records back, is named on every card it's part of, so it never vouches
  that the sources agree.
- A Not taking mark older than a current prescription, or on one source's
  copy only, is a question too ("Do you still take it?").
- An answer holds while every source still says what it said when the
  patient answered; when one changes, the question comes back.

The rules, and why, are in the
[design](superpowers/specs/2026-11-25-medication-reconciliation-design.md).

### Keeping it on the phone

- The list is saved encrypted on the phone, with the lock's key, so it opens and
  the QR code works with no signal.
- The service worker keeps only the app's own files for no signal. It never
  stores health data, and asks the network first, except for the pictures.
- A backup holds what the patient added or marked, never a sign-in, sealed to
  each person.
- The patient's answers in the review are kept with what they added or
  marked: encrypted, in the same saved copy and backups. Each answer keeps the
  sources' versions as they were, and holds only while they say the same.
  Where they are in the review is only the card's number, in the browser
  tab's session storage (`brownbag-review-spot`), so it survives the lock's
  reload. It's cleared when the review closes.

[Privacy](https://burroclurse.github.io/BrownBag/privacy.html) ([`privacy.html`](../privacy.html)) says what's kept and
who can see it. Each page's content security policy names the servers it may
contact: the app, only the sandbox and the drug name service; the staff page, none.

### The QR code and the FHIR file

**The QR code** holds a FHIR `Bundle` (type `collection`) of `Patient`,
`MedicationStatement` and `AllergyIntolerance` resources, compressed, encrypted with a key made from
the 6-digit code, and written after the `#` of a `share.html` link (browsers
never send that part to a server). The staff page reads that part once, then
takes it off the address with `history.replaceState` on the same history
step, so the address bar and a link shared from the page have no list;
what's on screen and Save as FHIR file use the copy it read. The same call
keeps that locked text, exactly as the QR code holds it and never the
unlocked list, in the step's `history.state` (`brownBagSharedList`). It stays
until the tab is closed, with no time limit, and a tab reopened from the
browser's recently closed tabs may have it again, still locked: a reload, or Safari reloading a
tab it put aside, reads it there and asks for the code again, while a copied
address or a new tab has none. A new link in the same tab is its own step,
and keeps its own. Every step has the same plain address, so Back and Forward
between them don't load the page; on `popstate` the page reloads when the
step keeps a different list from the one it read (never for the same one,
so it can't reload over and over). The staff browser's history still remembers the link it
opened ([LIMITS #15](LIMITS.md)).
Birth dates are read as written, never through a JavaScript `Date`, so a
phone west of UTC shows the same day. The note about a fill over a year old
isn't in the code or the FHIR file: each screen works it out from the fill
date it already has and the phone's own date. The allergies keep the FHIR R4 rules and follow
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
medicine ("Fill suggests about 2 a day (60 for 30 days)"), for staff only.
Brown Bag's own tags carry their value in `display` and mean nothing to another
system, so an older staff page still shows every version, each with its notes.
Each unsettled version also says its record's date. When the list is long,
codes go first, then the fill hints, then the other versions' notes shorten
to the source and month, then the record dates go; a version is never left out, and the list is too long
for one QR code first. The packing borrows the trimming rules and
numeric encoding of [SMART Health Cards](https://spec.smarthealth.cards/).
The list never passes through a server.

**The FHIR file** is made in the browser from the opened QR code (`js/ips.js`): an
IPS 2.0.1 document, with every part read, checked and written again. Brown
Bag's own tags stay out; their warnings are in its readable text. When the
records disagree, each source's version is its own `MedicationStatement` with
its notes ("Records disagree", "Records say: stopped", "Record date: 2026-03",
"Patient isn't sure", or, once answered, "Other record: …"), and the Medicines
section's title, a note on it and its readable text say "Records disagree on 2
medicines. Ask the patient." ("1 medicine" for one). There's no `DetectedIssue`:
IPS 2.0.1 allows only medicine records in that section
([LIMITS #26](LIMITS.md)). A source's "no medicines" line is only in the
readable text, as staff see it ("<Source>: no information about medicines" or
"<Source>: no medicines known"), with no coded entry: IPS 2.0 dropped its code
list for that. HL7's validator (7.0.7) passes the test files made this way
with no errors.
