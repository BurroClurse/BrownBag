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
cd "/path/to/BrownBag" && git log --oneline
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
cd "/path/to/BrownBag" && node --test "tests/*.test.mjs"
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
cd "/path/to/BrownBag" && node tools/serve.mjs
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
name, `your-mac-name.local`, and the server prints that address too.

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

### Step 10. Accessibility checks

**The bar.** WCAG 2.2 level AA: the accessibility standard most US health
organizations are held to. In practice: strong contrast, every control
labelled for screen readers, big tap targets, a visible focus outline, works
at the largest text size, and nothing that depends on color alone.

**axe.** A free checker that reads a page and lists accessibility problems.
A robot run of headless Chrome opened every screen (lock set-up, PIN set-up,
signed out, PIN unlock, the list with the add form and older prescriptions
open, the QR code, and both states of the staff page) in light and dark mode
and ran axe on each. **No problems found.**

**Keyboard.** The robot pressed Tab through the main screen. Every control
was reached and each showed a focus outline.

**Large text.** The robot doubled the text size on a 320-pixel-wide screen,
the narrowest common iPhone width. The 6-digit share code, in big
spaced-out digits, was wider than the screen and made the page scroll
sideways. The code's size is now capped to the screen width. Both pages now
fit with no sideways scrolling.

**What a robot can't check:** how VoiceOver on iPhone and TalkBack on Android
actually read the screens. That's on your phone (see the list at the end of
this session's notes).

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Debug with browser DevTools":
Chrome DevTools also has a Lighthouse tab that runs an accessibility check
like axe.

### The final review (Nov 20)

A second reviewer, with fresh eyes and no part in writing the code, read the
whole branch against the design. It found problems the tests had missed,
because the tests only checked the cases we had thought of. Each fix below
got a test that failed first.

- **Different medicines merged.** Grouping "strengths of one medicine" kept
  only the *first* ingredient RxNav listed. So Percocet (acetaminophen +
  oxycodone) merged into plain Tylenol, and the oxycodone disappeared from
  the list and the QR code. A real test patient's two *active* metoprolol
  prescriptions became one line saying "dose changed". Now only products with
  exactly the same ingredients merge, and two current prescriptions never do.
  Two active versions of one drug is exactly what a brown bag review should
  catch.
- **Locked out for good.** A forgotten PIN had no way out. The unlock screen
  now has "Forgot your PIN? Start over", which explains what's erased and
  asks again. Restoring a backup now saves nothing until it fully works.
- **Double tap on Save PIN** could make two locks with different keys and
  leave saved data unreadable. Now a second tap gets the same lock, and
  Brown Bag refuses to save over data it can't open.
- **Restore replaced newer entries.** Now it merges: what's on the phone
  stays, and the backup adds what's missing.
- **Partial or old lists looked complete to staff.** The shared list now
  carries two warnings that `share.html` shows: "The From records part is a
  copy saved on …" and "Some of the patient's records couldn't be loaded."
- **Unnamed medicines merged into one line.** Each now keeps its own line.
  The name on a reference (`medicationReference.display`) is used when the
  separate Medication record isn't sent.
- **Weak Wi-Fi could freeze the app.** Drug lookups give up after 8 seconds,
  and the service worker uses the phone's copy of a file after 3.
- **iPhone Home Screen apps start empty.** An iPhone Home Screen app keeps
  its saved data separately from Safari. The install hint now says to save a
  backup first and restore it in the Home Screen app.

**Lesson:** have someone who didn't write the code review it against the
design's goals. The first anti-goal ("a list that looks complete but silently
drops medicines") was broken in a way no test covered.

### After your first phone test (Nov 20)

**Odd search results ("Ibuprohm").** While you typed "Ibupro", a search for
that half-word started. RxNav doesn't know "Ibupro", so it answered with
guesses like "Ibuprohm". Before it answered, you typed "fen" and a second
search started. The first answer arrived and was drawn, and then the second
search's results were added *below* it instead of replacing it. Now only the
newest search's answer is ever shown (`latestOnly` in `js/view.js`), and the
list is cleared before drawing. This kind of bug is called a **race**: two
things finish in an order you didn't plan for.

**Better match order.** Plain generic names come first ("ibuprofen 200 MG
Oral Tablet"), then brands ("[Advil]"), then combination pills.

**The logo.** Drawn as code in `tools/logo/logo.html`, so it's exact and can
be changed later: the bag, "Brown Bag" centered on it, a plain "o", and a "w"
made of four pills. `node tools/logo/render.mjs` turns it into the PNG files
in `icons/`. One bug on the way: a variable named `top` clashed with a name
the browser already uses for the page's top window, so every pill came out
with no size.

### The reviewer's small items (Nov 21)

You chose to fix all nine. What changed on screen:

- **Clearer empty messages:** "No current medicines in your records" when
  only older ones exist, and "You've marked all your current medicines
  stopped" when that's why the list is empty.
- **Dates:** "Prescribed 6 times since 2019" instead of "In your records 6
  times", and "until <date>" when a prescription has an end date.
- **Undo after Remove** under "Added by me".
- **The "too long for one QR code" message** has an OK button.
- **A staff link with nothing after the `#`** says "This link has no list in
  it" right away instead of asking for a code.
- **Records marked "entered in error"** in the chart are left out.
- **A newer stopped record no longer hides the current one's dose.**
- **Patient ids are hidden** in the phone's storage and in backup files (a
  one-way tag instead). Old data and old backups still work.
- **The service worker only touches Brown Bag's own folder,** not other
  sites published on the same github.io address.
- **Larger Text:** the pages now follow the iPhone's Larger Text setting.

