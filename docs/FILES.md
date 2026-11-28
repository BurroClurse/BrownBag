# Files

What each file in Brown Bag is for. The [README](../README.md) says what the
app does, and [HOW-IT-WORKS](HOW-IT-WORKS.md) walks through it. Every script
in `js/` is listed here (`tests/readme.test.mjs` checks).

| File | Purpose |
| --- | --- |
| `launch.html`, `js/launch.js` | The sandbox's test patients, then the patient standalone launch. A plain `launch.html` goes to the connections screen. |
| `index.html` | The app: lock, sign-in return, home, My medicines, QR code. |
| `share.html` | The page staff see after scanning. |
| `js/app.js`, `js/view.js` | Screens and the plain helpers behind them. |
| `js/meds.js` | FHIR records into one deduplicated list. |
| `js/med-list.js` | One source's search answers into its list: references, RxNav term types, "no medicines" entries. |
| `js/claims.js` | Insurance pharmacy claims into fills, matched to the list. |
| `js/reconcile.js` | Joins the sources: whether two are the same person, how two records match, and what they disagree on. |
| `js/review.js` | The review when sources disagree: what each card asks, its choices and the answer it saves. |
| `js/snapshot.js` | A shared list opened again (an IPS file or Brown Bag list) as one more dated source. Ready in the core and tested; no screen opens one yet. |
| `js/demo-source.js` | Test records from a made-up second clinic, offered only by the home test server. |
| `js/allergies.js` | Allergy records and the patient's own, one row each. |
| `js/sources.js`, `js/source-list.js` | The sources: which are connected, how current they are, and what shows for the rest. |
| `js/sandbox-patients.js` | Browse all patients' saved list: the sandbox's patients with a medicine record and their counts. Made by `tools/sandbox-patients.mjs`. |
| `js/browse.js` | Browse all patients: sorts, searches and words the saved list of sandbox patients, and picks out patients other people added for the live view. |
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
| `assets/` | The full-size logo and app icon (2048 px), the sources for `icons/`, the see-through logo the README shows, and the README's phone pictures (`readme-*.png`, sandbox test data only). None of these are app files. |
| `tests/` | Node tests, with saved sandbox records in `tests/fixtures/`. |
| `tools/` | The home https server (`serve.mjs`, with the test clinic), the scripts that put test patients on the sandbox (`demo-patient.mjs`, `reconcile-patients.mjs`), the one that makes Browse all patients' saved list (`sandbox-patients.mjs`), and the logo source. |
| `docs/` | [How it works](HOW-IT-WORKS.md), this list, [test patients and sandboxes](SANDBOXES.md), [the limits on keeping the list current](LIMITS.md), [what's waiting for a phone test](NEEDS-TESTING.md), [the learning log](LEARNING.md), and the designs, build plans and research under `docs/superpowers/`. |
| `prompts/` | Prompts for an AI agent: list the sandbox's test data (`sandbox-data.md`), and run the phone test pass on the Mac (`phone-pass.md`). |
| `health.html` | From the course starter; not part of Brown Bag. |
| `BrownBagMatch.ipynb` | A Google Colab notebook that runs Brown Bag's own matching on synthetic patients and counts wrong joins and wrong splits. A test tool, never part of the app. |
| `README.md`, `CLAUDE.md` | The short tour, and the standing rules for working on Brown Bag. |
| `LICENSE`, `NOTICE.md` | Copyright and permission, and the notices for the course starter, the libraries, LOINC, UCUM and trademarks. |
