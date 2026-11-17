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

- On your Mac: `~/Developer/HL7-Build-the-Code/BrownBag`
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
cd /Users/tylerbeattie/Developer/HL7-Build-the-Code/BrownBag && git log --oneline
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
cd /Users/tylerbeattie/Developer/HL7-Build-the-Code/BrownBag && node --test "tests/*.test.mjs"
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

### Step 5. Running it on your Mac with https (in progress)

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
cd /Users/tylerbeattie/Developer/HL7-Build-the-Code/BrownBag && node tools/serve.mjs
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
- **GitHub Pages**: GitHub's free hosting for web pages. It publishes `main`.
- **https**: the secure version of web pages. The padlock in the address bar.
- **mkcert**: a tool that makes trusted certificates for testing at home.
- **Passkey**: a sign-in that uses Face ID, fingerprint or the phone's PIN.
- **PBKDF2**: slows down guessing by repeating a calculation many times.
- **Push**: copy commits from your Mac to GitHub.
- **Repository (repo)**: a project folder with full history.
- **RxNav / RxNorm**: the US government's drug list and its lookup service.
- **Scope**: a permission the app asks for at sign-in.
- **SMART**: the standard for how apps sign in to health records.
- **Test**: a small program that checks the real code does what it should.