Two older tests had pinned the old behavior (brand names first, and a newer
stopped record's details). They were updated to the new rules on purpose.


### Step 12. One screen around the bag (`js/app.js`, `css/brownbag.css`)

You asked for an app a 90-year-old could use: one screen, no scrolling, big
buttons, the logo in the middle, and a QR code that swooshes out of the bag.

**Three screens instead of one long page.** The app now remembers which
screen it's on (`state.screen`): **home**, **My medicines** or **More
options**. Drawing the page starts over each time, so changing screens is
just "set the screen, draw again". Home has the bag, "Show my QR code", "My
medicines (4)" and "More options". The list, with "I stopped this" and the
add button, moved to My medicines. Backup and Sign out moved to More options.
Each of those screens has a big Done button at the top.

**How home fits one screen.** Home is a column exactly as tall as the
phone's screen (`height: 100dvh`; `dvh` means the part you can see, not
counting Safari's address bar). The bag is told to take whatever room is
left (`flex: 1`), so on a short phone the bag shrinks and the buttons stay
56 points tall. At very large text sizes the screen scrolls instead of
cutting anything off.

**The swoosh.** When you tap "Show my QR code" or the bag, the app measures
where the bag is on the screen and hands that spot to the stylesheet. The
code screen starts there, tiny and tilted, and grows to fill the screen in
under half a second. Close plays it backwards into the bag. This is a **CSS
animation**: the motion is described in the stylesheet (`@keyframes qr-in`),
and the browser draws the in-between frames.

**Reduce Motion.** Some people get dizzy from moving screens and turn on
Settings ▸ Accessibility ▸ Motion ▸ Reduce Motion. The page can read that
setting (`prefers-reduced-motion`). With it on, the code screen only fades
in and out. One bug on the way: an older rule switched off *every*
animation under Reduce Motion, so even the fade never ran. The code screen
is now the one exception.

**Focus.** When the code opens, the keyboard and VoiceOver move to its Close
button, and the rest of the app is switched off behind it (`inert`), so
VoiceOver can't wander onto buttons you can't see. Escape or Close puts you
back on "Show my QR code".

**The bag on every screen.** Lock, sign-in, loading and the staff page show
the bag on the same wheat card as the app icon, so its dark letters read in
dark mode too. Sign-in errors now say "Sign-in didn't finish. Tap Sign in to
try again." instead of the server's raw message.

**Two things the redesign broke, caught by tests.** The Home Screen tip
still said "tap Save a backup below", but that button had moved to More
options. And the new logo file wasn't in the service worker's offline list,
so it would have been missing with no signal. A new test now checks that
every picture the pages use is kept for offline.

**How it was checked.** Scripts drove headless Chrome (Chrome with no
window, controlled by code) at iPhone 15 size (390 by 844) and iPhone SE
size (375 by 667). They checked that the page is no taller than the screen,
even with the "No connection" bar showing, that the buttons are at least 56
points tall, which animation runs with Reduce Motion on and off, and where
focus lands. They also checked that a patient with no medicines still sees
"My medicines (0)" and a working QR code, and that stopping a medicine drops
the count. axe, an accessibility scanner, found no problems on any screen
in light or dark mode.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Debug with browser DevTools".
Open Brown Bag in Chrome on your Mac, open DevTools, and turn on the device
toolbar (the phone icon). Pick iPhone SE and iPhone 15 Pro and watch the bag
shrink while the buttons stay the same size. In the Rendering panel,
"Emulate CSS media feature prefers-reduced-motion" switches the swoosh to
the fade.


### Step 13. One unlock (`js/pass.js`, `launch.html`, `js/app.js`)

You asked why there were two sign-ins. They belonged to two different
owners. **Unlocking Brown Bag** (Face ID or PIN) is Brown Bag's own lock on
the copy saved on the phone. **Signing in** is the health system's page,
and Brown Bag can't skip it. That sign-in only lasted while the page was
open, so every reopen asked again.

**Refresh tokens.** When an app signs in with SMART, the health system
gives it an **access token**: a pass that works for about an hour (3600
seconds in the sandbox). If the app also asks for the `offline_access`
permission, the health system adds a **refresh token**: a long-lasting pass
the app can trade for a new access token later, with no sign-in page.
`launch.html` now asks for `offline_access`. Before building, we tested
that the sandbox really hands one to Brown Bag and accepts it back.

**Where the pass lives.** `js/pass.js` keeps only what's needed (the
server's address, the token address, the refresh token and the patient
id), encrypted with the same key as your saved list. So the pass is
useless without an unlock. Backup files leave it out: a backup in iCloud
shouldn't carry a key to your records. You chose to keep it with a PIN lock
too, knowing a 6-digit PIN is easier to guess than Face ID if someone
copies the phone's data.

**What opening looks like now.** Unlock, and home shows your saved list at
once with "Updating your list…" at the top. Brown Bag trades the pass for
fresh access (`client.refresh()` in fhirclient) and loads your records the
same way a sign-in does. Then the new list replaces the old one. Three
things can go wrong, and each has its own answer:

- **No signal, or the server is slow** (more than 8 seconds): the pass is
  kept for next time, and the note says "No connection. List from Nov 21."
- **The health system says no** (the pass ended or was taken back): the
  server answers with an error code (400 or 401). The pass is deleted, and
  the note says "List from Nov 21. Sign in again to update it." with a Sign
  in button.
- **You're on My medicines when the update lands:** that screen isn't
  redrawn, so nothing you're typing is lost. Home shows the new list when
  you tap Done.

**Sign out** now deletes the pass, so the next open asks you to sign in.

**The notes at the top.** Each note is now one short line in a single
card. The Home Screen instructions moved behind a How? button, onto their
own screen, which ends with "I've done this" to put the tip away for good.
The same steps are under More options. On Android, the phone tells the page
when Brown Bag is installed, and the tip goes away by itself.

**How it was checked.** A headless Chrome script controlled the
sandbox's answers to the update request (Chrome's DevTools can hold,
refuse or break any request). It held the request to see "Updating your
list…", refused it to see "Sign in again", and cut it off to see "No
connection". It also checked that the refresh token never appears in plain
text in the phone's storage, and that the bag keeps a third of an iPhone
SE screen with two notes showing.

**After your screen recording.** Your first sign-in took two Face IDs:
one before signing in and one after. The first opened nothing, because
nothing was saved yet. Now a phone with no saved list goes straight to
Sign in, and the lock comes once, when the sign-in comes back. That screen
also has "Restore from a backup" when the phone has no lock yet, which is
how the Home Screen app starts. The sandbox's Patient Login and Approve
pages stay: they stand in for a real hospital's sign-in and consent, which
the course wants you to be able to explain. You also chose one look for
light and dark mode, the wheat page.

**Signing out on its own.** SMART doesn't set a sign-out time for apps.
It says access tokens should last an hour or less, and leaves the refresh
token's life to the health system. You chose two limits of Brown Bag's own:

- **It locks after 5 minutes** without a tap, or 5 minutes away from it
  (another app, or the screen off). Locking forgets the key in memory
  (`js/idle.js`), so Face ID or the PIN is needed again, but the connection
  stays, so one unlock still updates the list. HIPAA's "automatic logoff"
  rule for hospitals is the same idea: end a session after a set time of
  inactivity.
- **The connection ends after 30 days** without opening Brown Bag. The pass
  remembers when it was last used (`passExpired` in `js/pass.js`), so a lost
  or unused phone stops being connected.

**Notes.** Explanations like "Saved on this phone only" now look the same
everywhere: a bold "Note:" in a lighter box with a teal bar, so they read
as side remarks rather than instructions.

**Buttons and "?" bubbles.** "I stopped this" and "Remove" are now brick
red, a color next to the bag's browns, because they take something off the
list. The big outlined buttons got a soft cream fill so they stand off the
wheat page. The QR screen has two round "?" buttons: "What's in this code?"
lists exactly what the code carries (the same things `shareListFrom` in
`js/view.js` packs), and "Why read the code out loud?" explains that the 6
digits are the key to the locked list. Each "?" tells VoiceOver whether its
explanation is open (`aria-expanded`).

**The hidden code.** The 6 digits are blurred (a CSS `filter`) until the
patient taps them, so people nearby can't read them over a shoulder.
VoiceOver can't read them while hidden either (`aria-hidden`). The line
above them now says "After they scan it, tell them this code:", so nobody
reads the code out before the staff page asks for it.

