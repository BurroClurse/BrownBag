# Building Brown Bag: a learning log

This file walks through everything we've done to build Brown Bag, in order,
and explains what each piece is and why it's there. It gets a new section
every time a build step finishes.

Read it top to bottom the first time. After that, use the glossary at the
end when a word comes up you don't remember.

It goes hand in hand with your [SMART on FHIR Interactive Lab](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#start-here).
Wherever a "Practice in the lab" line appears, that part of the lab lets you
see the same idea step by step. The lab's tabs open directly from these links:
[Start Here](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#start-here), [Guided Lab](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#guided-lab),
[Watch the Flow](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#watch-the-flow), [Tokens](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#tokens) and
[Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

---

## Part 1. The big picture

### What Brown Bag does

A pharmacist's "brown bag review" is when you bring every pill bottle you own
in a bag, so they can see what you really take. Brown Bag puts that bag on
your phone.

1. You sign in to your health records through Brown Bag.
2. It pulls every medicine your records list, removes the duplicates, and
   shows one clean list.
3. You add what the records don't know about: vitamins, supplements, things
   you buy at the store. You mark anything you've stopped taking.
4. At check-in, you show a QR code. The nurse scans it, types the 6-digit
   code you read out, and sees your real list.

### How the pieces connect

```
 Your phone (Brown Bag web page)
   │
   │ 1. "Sign in"  ──────────────►  SMART sign-in page (the health system's)
   │                                 you pick a patient and approve
   │ 2. comes back with a pass  ◄──  (an "access token")
   │
   │ 3. "Give me this patient's medicines" + the pass
   │ ─────────────────────────────►  FHIR server (the health records)
   │ ◄─────────────────────────────  MedicationRequest, MedicationStatement
   │
   │ 4. "What is 'ibuprofen'?"  ───►  RxNav (US drug list, from NLM)
   │
   │ 5. Saves your additions, scrambled, on the phone
   │
   └ 6. Shows a QR code ─────────►  Nurse's phone opens share.html,
                                     types the 6-digit code, sees the list
```

There is no Brown Bag server. The app is just web pages and JavaScript files.
Everything runs inside the browser on the phone. That keeps it simple and
means we never hold anyone's health data.

**Practice in the lab:** arrows 1 to 3 are the SMART sign-in. [Watch the
Flow](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#watch-the-flow) animates each message, and [Start
Here](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#start-here) explains who the players are.

---

## Part 2. What we did before writing code

### 2.1 Picking the idea

We looked at the 91 apps in the SMART App Gallery, studies on wrong medication
lists, and what Apple, Google and Samsung already offer. Wrong medication lists
are a real, measured problem: in a 2026 US study, pharmacists found mistakes in
48% of ER patients' lists. The big phone companies pull records together, but
none of them keep "what my records say" separate from "what I actually take."
That gap is Brown Bag.

### 2.2 The repository

A **repository** (repo) is a project folder that remembers every change ever
made to it. Ours lives in two places:

- On your Mac: `~/Developer 2/HL7-Build-the-Code/BrownBag`
- On GitHub: `github.com/BurroClurse/BrownBag`

Your repo is a **fork** of the course starter (`samoanGuy7/Smart-App`). A fork
is your own copy that remembers where it came from. Changes in his repo never
reach yours unless you press "Sync fork". We decided never to press it.

A repo has **branches**: separate lines of work.

- `main` is what GitHub Pages publishes at `burroclurse.github.io/BrownBag/`.
  We don't touch it until Brown Bag is ready.
- `brown-bag-v1` is where all the building happens.

Each saved change is a **commit**, a snapshot with a short message. **Pushing**
copies the commits from your Mac to GitHub, which is our backup.

Try it. This shows every commit on the branch, newest first:

```bash
cd "/Users/tylerbeattie/Developer 2/HL7-Build-the-Code/BrownBag" && git log --oneline
```

### 2.3 The design and the plan

Before building, we wrote two documents in `docs/superpowers/`:

- **The design** (`specs/2026-11-17-brown-bag-design.md`) says *what* to
  build and *why*: the three features, security, accessibility, what's left
  for later.
- **The plan** (`plans/2026-11-17-brown-bag.md`) says *how*, in 11 numbered
  steps, each with the exact files and the tests that prove it works.

Writing these first means decisions are made once, out loud, and you approved
them before any code existed.

---

## Part 3. How we build: tests first

Every step follows the same loop, called **test-driven development**:

1. **Write a test** that describes what the code should do. Example: "three
   prescriptions for lisinopril become one line that says prescribed 3 times."
2. **Run it and watch it fail.** The code doesn't exist yet, so it must fail.
   If it passes, the test isn't checking anything.
3. **Write the code** until the test passes.
4. **Run every test** to make sure nothing else broke.
5. **Commit and push.**

Tests live in `tests/`. Node.js (a program that runs JavaScript outside the
browser) runs them. Try it:

```bash
cd "/Users/tylerbeattie/Developer 2/HL7-Build-the-Code/BrownBag" && node --test "tests/*.test.mjs"
```

At the bottom you'll see `pass` and `fail` counts. Right now it's 42 passing.

Why bother? The medicine list, the encryption and the QR link are all things
you can't check by eye. A test checks them the same way every time, in under
a second.

---

## Part 4. The build, step by step

### Step 1. The medicine list (`js/meds.js`)

**What it does.** Health records store medicines in a format called **FHIR**.
A prescription is a **MedicationRequest**. "The patient says they take this"
is a **MedicationStatement**. Here's a shortened real-world example:

```json
{
  "resourceType": "MedicationRequest",
  "status": "active",
  "authoredOn": "2023-03-02",
  "medicationCodeableConcept": {
    "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                 "code": "314076",
                 "display": "lisinopril 10 MG Oral Tablet" }]
  },
  "requester": { "display": "Dr. Patel" }
}
```

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "USCDI and US Core"
shows which kinds of data, medicines included, US health systems must provide.

`meds.js` turns each of those into one simple item: name, dose, how often,
who prescribed it, start date, and whether it's current or old.

**Removing duplicates.** Every medicine has an **RxNorm code** (`314076`
above), a number that means exactly one product. If the records hold three
prescriptions with the same code, we keep the newest and say "prescribed 3
times." If a record has no code, we match by name instead, ignoring capitals
and extra spaces.

**Dose changes.** Lisinopril 10 mg and lisinopril 20 mg have different codes,
but they're the same medicine. Step 4 asks RxNav for each product's active
ingredient, and `meds.js` merges them into one line that says "dose changed
from 10 MG to 20 MG on 2024-05-01." A nurse cares about that a lot.

**What you'd see.** Nothing yet. The screen comes in step 7.

### Step 2. Scrambled storage on the phone (`js/vault.js`)

**The problem.** The medicines you add are saved in the browser's storage on
your phone. Anyone with your unlocked phone and some know-how could read that.

**The fix: encryption.** Encryption scrambles data with a **key** so it's
unreadable without that key. We use **AES-GCM**, the same kind of encryption
banks use. It also detects tampering: change one letter and it refuses to
unscramble.

**Where the key comes from.** Two ways, both in step 6:

- **Face ID or fingerprint (a passkey).** The phone gives the app a secret
  only after it recognizes you. The app turns that secret into the key.
- **A 6-digit PIN**, for phones that can't do the first one. A PIN is short,
  so we run it through **PBKDF2**, which repeats a calculation 600,000 times.
  That makes each guess slow, so trying every PIN takes much longer.

**Backups.** Safari erases a site's saved data after seven days without a
visit. So `vault.js` can write a backup file (still scrambled) that you keep
in Files or iCloud, and restore later.

A test checks that the stored text never contains the medicine's name. That
proves it's really scrambled.

### Step 3. The QR link (`js/share.js`)

**What goes in it.** A small FHIR **Bundle**: your name, birth date, and one
MedicationStatement per medicine, in three groups: from records, added by you,
and stopped by you. Using FHIR means a records system could read it later.

**How it's packed.**

1. The list is **compressed** (like zipping a file) so it fits in a QR code.
2. It's **encrypted** with a key made from two halves: a random secret that
   goes inside the link, and the 6-digit code you read out loud.
3. The result goes after the `#` in the link:
   `burroclurse.github.io/BrownBag/share.html#v1.Xk3...`

Browsers never send the part after `#` to the web server, so GitHub never sees
the list. The nurse's phone unscrambles it right there on the page.

**The limit we accepted.** Without a server, nothing stops someone who
photographs the QR code from trying all million 6-digit codes on their own
computer. It stops casual snooping, not a determined attacker. The proper fix,
a SMART Health Link with a server that limits tries, is on the Later list.

**Size.** A QR code holds about 2,300 characters at the error-correction level
we use. A test proves a 60-medicine list is too big and a 5-medicine list
fits. Too-long lists show a message instead.

### Step 4. Drug names (`js/rxnorm.js`)

**RxNav** is a free service from the National Library of Medicine. You give it
a word, it gives back real products with their RxNorm codes. When you type
"ibuprofen," Brown Bag shows "ibuprofen 200 MG Oral Tablet" to pick from, so
your additions use the same codes as your records.

If RxNav can't be reached, you can still type the name freely. Your list never
depends on it.

The tests use a **fake fetch**: a stand-in that answers like RxNav without
using the internet. That keeps tests fast and lets us test "RxNav is down" on
purpose.

### Step 3b. Packing the QR code the Health Card way (`js/share.js`)

Added Nov 20, after you read about **SMART Health Cards**: QR codes that
carry signed health records, defined in HL7's SMART Health Cards and Links
guide. Brown Bag can't sign cards (there's no server to keep a signing key),
but it borrowed two of their packing tricks.

**1. Trimming the Bundle.** The guide has rules for shrinking a FHIR Bundle
before it goes in a QR code. Records lose their `id`, and instead of
`"Patient/self"` they point to each other with short names: the Patient is
`resource:0`, and every medicine says its `subject` is `resource:0`. We kept
one thing the rules would drop, the medicine's name in text, because the page
staff see works without internet and can't look names up.

**2. Writing the list as digits.** A QR code can store data in several
modes. Letters cost 8 bits each. Digits are packed three at a time into 10
bits, about 3.3 bits each. So each character of the packed list becomes two
digits: its character code minus 45 (`A` is 65, so it becomes `20`). Two
digits cost about 6.7 bits instead of 8. The web address stays as normal
text, and the QR code holds both parts.

**The result:** with long, made-up medicine names, one QR code now holds **60
medicines instead of 47**. Nothing changes on screen. The link now starts
`share.html#v2.` followed by digits.

**How the "will it fit" check works.** `fitsInQr` adds up the bits: 20 for
the text part's label plus 8 per character, then 18 for the digit part's
label plus 10 for every three digits. The biggest QR code at the error
correction level we use holds 18,648 bits.

**Tests first, again.** Six new or changed tests failed before the change:
the new link form, no ids in the Bundle, broken digit links refused, and the
"60 beats 47" comparison. Then all 55 passed.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "USCDI and US Core" shows
the kind of FHIR records that end up inside a Bundle like this one.

### Step 5. Running it on your Mac with https

**Why https matters.** Browsers only allow encryption, Face ID unlock and the
camera on **secure pages**: ones served over https. GitHub Pages is https.
But while building, the app runs on your Mac, and your phone reaches it over
home Wi-Fi, which isn't https on its own.

**Certificates.** https works because the website shows a **certificate**, a
digital ID signed by a company your phone already trusts. Your Mac can't buy
one for a home address like `192.168.0.224`.

**mkcert.** A free tool that makes your own private certificate authority (a
master ID only your devices trust) and uses it to sign a certificate for your
Mac. What we did:

1. `brew install mkcert` installed the tool. Homebrew is a Mac app installer
   for developer tools.
2. `mkcert -install` made the master ID (`rootCA.pem`) and told your Mac to
   trust it. That's why it asked for your password twice.
3. I made a certificate for `localhost` and `192.168.0.224`, saved in
   `.certs/`. That folder is listed in `.gitignore`, so it never goes to GitHub.
4. You install `rootCA.pem` on your iPhone and switch on trust, so the phone
   trusts it too.

Keep `rootCA-key.pem` on your Mac only. Anyone with it could make websites your
devices would trust.

**The local server (`tools/serve.mjs`).** A short program that hands out the
app's files over https on port 8443. Start it with:

```bash
cd "/Users/tylerbeattie/Developer 2/HL7-Build-the-Code/BrownBag" && node tools/serve.mjs
```

It prints the addresses to open. Press Control-C to stop it. It refuses
requests for hidden folders like `.certs/`, so nobody on your Wi-Fi can
download the certificate's private key.

**Scopes.** When the app sends you to sign in, it lists what it wants to read.
Those are **scopes**. The starter asked only for `patient/Patient.read`. We
added:

- `patient/MedicationRequest.read`: prescriptions
- `patient/MedicationStatement.read`: what the record says you take
- `patient/Medication.read`: drug details some records point to
- `patient/Practitioner.read`: the prescriber's name

`patient/` means "only this patient's records." `.read` means look, never
change.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Granular scopes" and
"Wildcard scopes vs. specific scopes" show why asking for exactly these four
beats asking for everything. The [Guided Lab](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#guided-lab) has a step on
scopes that reads the list a real server advertises (`scopes_supported`).

**Staying signed in.** Right now you sign in again every time you open the
app. Fixing that needs the `offline_access` scope. We checked the test
server's settings page (`.well-known/smart-configuration`) and it supports it,
so that can be built later.

**Practice in the lab:** the [Guided Lab](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#guided-lab) starts with that
same settings page (the discovery file). The [Tokens](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#tokens) tab
explains access tokens and the refresh tokens that `offline_access` adds.
When something breaks in your own testing, [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸
"Debug with browser DevTools" and "Error scenarios and fixes" walk through
finding the cause.

**Signing in from the phone (Nov 20).** You trusted the certificate on your
iPhone, opened `https://192.168.0.224:8443/launch.html`, and signed in. The
sandbox's **Authorize App Launch** screen listed every scope above, and
after Approve the phone landed on the starter's "My record" page. That proves
the whole chain works on a real phone: https, sign-in, scopes, and coming
back to the app.

You can switch the certificate's trust off between test sessions (Settings ▸
General ▸ About ▸ Certificate Trust Settings) and back on to test.

**Looking at real data before trusting our rules.** Step 1's rules were
written from made-up examples. So we saved the medicine records of four real
sandbox patients into `tests/fixtures/` (the data is made up by the sandbox,
so it's safe in a public repo):

- one with 48 prescriptions for 14 different medicines
- one whose prescriptions point to a separate **Medication** record for the
  drug name
- one with only "what the patient says" records (MedicationStatement)
- one with no medicines at all

New tests run Step 1's code over each one and check that **no medicine is
dropped**: every different drug in the records appears exactly once.

They passed, but the data showed one surprise. All 12 records for the third
patient have the status `unknown` and no dates. Our rule only counted
`active` as current, so all 12 would have gone under the collapsed "Older
prescriptions" heading, and **off the QR code**. That's the "looks complete
but silently drops medicines" mistake the design warns about. New rule: a
MedicationStatement with status `unknown` and no end date stays on the main
list, where the patient can tap "I stopped this" if it's old. The test for
the new rule failed first, then passed after the one-line change.

**Lesson:** test with real data early. Made-up examples only contain the
cases you already thought of.

**Practice in the lab:** the [Guided Lab](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#guided-lab) runs the same
sign-in you just did on the phone, so you can watch each step happen.

### Step 6. The lock (`js/lock.js`, `js/lock-screen.js`)

**What it does.** The first time Brown Bag opens, it asks you to set up a
lock. After that, every time it opens, it asks for Face ID, your fingerprint,
or a 6-digit PIN before showing anything.

**Where the key comes from.** Your additions are encrypted (Step 2), and
encryption needs a key. The key is never saved. It's rebuilt each time you
unlock:

- **Face ID or fingerprint:** a **passkey** (a sign-in kept in your phone's
  secure chip). Passkeys have an add-on called **PRF**: give it the same
  random input and it always returns the same secret, but only after Face ID
  says it's you. That secret becomes the key.
- **PIN:** for phones or browsers without PRF. The key is made from the PIN
  with PBKDF2 (Step 2), which repeats a calculation 600,000 times so guessing
  PINs is slow.

**Telling a right PIN from a wrong one.** A wrong PIN still makes *a* key,
just the wrong one. So at set-up Brown Bag encrypts a small known phrase and
saves it. Unlocking tries to decrypt that phrase. If it fails, the PIN was
wrong, and you see "That PIN didn't work."

**Why the lock is part of the main page.** The plan had a separate lock page
that sent you back to the main page after unlocking. But a key kept only in
memory disappears when the browser changes page. So the lock screen is drawn
inside the main page instead, and the key never has to be saved anywhere.
Closing or reloading the page locks Brown Bag again.

**A surprise about addresses.** Passkeys refuse plain number addresses like
`192.168.0.224`. On that address Brown Bag falls back to the PIN. To test Face
ID on your phone, the test certificate now also covers your Mac's network
name, `Tylers-Mac-mini-351.local`, and the server prints that address too.

**Tests first.** 11 tests use a pretend passkey that behaves like a real one
(same input, same secret). They failed first because `js/lock.js` didn't
exist, then all passed. The screens themselves get checked by hand on your
phone.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Error scenarios and fixes"
is the place to go when a sign-in or unlock fails during your own testing.

### Step 7. The main screen (`index.html`, `js/app.js`, `js/view.js`)

**What you see.** After unlocking and signing in: your name and birth date,
the disclaimer, then four parts. "From your records" (each medicine with
dose, prescriber, start date and source, plus "I stopped this"), a folded
"Older prescriptions", "Added by me" with "+ Add a medicine or supplement",
"Stopped by me", and "Show my QR code" with the 6-digit code in big digits.

**How the records are fetched.** Two FHIR searches, one per kind of record:

```
MedicationRequest?patient=<id>&_include=MedicationRequest:medication
MedicationStatement?patient=<id>&_include=MedicationStatement:medication
```

`_include` asks the server to send the separate **Medication** records some
prescriptions point to, in the same answer. That's how the drug name is found
when a prescription only says "see Medication/123". fhirclient's
`pageLimit: 0` keeps asking for the next page until every record is in.

**Then Step 1's code runs:** merge repeats, look up ingredients in RxNav,
merge strengths of one medicine, and split current from older.

**Never `innerHTML`.** Every piece of text from the records or from you goes
in with `textContent`, so a medicine named `<b>test</b>` shows those
characters instead of turning bold. That stops a booby-trapped record from
running code in your app.

**Integrity checks.** The two outside scripts (fhirclient and the QR code
maker) now carry an `integrity` hash. If the download site ever served a
changed copy, the browser would refuse to run it.

**A robot test run.** Chrome can run with no window and be steered by a
script. A test script set up a PIN, signed in to the sandbox as a test
patient, marked a medicine stopped, added `<b>test</b>`, searched RxNorm,
showed the QR code, and reloaded to check everything was kept. It caught three
things the unit tests didn't:

- Dates showed the full timestamp (`2023-11-21T20:36:37+00:00`). Now just the
  date.
- "dose changed from 0.4 MG to 0.4 MG/ACTUAT": the same amount, once a tablet
  and once a spray. Same amount now means no dose-change line.
- An addition made at 8:30 PM said it was added tomorrow, because computers
  count dates in UTC (London time) unless told otherwise. Now it uses your
  phone's own date.

Each fix got a failing test first.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "USCDI and US Core" covers the
MedicationRequest records this screen reads.

### Step 8. The page staff see (`share.html`, `js/share-view.js`)

**What staff see.** Scanning the QR code opens `share.html`. It asks "Enter
the 6-digit code the patient gives you". With the right code it shows your
name, birth date, when the code was made, the disclaimer, and three groups in
large print: **From records**, **Added by patient**, **Patient says stopped**.

**Why the server never sees the list.** The list sits after the `#` in the
link. Browsers never send that part to the web server, so GitHub only
delivers the empty page. The unlocking happens on the staff member's device.
The robot check confirmed it: the requests to the server never contained
the list, and nothing at all was requested after the page loaded.

**Wrong or broken links.** A wrong code says "That code didn't work. Check it
with the patient." A link cut short says "This link is damaged. Ask the
patient to show a new code." Neither shows any part of the list.

**A bug the robot found.** If the page was already open and a second QR code
was scanned into the same tab, only the part after `#` changed. Browsers
don't reload the page for that, so the old patient's list stayed on screen.
Now any change to that part reloads the page.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Error scenarios and fixes"
for the kind of plain-language error messages this page uses.

### Step 9. Home Screen and backups (`manifest.webmanifest`, `js/install.js`)

**The problem.** iPhone Safari erases a website's saved data after 7 days of
using Safari without visiting that site. Your additions and "stopped" marks
live in that saved data. Two guards:

**1. Add to Home Screen.** Sites added to the Home Screen are exempt. A
**web app manifest** (`manifest.webmanifest`) gives Brown Bag a name, a
paper-bag icon and a full-screen look when opened from the Home Screen. In
Safari, a notice at the top says "Add Brown Bag to your Home Screen so your
list isn't erased: tap Share, then Add to Home Screen." On Android it points
to the browser menu. "Not now" hides it for 30 days. It never shows when
Brown Bag is already opened from the Home Screen.

**2. Backups.** "Save a backup" makes a file (for example
`brown-bag-backup-2026-11-20.json`) and opens the share sheet so you can put
it in Files or iCloud. The file is still encrypted, so a lost backup shows
nothing to whoever finds it.

**A gap we found and closed.** A backup is locked with your lock's key. But
the lock's own settings (the random salt and which passkey to ask) were kept
in the same saved data Safari erases. After a wipe, the key could never be
rebuilt, and the backup could never be opened. Now the backup also carries
the lock settings. They aren't secret: they're only directions for rebuilding
the key, which still needs your Face ID or PIN. The lock set-up screen has a
new "Restore from a backup" button for exactly this case.

**Tested by robot:** set a PIN, sign in, add "Backup test tea", save a
backup, erase all saved data the way Safari would, restore from the file
with the PIN, sign in again. The addition was back.

**Practice in the lab:** [Tokens](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#tokens) explains why sign-in itself
doesn't survive closing the app, which is separate from the saved list.

### Step 9b. Working with no signal (`sw.js`, `js/offline.js`)

**Why.** An ER or a basement clinic may have weak Wi-Fi and no cell signal.
Sign-in ends when the app closes, so without this you couldn't load your
list there, or make the QR code.

**Two pieces:**

1. **A saved copy of your list.** Each time your records load, Brown Bag
   saves a copy on the phone, encrypted with your lock's key, with the date.
   Even the patient id is hidden, so nothing about you is readable in the
   phone's storage.
2. **A service worker** (`sw.js`): a small script the browser runs in the
   background to keep a website's files on the phone. It keeps Brown Bag's
   own pages, code and icons, plus the two pinned libraries. It never keeps
   health data: anything going to the records server, the sign-in server or
   RxNav passes straight through and is never stored.

**What you see with no signal:** open Brown Bag from the Home Screen, unlock
as usual (Face ID and PINs work offline), and see "No connection. Showing
your list saved on Nov 20, 2026. It may be out of date." The QR code works
the same.

**Weak Wi-Fi.** A phone on bad Wi-Fi can believe it's online while sign-in
still fails. So whenever sign-in isn't available and a saved list exists,
Brown Bag shows it. If the phone thinks it's online, the notice says "Sign in
to update it" with a button.

**Tested by robot:** sign in once, close the session, switch the browser to
offline, reopen. The saved list and the QR code appeared, and the offline
store held 22 app files and no health data.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Debug with browser DevTools":
DevTools ▸ Application ▸ Service workers is where you can see `sw.js`, and
the Network tab has an Offline switch to try this yourself.

---

## Glossary

- **Access token**: the pass the sign-in page gives the app, used on every
  request for records.
- **AES-GCM**: the encryption method we use. Scrambles data and detects
  tampering.
- **Branch**: a separate line of work in a repo.
- **Bundle**: a FHIR package holding several records.
- **Certificate**: a website's digital ID, used for https.
- **Commit**: a saved snapshot of changes, with a message.
- **Compression**: shrinking data, like zipping a file.
- **FHIR**: the standard format for health records data.
- **Fork**: your own copy of someone else's repo.
- **_include**: a FHIR search option that also returns the records the results point to.
- **GitHub Pages**: GitHub's free hosting for web pages. It publishes `main`.
- **https**: the secure version of web pages. The padlock in the address bar.
- **Manifest**: a small file that tells a phone how to install a website like an app.
- **mkcert**: a tool that makes trusted certificates for testing at home.
- **Passkey**: a sign-in that uses Face ID, fingerprint or the phone's PIN.
- **PRF**: a passkey add-on that returns the same secret each time, after Face ID.
- **PBKDF2**: slows down guessing by repeating a calculation many times.
- **Push**: copy commits from your Mac to GitHub.
- **Repository (repo)**: a project folder with full history.
- **RxNav / RxNorm**: the US government's drug list and its lookup service.
- **Scope**: a permission the app asks for at sign-in.
- **Service worker**: a background script that keeps a site's files on the phone for offline use.
- **SMART**: the standard for how apps sign in to health records.
- **Test**: a small program that checks the real code does what it should.