**Changes made offline.** The QR code is made on the phone each time it
opens, so it always includes the patient's own changes, even offline. What
a connection adds is a fresh copy of the records. When the list is a saved
copy, Brown Bag now keeps a short log of what the patient changed
(`logChange` in `js/view.js`; a change that's undone cancels out), and the
QR screen shows "This code isn't fully up to date" with each change and
what to do. A fresh update clears the log.

**Practice in the lab:** [Tokens](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#tokens)
explains access tokens. Look at what a sign-in returns, and compare it
with what Brown Bag keeps (`passFromState` in `js/pass.js`).


### Step 14. What was actually filled (`js/claims.js`, `tools/demo-patient.mjs`)

A prescription says what a doctor ordered. It doesn't say whether the
patient picked it up. Insurance claims do: when a pharmacy fills a
prescription, it bills the insurer, and the insurer keeps a record. In
FHIR that record is an **ExplanationOfBenefit** (EOB), and a pharmacy one
has the drug's RxNorm code, the fill date and the insurer.

**Combining sources.** This is the interoperability idea: two kinds of
records, from two kinds of organizations, about the same medicines.
`js/claims.js` matches each fill to a medicine on the list: the same
RxNorm code, or else the same ingredients (asked from RxNav, the rule the
list already uses). Then each card can say "Filled 2 times · last Sep 22,
2026 · Aetna claims", or "No fill found in your claims". Fills that match
nothing are prescriptions from outside this health system, so they get
their own section. A prescription the record calls "completed" but that
was filled this year, after it was written, moves back to the current
list, because the pills are probably still at home. A fill on the day it
was written doesn't count: that is just a finished course, like an
antibiotic.

**Two things at once.** The claims load at the same time as the
medicines, not after them, each with its own time limit. If the insurer
is slow, the medicines still arrive and the list says the fills couldn't
be loaded. The claims also come one page at a time (`readClaims`), and
when the 6 seconds are up the app stops asking for more pages, instead
of downloading a patient's whole claim history in the background.

**Careful wording.** "No fill found in your claims", never "not filled":
people pay cash, get samples or use another insurer.

**Where real claims come from.** US rules require Medicare Advantage,
Medicaid, CHIP and HealthCare.gov plans to offer a FHIR "Patient Access
API" with claims back to 2016. The course sandbox stands in for an insurer
here; Medicare's Blue Button 2.0 is next.

**The demo patient.** In the sandbox, every prescription had exactly one
claim, so the interesting cases never appeared. `tools/demo-patient.mjs`
writes a made-up patient, Avery Brownbag, to the public sandbox with
prescriptions and claims arranged to show every case. It writes with PUT
and fixed ids, so running it again replaces her records instead of adding
copies, and it checks every drug code with RxNav first. That check caught
two wrong codes in the plan before anything was written.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).
Look at a resource type the lab doesn't use, then read Avery's claims in a
browser: `https://r4.smarthealthit.org/ExplanationOfBenefit?patient=brownbag-demo-patient`.

### Step 15. Picking a dose, and a second look before adding (`js/add-choices.js`, `js/add-check.js`)

**Lists instead of blank boxes.** "How much" and "How often" are now
lists. "How much" fits the medicine: the end of an RxNorm name says its
form ("amoxicillin 250 MG/5ML Oral Suspension" is a liquid), so a liquid
offers mL and a tablet offers ½ to 4 tablets. "Other…" is always there
for a label the lists don't cover, like insulin units.

**Words a computer can read.** A typed "twice a day" is just words to
another system. A picked one also goes into the QR code as FHIR numbers:
`doseQuantity` (5, "mL", with the UCUM code, the standard list of units)
and `timing.repeat` (2 times, every 1 day). "At bedtime" is
`when: ["HS"]`, and "As needed" is `asNeededBoolean`. The words stay too,
for people. This is what lets a pharmacy or clinic system take in the
schedule without a person retyping it.

**A second look before adding.** Save now compares the new medicine with
the whole list. The same RxNorm code, or the same ingredients from RxNav
(so Zestril matches lisinopril), counts as the same medicine. Then the
patient is asked, in a panel on the page (a browser pop-up would be lost
by VoiceOver):

- already there with the same dose and schedule: Don't add it, or Add it
  anyway;
- there at another strength, dose or schedule: Go back and change it, Add
  it anyway, or Replace the one I added;
- marked stopped: Start it again, Add it anyway (a new strength, with the
  old one left stopped), or Go back;
- a name that only looks alike (Hydroxyzine and Hydralazine), or a typo
  of one on the list: Go back, or Add it.

Names that look or sound alike are a well-known cause of medicine
mistakes, so the look-alike question counts letters: names a few letters
apart get asked about. Nothing is ever blocked; the patient holding the
bottle decides.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "USCDI and US Core".
Look at how a medicine's dosage is written in US Core, then compare it
with what Brown Bag puts in the QR code.


### Step 16. The libraries move into the repo (`vendor/`)

Brown Bag uses two libraries it didn't write: **fhirclient** does the SMART
sign-in, and **qrcode-generator** draws the QR code. They used to load from
a **CDN** (content delivery network), another company's computers that hand
out popular files. Now unchanged copies live in `vendor/`.

**Why it matters for a health app.** If the CDN were down, sign-in would
stop. And every time someone opened Brown Bag, the CDN's computers saw that
their phone did. Neither involves health data, but both are easy to remove.

**How we know the copies are the real files.** Each script tag carries an
`integrity` value: a fingerprint (a SHA-384 **hash**) of the exact file.
The browser refuses a file whose fingerprint doesn't match. Before moving
them, the files' fingerprints were checked against the ones already on the
page, and `tests/vendor.test.mjs` checks them every run.

**Their licenses come along.** Brown Bag is all rights reserved, but these
belong to their authors (Apache 2.0 and MIT), who ask that their notices
travel with the files. `vendor/LICENSES.md` holds them.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Debug with browser DevTools".
Open Brown Bag's live site, then the Network tab, and find the two
`vendor/` files. The whole page should load from one address.

### Step 17. Reading claims more carefully (`js/claims.js`)

A pharmacy claim is a message between a pharmacy and an insurer, so not
every claim means the patient has the pills. Five small fixes:

**Status and use.** A FHIR claim (ExplanationOfBenefit) has a `status`
(active, cancelled, draft, entered-in-error) and a `use` (claim, or
preauthorization, which only asks the insurer ahead of time). Brown Bag now
counts only real, live claims as fills.

**Dates can be partial.** FHIR lets a date be a year, a year and month, or a
full day, and it can be missing. The card says "Sep 2026", "2026" or "date
not given" instead of "undefined NaN".

**The same drug under two codes.** Brand and generic have different RxNorm
codes. Fills with the same name, ignoring the [Brand] part, now share one
card. Different strengths keep their own cards, because hiding a strength
could hide a mistake.

**Current first.** When a fill fits two prescriptions of one ingredient, it
goes to the one the patient takes now, not a finished one.

**Say what the record says.** "Marked stopped" when it was stopped, "Marked
canceled" when it was canceled. A card that says "completed" about a stopped
medicine would mislead a nurse.

**Keys.** When two cards become one, "I stopped this" saved under either
card's key still counts, so a stopped medicine doesn't come back.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "USCDI and US Core".

### Step 18. Screens that remember where you were (`js/app.js`, `js/view.js`)

Brown Bag draws each screen from scratch from one object called `state`.
Anything not in `state` is gone at the next draw. That caused most of these
five rough edges.

**The half-typed medicine** lived only in the boxes on the page. Now every
keystroke copies it into `state.draft`, and the form fills itself back in.
Home says "isn't saved yet", because a medicine that isn't saved isn't in
the QR code. The draft stays in memory only: locking or closing Brown Bag
forgets it, so nothing unencrypted is stored.

**Back goes back.** The browser keeps a history of steps, and each Brown
Bag screen adds one (`history.pushState`). The Home Screen steps opened
from More options didn't add theirs, so Back skipped to home. Now they do.

**Escape on the QR code.** Key presses go to whatever has **focus**. A tap
on blank space moved focus off the code screen, so it never heard Escape.
Giving the code screen `tabIndex = -1` lets a tap land on it, without adding
a stop for the Tab key.

**Say the right list.** "From your records" now says why it's empty when
only insurance-only medicines are current, and Undo names the list the
medicine really goes back to.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Debug with browser DevTools".
Open Brown Bag, type `history.length` in the Console, and watch it change
as you open screens.

### Step 19. Names a computer reads too simply (`js/add-check.js`)

The add check compares a drug's **first word**. That works for lisinopril
and fails for "Vitamin D3" and "Vitamin B12", which share a first word and
nothing else. A **regular expression** (a pattern for matching text) now
reads which vitamin it is: the letter, and the number right after it. The
hard part is what the number means: 12 in "Vitamin B 12" is part of the
name, 50 in "Vitamin D 50 mcg" is a dose, 5,000 in "Vitamin D3 5,000 IU" has
a comma in it. Each one is a test.

**When unsure, ask.** "Vitamin A and D" names two, so Brown Bag doesn't
guess: it asks, as before. Asking once too often is better than missing a
duplicate.

**Say what's true.** A look-alike the patient stopped says it's on the
stopped list, not "already on your list".

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "USCDI and US Core".

### Step 20. Read back everything you wrote (`js/vault.js`)

Brown Bag keeps a small log of changes made without signal, so the QR screen
can warn "This code isn't fully up to date". The log was saved, but the code
that loads it named only two fields, the additions and the stopped marks. So
the log vanished when Brown Bag reopened, and the warning with it.

**The lesson:** code that lists fields by name silently drops any field added
later. The loader now starts from everything saved. Restoring a backup joins
both logs without repeats.

**Why no test caught it:** the tests checked the log in memory, and checked
saving, but never saved, reopened and looked. That **round trip** is now a
test, and a browser check closes and reopens Brown Bag with no signal.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Debug with browser DevTools".

### Step 21. Allergies: never let "I couldn't check" look like "none" (`js/allergies.js`)

Allergies are the FHIR **AllergyIntolerance** resource. The hard part isn't
showing them. It's the empty list. "No allergies" can mean four things:

1. The records loaded and have none.
2. The patient says they have none.
3. The records couldn't be loaded.
4. This QR code was made before Brown Bag had allergies.

Only 1 and 2 are safe to call "none", so each has its own words on the phone
and the staff page. Even a Bundle can lie: a server can answer "here is your
list" and tuck "some were forbidden" inside (an **OperationOutcome**). Brown
Bag treats that as a failure.

**Statuses.** `verificationStatus` says how sure the clinic is (confirmed,
unconfirmed, refuted) and `clinicalStatus` whether it's current. Refuted and
resolved ones are left out; unconfirmed ones say "Not confirmed".

**Who says so.** FHIR's `asserter` is the person who stated it. The patient's
own allergies name the patient, so staff see "From patient".

**Codes.** Two records with one code aren't always one allergy. "Allergy to
drug" covers many, so different names stay apart.

### Step 22. A second reader finds what the first can't

All the tests passed before the review, and it still found that a patient's
reaction could vanish. The test for it had put the data in by hand, under a
key the app never uses. **A good test sets things up the way the app does,**
then changes the world: add the reaction, change the record's code, look.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "USCDI and US Core" lists
AllergyIntolerance among the required resources.

### Step 23. When a file arrives late (`sw.js`, `index.html`)

The Android phone check got stuck on "Loading Brown Bag…". The **service
worker** waits 3 seconds for each file, then uses the phone's copy. A file
that is new in this version has no copy, and the fallback handed over the
start page instead: a web page where a script should be. One missing script
stops all of them, because **modules** import each other.

Now a file with no copy keeps waiting. And if any script still fails, the
page tries once more by itself, then says "Part of Brown Bag didn't arrive."
The "tried once" mark stops it from reloading forever.

**The lesson:** test the update, not just the new version. The phones that
passed had the new files already.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Debug with browser DevTools".
In the Network tab, set the speed to Slow 3G and open Brown Bag.

### Step 24. Budgets, logs and telling fields apart

Three ideas from the last allergy fixes:

**A time budget.** The medicines get 12 seconds. Allergies and claims used to
get 6 of their own, whatever had been spent. If reading the patient took 7,
the total passed 12 and the medicines were thrown away. Now they get only
what's left.

**A log should say what's true now, not everything that happened.** Change a
reaction, remove it, undo: the truth is "changed". Each rule is one test.

**Tie a message to its field.** `aria-invalid` marks the field that's wrong
and `aria-describedby` points at the message, so VoiceOver reads the two
together. Before, it read the message with no hint of which field.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "Error scenarios and fixes".

### Step 25. What signing out really means (`js/pass.js`, `js/app.js`)

Sign out used to delete one person's refresh token. A second person who had
signed in on the same phone stayed connected. Now it's for everyone.

**Order matters.** The tokens leave the phone first. Then each health system
that offers it is asked to end its side (**token revocation**, RFC 7009). If
there's no signal, the phone is still signed out.

**Never send a token to the wrong place.** The address to revoke it at comes
from the server's SMART configuration, and Brown Bag uses it only if it's on
the same server the token came from.

**Late answers.** A server may swap the refresh token each time it's used. If
its answer came after Brown Bag stopped waiting, the new token was lost and
the old one no longer worked. It's kept now whenever it arrives, unless
someone has signed out.

**Practice in the lab:** [Tokens](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#tokens).

### Step 26. Interoperable means another system can use it (`js/share.js`)

Words are for people. Codes are for systems. "Hives" means nothing to a
computer until it carries a code from a list both sides know.

**Keep what you're given.** The records' reactions came with codes, and Brown
Bag kept only the words. Passing them on costs nothing and loses nothing.

**Required, extensible, preferred.** FHIR ties each field to a list of codes
(a **binding**). A required list allows nothing else, so a value outside it
makes the whole record invalid. The new test reads every allergy Brown Bag
sends and checks it against those lists.

**Profiles.** US Core narrows FHIR for the US. For "no known allergies" it
says the status is *confirmed*: the patient was asked and has none.

**One idea, one code.** "Nausea or vomiting" has a code that means both. So
the list now offers each on its own.

**Codes can have owners.** RxNorm's are free. SNOMED CT is free in the US too,
but asks for a license first.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper) ▸ "USCDI and US Core".

### Step 27. Choosing where the records are (`launch.html`, `js/sources.js`, `js/launch.js`)

Real apps start by asking which health system you use, because every one of
them is its own FHIR server with its own sign-in. Now Brown Bag asks too.

**Data first, screen second.** The list is a few lines of data: a name, a
kind, and whether it's connected. The screen draws whatever is there. Turning
on a new source later means building its sign-in, then changing one line.

**Only known answers sign in.** The address can say `?source=smart-sandbox`.
Anything else, even a name on the list, just shows the list. A link that
brings its own server (`iss`) still works, because that's how SMART launches
from a portal.

**Greyed out, but readable.** The grey names aren't disabled buttons. They're
text, so there's nothing to tap and VoiceOver doesn't offer a button that does
nothing. The grey still passes 4.5 to 1.

**Names have rules.** Each company says how its name may be used. A name of a
government program has a law: nothing may suggest a connection that isn't
there. So the heading says "Not connected", not "Coming soon".

**A library can remember a failure.** After one failed try, Try again failed
too, with the signal back: the sign-in library keeps its first answer. A fresh
page forgets it. The test browser found this, not reading the code.

**Back is an input too.** A page left mid sign-in can come back exactly as it
was. So the address is cleaned before leaving, a late answer is ignored, and
every screen has its own way back (the Home Screen app has no Back button).

**Practice in the lab:** [Watch the Flow](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#watch-the-flow).

### Step 28. Show the real thing (`js/share-list.js`, `js/app.js`)

Not everyone can scan a code. Now the patient can open their own, on their own
phone, and hand it over.

**Trust comes from the same path.** It would have been easy to draw the list
the app already has. Instead Brown Bag unlocks the code on the screen, the way
the staff page does, and draws what comes out. A test checks that both screens
use the same drawing code. If the two could differ, the button would be worth
nothing.

**Read-only is a safety feature.** This screen has no Remove and no "I stopped
this", so a slip of the thumb while showing it can't change the list.

**A total is a promise.** "Medicines (3)" says there are three. When some
records didn't load, the number is left off and the warning sits right under
the heading. The fresh review caught that.

**A failure is never an empty list.** If the code can't be unlocked, the screen
says so. An empty list would read as "takes nothing".

**Two blocks.** Allergies and medicines looked alike. Now a box with a thick
border and a symbol holds one, and a big heading starts the other. Shape, words
and color all say it, so no one needs the color.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 29. Two dates, two meanings (`js/share.js`, `js/share-list.js`)

"Made on" said when the code was created. A code made today can hold records
from last week, so it looked newer than it was. Now there are two lines:
**Records last updated**, when they last loaded into Brown Bag, and **QR code
made**.

**A date vouches for what's under it.** When some records didn't load, there is
no date, only "Records: some didn't load". Allergies that loaded at another
time carry their own.

**What it can't say.** "Last updated" isn't when the clinic changed the record.
FHIR has that too (`meta.lastUpdated`, `recorded`), but only as good as what the
clinic entered.

**Say what's missing without scaring anyone.** When insurance fills don't load,
staff see a note, not a warning: the list still stands, and a medicine only
insurance knows about may not be listed. A missing extra isn't a wrong list.

**The date goes in the code.** It's a tag on the Bundle (`meta.tag`), where FHIR
lets an app add its own labels. A code made before this simply doesn't have it.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 30. Saying what didn't load (`js/share.js`, `js/view.js`, `js/quiet.js`)

**What changed for staff.** The staff page now says when what the patient added
couldn't be opened, and when the records have entries with no medicine name.
Before, those parts looked empty.

**Unknown is not none.** "Nothing added by the patient" is a claim. If the
phone couldn't open that part, nobody knows. The page now says "Couldn't be
opened." The same goes for the home button: no number is better than a wrong 0.

**A polite answer can still leave things out.** A FHIR server can answer "OK"
and put an OperationOutcome inside the Bundle that says some records were held
back. The allergies check looked for it. The medicines and claims checks now
do too, with one shared function.

**Logs leak.** The browser keeps a log that anyone holding the phone or
computer can open. The sign-in library wrote sign-in passes and patient ids in
it. `js/quiet.js` drops those lines. The library's own file stays unchanged,
because its hash is checked.

**Test what people read.** The staff tests draw the real page code into a tiny
stand-in page and read the words. The log test runs the real library and reads
what it logged. It failed first, which proved the leak.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 31. One label for each thing (`js/card.js`)

**What changed.** A medicine's line read "Dr. Patel · since 2023-03-02 · SMART
sandbox". The reader had to work out which part was which. Now every piece has
its label, how to take it has its own box, and the rest comes after, quieter.

**A list of pairs is `dl`.** HTML has a tag for labels and values: `dl`, with
`dt` for the label and `dd` for the value. VoiceOver reads them as pairs.

**Never guess a label.** A QR code made before this has only the joined words.
Those show whole, as "Directions", because a wrong label on a dose is worse
than none.

**FHIR has a place for each part.** The whole dosage stays in `text`, so any
system can read it. The route goes in `route`, how often in `timing.code`, and
a full instruction in `patientInstruction`.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 32. Same facts, fewer words (`js/inside.js`)

**What changed.** See what's inside was a second staff page with its own title
and an explanation. Now it's one short text: the name, the dates, allergies,
then each medicine as a bullet.

**Two drawings need a test.** The staff page and this text used to share their
drawing code, so they couldn't differ. Now they can, so a test draws both from
the same code and fails if staff see a fact or a warning that this text leaves
out.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 33. A button that stays put (`js/app.js`, `css/brownbag.css`)

**What changed.** "+ Add a medicine" was under the last medicine. Now it's at the
top of the list and stays at the top of the screen while the list scrolls.

**`position: sticky`.** One line of CSS: the bar scrolls until it reaches the top
of the screen, then stays.

**A bar can hide what you tab to.** WCAG 2.2 (2.4.11) says a focused button must
not be hidden. `scroll-padding-top` tells the browser to leave room, and the app
measures the bar, because large text makes it taller.

**Test the worst case.** At 200 percent text on a small phone, the first try took
56 percent of the screen. Shorter words and less padding made it 23.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 34. Sorting, and a shorter name (`js/sort.js`)

**What changed.** My medicines can be sorted A to Z, newest first, or by who
prescribed it. Home shows "Avery B." instead of the full name.

**Sort a copy.** JavaScript's `sort()` changes the list it's given. The QR code
uses the same list, so `slice()` makes a copy first, and a test checks the real
list never changes.

**Unknown goes last.** A medicine with no date or no prescriber isn't dropped
and isn't first. It goes at the end.

**Show only what's needed.** A full name in big type on home can be read by
anyone nearby. Staff do need it, so the QR code keeps it.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 35. Editing, and a calmer code screen (`js/edit.js`)

**What changed.** Each medicine you added has Edit. See what's inside is a small
link above the code, and the title is centered. "Records last updated" is now
"Meds last updated".

**Same medicine, new answers.** An edit keeps the medicine's id and the day it
was added. Remove and add again would lose both.

**Nothing left over.** An RxNorm code belongs to a name, and the numbers in the
QR code belong to the dose's words. Change the name or the words, and the old
code or numbers go too. A leftover would tell staff the wrong medicine or dose.

**Say it once.** Edited twice with no signal is one line on the code screen.

**True centering.** The words were centered in the space the "?" left. An empty
column on the left, as wide as the "?", makes the two sides match.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 36. Where my records come from (`js/source-list.js`)

**What changed.** More options has a screen for someone signed in: the source,
when meds and allergies were last updated, and Update now. The list of sources
is shorter, and the sign-in screens no longer show a note about a list.

**One list, drawn once.** The list before sign-in and the one after it use the
same code, so the names and the trademark words can't differ.

**Refresh, not sign in.** Update now trades the saved pass (the refresh token)
for fresh access and reads the records again. Only a refused pass needs the
sign-in page.

**A failed update changes what the list is.** The medicines stay, but the list
is now a copy with a date, and the staff page says so.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 37. The allergies' own date (`js/share.js`)

**What changed.** See what's inside and the staff page always say "Allergies
last updated".

**A label and what it covers change together.** "Records last updated" covered
both parts. Once it became "Meds last updated", allergies needed their own date.
If they didn't load, there's no date, so a date never vouches for nothing.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 38. More options in groups (`js/options.js`)

**What changed.** More options is cards: health records, backups, and Sign out
last. Each option has an icon, a name and one line saying what it does. The
sign-in list's title is centered.

**Say it where it's used.** The "?" and the note held explanations away from
their buttons. One line inside each button does the same job.

**Danger goes last and looks different.** Sign out sits alone, in red, so it's
hard to tap by mistake.

**Lists as data.** The groups are a plain list the tests can read, and drawing
them is separate.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 39. One set of text sizes (`css/brownbag.css`)

**What changed.** More options uses the sizes of the other screens: an option's
name is as big as a big button's words, and its line is as big as normal text.

**Why it stood out.** A size picked for one screen looks wrong next to the
others. Reusing the sizes already there is what makes an app look like one app.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 40. A bigger main button (`css/brownbag.css`)

**What changed.** Show my QR code on home is taller, with bigger words.

**Size says what matters.** Two buttons of the same size look equally important.
The bag is the part that shrinks, so home still fits one screen.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 41. Back up before starting over (`js/install.js`)

**What changed.** Start over says what's erased in fewer words, and how to save a
backup first.

**Say the way out before the danger.** The steps sit above the erase button, so
they're read in time.

**A backup is locked too.** It opens only with the same PIN or Face ID, so a
stolen file is useless. That also means a forgotten PIN can't open it, and the
screen says so.

**A test for words.** The steps name buttons. The test checks those names exist
on the real screens, so renaming one fails the test.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 42. Room at the bottom of home (`css/brownbag.css`)

**What changed.** Home's buttons sit a little higher, with room under More
options.

**Thumbs and the phone's own bar.** A button on the bottom edge competes with
the swipe bar. The space comes from around the bag, so home still fits.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 43. An honest line about the PIN (`js/lock-screen.js`)

**What changed.** Choosing a PIN now says that if you forget it, you'll have to
start over and your backups won't open.

**Why the old line was wrong.** It said a backup brings things back. The backup
is locked with the PIN, so a forgotten PIN locks it for good. Words about safety
need checking against what the code really does.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 44. A popup before erasing (`js/lock-screen.js`)

**What changed.** Erase and start over asks "Erase everything?" first, in a popup
that looks like the app.

**The `<dialog>` element.** The browser can make a popup itself: `showModal()`
dims the page, keeps taps and the keyboard inside, and closes on Escape. We only
style it.

**The safe answer has focus.** Cancel is focused, and the red button names what
it does. "OK" wouldn't.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 45. Safer backups (`js/vault.js`, `js/backup-popups.js`)

**What changed.** Each person's part of a backup is sealed to that person. With a
PIN lock, a backup gets its own long password. Saving gives one file, not two.

**Attack it yourself.** We swapped two people's labels in a test file, and one
person's medicine showed in the other's list. The labels sat outside the
encryption. Now the label is inside too, and the two must match.

**Encryption is as strong as its key.** A PIN has a million choices, and a
computer can try them all in hours. Face ID gives a random key nobody can guess.
So PIN backups need a long password, and the file leaves out the lock settings.

**Length beats symbols.** The US standard (NIST SP 800-63B) asks for 15 or more
characters and no required symbols.

**All or nothing.** Every part is checked before anything is written.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 46. Signed out means signed out (`js/signed-out.js`)

**What changed.** After Sign out, Open my saved list shows only with no signal.
A sign-in that fails while signed out doesn't open the list either.

**A choice should have a reason.** With a connection, that button made signing
out look like it did nothing. With none, it's the only way to your medicines.

**The browser says when the signal changes.** `navigator.onLine` answers now,
and the `online` and `offline` events say when it changes. It only knows the
phone has a network, not that the internet works.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 47. A privacy page that has to stay true (`privacy.html`)

**What changed.** More options and the sign-in list open a Privacy page.

**Check the code before writing the promise.** We listed every address the code
contacts and everything it stores, then wrote the page. That turned up a real
limit: a QR code's 6 digits can be guessed by someone with a picture of it.

**HIPAA follows who holds the records.** It covers doctors, insurers and the
companies working for them. An app the patient chose is usually outside it, and
the page says so. Nobody certifies an app as "HIPAA compliant".

**A test for a promise.** A new outside address in the code fails a test until
the page names it.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 48. Red means look here (`js/allergies.js`)

**What changed.** After "I have no known allergies", the Allergies box turns soft
teal, with "No known allergies" big on its own line and Undo at the right.

**A warning color should mean a warning.** Red on "none" teaches people to ignore
red.

**Calm only when it's sure.** If the records didn't load, or one entry doesn't
say what it's to, the box stays red. The words carry the meaning too, since some
people can't see the color.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 49. Say all of it, or send them to the record (`js/meds.js`)

**What changed.** Every direction in a record shows. "As needed for pain" and "1
to 2 times a day" are said. A held medicine says "On hold in your records".

**Half a direction is worse than none.** FHIR lets a record hold several
directions and many kinds of timing. We showed the first one and the parts we
knew. Now a schedule with any part we can't say reads "See the record for how
often".

**A reviewer found it.** We were designing a file for hospitals and had someone
read the design with fresh eyes. The old mistake would have gone into the file.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 50. A file a hospital can read (`js/ips.js`)

**What changed.** The QR code carries the record's RxNorm and NDC codes and coded
directions. Staff can save the list as an International Patient Summary (IPS).

**Words for people, codes for systems.** A person reads "2 times a day". A system
needs frequency 2, period 1, unit d. Both travel, and they must agree.

**All or nothing again.** If any part of a direction can't be coded, none is.

**The QR code stays small.** An IPS has a cover record and readable text, so only
about 7 medicines would fit. The staff page builds it from the code instead.

**Never trust a link.** Anyone can make one. The file is written from checked
fields, not copied.

**Check with the owners' tool.** HL7's FHIR validator found 0 errors. It's the
same one hospitals use.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 51. Our own list of test patients (`js/test-patients.js`)

**What changed.** Sign in, then the sandbox, opens a scrolling list of 20 made-up
patients, grouped by what they show.

**Read the other side's code.** The sandbox's sign-in page showed ten names and no
more. Its code is public: it asks for `_count=10`. So the limit wasn't ours.

**The launch address carries choices.** The sandbox reads options from its own
address: the patient, and whether to skip its sign-in page. We skip that page and
keep its approval page, so you still see what Brown Bag asks for.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 52. Say where a thing came from once (`js/share.js`)

**What changed.** Each allergy now takes two lines: its name, and the reaction
with who said it, "(records)" or "(patient)". The records' source moved to the
heading. The patient can also save the FHIR file, under See what's inside.

**Words and data are separate.** The QR code still carries FHIR
AllergyIntolerance records, with each reaction in `reaction` and the source in
`note`. Only the words drawn from them changed, so older codes read the new way
too.

**One place makes the words.** `allergyParts` makes the headings and lines. The
staff page, See what's inside and the file's readable text all use it, so they
can't disagree.

**Careful with "none".** "Reaction: none" could mean the patient doesn't react.
"Not listed" says only that nobody wrote one down.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 53. When the signal comes back (`js/app.js`, `js/pass.js`)

**What changed.** A list opened with no signal kept saying "No connection" after
the signal was back. Now it updates by itself, or says to sign in again.

**The browser tells you.** The `online` event fires when the phone gets a
connection. It can fire a moment before requests work, so Brown Bag waits 1.5
seconds. An iPhone may not fire it while the app is in the background, so coming
back to Brown Bag checks too.

**Decide in one small function.** `whenSignalBack` takes the facts and answers
"update", "sign-in" or nothing. It has no screen in it, so a test can try every
case.

**Don't pull the screen away.** A half-typed medicine or an open popup is never
redrawn, and Brown Bag never jumps to the sign-in page by itself. A try that fails
isn't repeated until the signal changes or they come back.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 54. Guest Wi-Fi, and who a page may talk to (`js/launch.js`, the pages)

**What changed.** After a sign-in that couldn't start, someone signed out can open
their saved list, behind the lock. And each page now names the servers it may
contact.

**"Online" doesn't mean the internet.** `navigator.onLine` says the phone has a
network. Hospital Wi-Fi has one before its own sign-in page is done. Only trying
something tells you, so the offer comes after the try fails.

**Content Security Policy.** A line at the top of each page tells the browser what
is allowed: `default-src 'none'` allows nothing, and the rest adds back only what's
needed. If bad code ever got in, it couldn't send the list to another server. The
staff page's `connect-src 'none'` means it can send nothing at all.

**A hash instead of "unsafe-inline".** The few scripts written in the pages are
allowed by their fingerprint (`sha256-…`). Change one letter and the browser
refuses it, so `tests/csp.test.mjs` works out each fingerprint again.

**Adding a source later** means adding its server to `connect-src`, and the privacy
page.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 55. Who said "as needed", and older prescriptions (`js/view.js`, `js/older.js`)

**What changed.** Everything taken only when needed is under As needed, saying who
said so. An older prescription has "I'm taking this".

**Use the field, not the words.** FHIR has `asNeededBoolean` and
`asNeededCodeableConcept`. "Not as needed" has the words too, so words alone never
move a medicine. Every direction has to say it, and so does every current record
that was merged into the card.

**A note travels when codes don't fit.** A long list drops codes to keep the QR code
readable. So "Records say: as needed" goes as a note as well, at every size.

**Don't fill in an old dose.** The form opens with the name only and shows the old
directions beside it. The patient chooses what they take now.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

### Step 56. What an unnamed allergy does say (`js/allergies.js`)

**What changed.** A record like "Allergic disposition" names no allergen. Its note now
has everything else it says: the type, dates, who recorded it, notes, and which named
allergies were recorded the same day.

**A clue isn't an answer.** "Same day as Mold" helps someone remember. It never says
the two are the same, because the record doesn't. "Low risk" is left out: nobody
knows what it is.

**FHIR fields used.** `category`, `type`, `criticality` (high only), `onset[x]`,
`lastOccurrence`, `recordedDate`, `recorder`, `asserter`, `encounter`, `note`.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper).

---

## Step 57: When did each part arrive?

**What changed:** More options ▸ Health records has a line for insurance fills
with its date. Pharmacy fills are in the Not connected list, there and at
sign-in.

**Why:** a list comes from several places, and each can be late or missing on
its own. A date should only vouch for what really loaded. "None found" means
the insurer answered. "Not loaded" means we don't know. Mixing them up would
make a missing fill look like a medicine nobody picked up.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

---

## Step 58: A phone that says yes, then no

**What changed:** Save as FHIR file and Save a backup now work in Chrome on
Android. Before, both said they couldn't save.

**Why:** a page can ask "can you share this file?" first. Chrome on Android
answers yes for a .json file, then refuses the real share. So a yes isn't
enough. Try it, and if it's refused, download the file instead. Cancelling is
different: the person said no, so nothing is saved.

**How we missed it:** the phone test replaced the share step with a stand-in
that always worked. A stand-in only proves the code around it. Pressing the
real button on the live site found it.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

---

## Step 59: Answering a note without losing the record

**What changed:** My medicines has Done at the end too. The QR code can be swiped
away. An allergy's buttons fold under Edit once there's nothing left to do. After
adding an allergy that could be the unnamed one, a popup asks.

**Why:** the patient's answer is a clue, not proof. So "yes" takes the note off
their screen, but the QR code and the FHIR file still carry the record, with
"patient says it's Latex" on it. Who said something stays with what was said. In
FHIR that idea is called provenance.

**A swipe needs a button too.** Some people can't swipe, so WCAG asks for a way
that takes one tap. Close stays.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

---

## Step 60: One medicine, many spellings

**What changed:** the Allergies box is one list, a row each. And a new test file
holds how openFDA, DailyMed and RxNorm write the same medicines.

**Why:** "LISINOPRIL TABLET" and "lisinopril 40 MG Oral Tablet" are words, and words
differ. An RxNorm code is the same everywhere, so Brown Bag joins by code. With no
code both show, because a medicine twice is safer than one hidden. The test keeps
that rule from changing by accident, and the limits list says what's left.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

---

## Step 61: A paper ball, and phones that fall behind

**What changed:** closing the QR code crumples it into a paper ball that drops into
the bag. With Reduce Motion on, it only fades.

**Why:** the picture is cut into 120 folds. Each one moves to its place in a ball,
a little out of step, with its own shade, and that reads as paper. The 6 digits are
left out of the picture.

**The status bar (from a video):** the strip at the top of an iPhone stayed white until
the ball was in the bag. The code screen was invisible but still on the page, and the
iPhone seems to take the strip's color from it. Now it's taken off the page.

**A slow phone:** drawn sharply from the start, the virtual Android phone showed 5
pictures in the second. So it starts plain and turns sharp only after four quick
ones. Testing there also found swipes ignored when the phone never said the opening
animation had ended. Waiting for a signal needs a time limit too.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

## Step 62: Remove that doesn't erase

**What changed:** the unnamed allergy has Remove, for when it repeats one already listed.

**Why it isn't deleted:** nobody knows what the record is, and a wrong guess could hide a
real allergy. So the line leaves the phone's list, and staff still see the record with
"patient thinks it's already listed". It comes back with Show it again, or by itself if
no other allergy is left for it to repeat.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

## Step 63: A short box that still warns

**What changed:** the Allergies box starts closed, with each name showing. The title says
how many are severe, the unnamed allergy is one line with Review, and Fainting and
Blistering or peeling skin joined the reactions.

**Why a word, not "!":** the box already has a warning sign for any allergy. A word says
what it means and screen readers say it.

**What isn't marked isn't mild:** a blank reaction could be serious, and nobody can
predict the next one. So the app says "severe" or nothing. The rule follows the World
Allergy Organization's 2020 guide, and a nurse or pharmacist should check it.

**In FHIR:** `criticality` is how bad a future reaction could be; `reaction.severity` is
how bad one was. Either one can mark it.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

## Step 64: A pill with a question mark

**What changed:** the "?" buttons are pills, white over teal, and the mark changes color
where the pill does.

**How:** the mark is see-through text. Behind it is the pill's fill upside down, cut to
the letter's shape (`background-clip: text`). With a phone's high contrast colors on, that
would leave a blank button, so the mark gets a plain color there.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

## Step 65: The logo that came late

**What changed:** the logo shows right away on home, even on weak signal.

**Why it was slow:** each time home was drawn, the app made a new picture, and the service
worker asked the network first, for up to 3 seconds. Now home keeps one picture, and the
icons come from the phone first, then get updated for next time. Code and pages still ask
the network first, so fixes arrive right away.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

## Step 66: A still name, and a note that floats

**What changed:** home's name no longer jumps when the update finishes. "Checking your health
records…" floats over the top of the bag instead of taking room, then turns into a green check
that stays 3 seconds and fades.

**Why it moved:** the note was part of the page's layout, so whatever sat under it moved when
it came and went. A box with no height of its own, holding a note positioned over the bag,
takes no room, so nothing else moves.

## Step 67: The lock first, then the places your records are

**What changed:** the first run sets up the lock, then shows **Connect your health records**.
After each sign-in the patient unlocks and comes back to that screen, so they can connect the
next place before tapping Done. It's also **Health records** under More options.

**Why an unlock after every sign-in:** the lock's key lives only in the open page's memory, and
the browser can't copy it out. Signing in at a health system leaves the page, so the key is
gone when the sign-in comes back. Keeping the key somewhere to skip that unlock would let
anyone holding the phone skip the lock too. Where the patient was headed rides in
`sessionStorage`, which the browser keeps only for that tab.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

## Step 68: When two records disagree (reconciliation)

**What it is:** medication reconciliation is checking one person's medicine
lists against each other and settling what they really take. Nurses and
pharmacists do it at every admission and discharge, because a clinic, a
hospital and a pharmacy can each have a different list.

**What changed:** with a second source, Brown Bag puts the same medicine from
both on one card. When they agree, nothing changes. When they disagree on how
much, how often, or whether it's still taken, the card shows each version with
its source and date, and the review asks the patient one card at a time: "How
much do you take?", "How often do you take it?" or "Do you still take it?".
Until they answer, staff see "Records disagree: ask the patient", and the QR
code carries every version.

**Why it asks instead of choosing:** the newest record isn't always right, and
a missed stop is worse than one extra question. Brown Bag never picks a side
and never overwrites a record: it compares the sources fresh on every update,
keeps the patient's answer only while the records still say what they said,
and asks again when one changes. The care team confirms the list.

**How it decides two records are the same medicine:** the same RxNorm code,
the same product name, or the same ingredients in the same form. A different
form (metformin and extended-release metformin) or a matching first word alone
isn't enough, so those stay two cards, with a note for staff. And before any of that, the second source's patient must
have the same name and birth date, so two people are never mixed.

**Practice in the lab:** [Go Deeper](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#go-deeper)

## Step 69: Browsing every test patient

**What it is:** the SMART sandbox has 933 made-up patients, but its own sign-in
page shows only ten, and Brown Bag's list had 20 picked by hand. **Browse all
patients** finds the rest: search by name, and sort by who has the most
medicines, prescriptions, fills or allergies, or by name or age.

**How it knows who has the most:** a FHIR search can find patients who have
medicines (`Patient?_has:MedicationRequest:patient:status=...` reads "patients
that a MedicationRequest points to"), but it can't sort them by how many. So a
small tool, `tools/sandbox-patients.mjs`, asks the sandbox about each patient
once, counts their records, and saves the list in the app. That's also why it
opens instantly and still works when the sandbox is slow.

**Why it keeps the messy records:** a record marked "entered in error" or
missing a name is exactly what a real health system sends now and then, and
Brown Bag has to handle it. The data is the source of truth, even when it may
be wrong; Brown Bag's job is to make the mess clear, not to hide it.

**Practice in the lab:** [Guided Lab](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#guided-lab)

## Glossary

- **Refresh token**: a long-lasting pass an app trades for a new access token, with no sign-in page. Asked for with `offline_access`.
- **Access token**: the pass the sign-in page gives the app, used on every
  request for records.
- **AES-GCM**: the encryption method we use. Scrambles data and detects
  tampering.
- **Branch**: a separate line of work in a repo.
- **Bundle**: a FHIR package holding several records.
- **CDN (content delivery network)**: another company's computers that hand out popular files, like a library.
- **Certificate**: a website's digital ID, used for https.
- **Commit**: a saved snapshot of changes, with a message.
- **Compression**: shrinking data, like zipping a file.
- **AllergyIntolerance**: the FHIR record of an allergy or intolerance, with its reactions.
- **Binding**: which list of codes a FHIR field must or should use.
- **OperationOutcome**: a FHIR message about what went wrong, or was left out.
- **ExplanationOfBenefit (EOB)**: the FHIR record of an insurance claim; a pharmacy one shows a fill.
- **IPS (International Patient Summary)**: a FHIR document with a patient's key information, made to cross systems and borders.
- **LOINC**: the standard codes for kinds of documents, sections and lab tests.
- **NDC**: the US code for a drug package.
- **FHIR**: the standard format for health records data.
- **Fork**: your own copy of someone else's repo.
- **_include**: a FHIR search option that also returns the records the results point to.
- **GitHub Pages**: GitHub's free hosting for web pages. It publishes `main`.
- **https**: the secure version of web pages. The padlock in the address bar.
- **CSS animation**: motion described in the stylesheet; the browser draws the frames between start and end.
- **dvh**: a CSS unit, one hundredth of the screen height you can actually see.
- **Manifest**: a small file that tells a phone how to install a website like an app.
- **UCUM**: the standard list of units of measure (mL, mg) that FHIR uses.
- **WCAG**: the web accessibility standard. Brown Bag aims for level AA.
- **mkcert**: a tool that makes trusted certificates for testing at home.
- **Passkey**: a sign-in that uses Face ID, fingerprint or the phone's PIN.
- **PRF**: a passkey add-on that returns the same secret each time, after Face ID.
- **PBKDF2**: slows down guessing by repeating a calculation many times.
- **Push**: copy commits from your Mac to GitHub.
- **Reconciliation**: checking a person's medicine lists against each other and settling what they really take.
- **Repository (repo)**: a project folder with full history.
- **RxNav / RxNorm**: the US government's drug list and its lookup service.
- **Scope**: a permission the app asks for at sign-in.
- **Service worker**: a background script that keeps a site's files on the phone for offline use.
- **SMART**: the standard for how apps sign in to health records.
- **Test**: a small program that checks the real code does what it should.
