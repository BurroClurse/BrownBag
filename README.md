# Brown Bag

Brown Bag helps patients give every healthcare worker an accurate medication list by gathering their medicines from their records, adding what they buy over the counter, and sharing it with one QR code.

It is a patient-facing SMART on FHIR app for the HL7 Break the Code course. It runs as static pages on GitHub Pages, signs in against the SMART Health IT R4 sandbox, and reads the patient's MedicationRequest and MedicationStatement records.

Design: [`docs/superpowers/specs/2026-11-17-brown-bag-design.md`](docs/superpowers/specs/2026-11-17-brown-bag-design.md). How it was built, step by step: [`docs/LEARNING.md`](docs/LEARNING.md).

## What the patient sees

- **A lock first.** Face ID or fingerprint (a passkey), or a 6-digit PIN where the phone can't do that.
- **From your records.** One line per medicine, repeats merged, strengths of the same medicine shown as a dose change, older prescriptions folded away. "I stopped this" moves a medicine to **Stopped by me**.
- **Added by me.** Over-the-counter medicines and supplements, checked against RxNorm, saved on the phone only, encrypted.
- **Show my QR code.** The list packed into the link after `#`, encrypted, with a 6-digit code the patient reads out. Staff open it on `share.html`.
- **Works with no signal.** The last list is saved encrypted on the phone, and the app's files are kept by a service worker.
- **Backups.** An encrypted backup file to keep in Files or iCloud, with Restore.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The app: lock, sign-in return (OAuth redirect target), the medicine list, additions, QR code, backup. |
| `launch.html` | Patient standalone launch. Calls `FHIR.oauth2.authorize()`. |
| `share.html` | The page staff see after scanning. Asks for the 6-digit code, then shows the list. |
| `health.html` | Static hosting smoke check. |
| `manifest.webmanifest`, `icons/` | Home Screen install: name and paper-bag icon. |
| `sw.js` | Service worker. Keeps the app's own files for offline use. Never stores health data. |
| `css/brownbag.css` | Shared styles, light and dark. |
| `js/meds.js` | Turns FHIR records into one deduplicated list. |
| `js/rxnorm.js` | Drug name search and ingredient lookup through RxNav. |
| `js/vault.js` | Encryption (AES-GCM), PIN keys (PBKDF2), encrypted storage and backups. |
| `js/lock.js`, `js/lock-screen.js` | The passkey or PIN lock and its screens. |
| `js/share.js` | Builds the shared FHIR Bundle and packs it into the encrypted QR link. |
| `js/share-view.js` | Runs `share.html`. |
| `js/view.js`, `js/app.js` | The main screen. |
| `js/install.js` | Home Screen hint and backup helpers. |
| `js/offline.js` | The saved list for use with no signal. |
| `tests/` | Node tests, plus saved sandbox records in `tests/fixtures/`. |
| `tools/serve.mjs` | Local https server for testing on a phone. |
| `docs/` | Design, build plan and learning log. |
| `.nojekyll` | Serves the files as-is on GitHub Pages. |

## Run the tests

Needs Node 22 or later. No packages to install.

```bash
cd "/Users/tylerbeattie/Developer 2/HL7-Build-the-Code/BrownBag" && node --test "tests/*.test.mjs"
```

## Run it on the Mac and a phone

Encryption, passkeys and the camera only work on https pages, so the local server uses a certificate from [mkcert](https://github.com/FiloSottile/mkcert).

1. Install mkcert and trust it on the Mac (asks for the Mac password):

   ```bash
   brew install mkcert
   ```

   ```bash
   mkcert -install
   ```

2. Make the certificate for this Mac's addresses. It goes in `.certs/`, which is never committed:

   ```bash
   cd "/Users/tylerbeattie/Developer 2/HL7-Build-the-Code/BrownBag" && mkdir -p .certs && mkcert -cert-file .certs/cert.pem -key-file .certs/key.pem localhost 127.0.0.1 "$(ipconfig getifaddr en0)" "$(scutil --get LocalHostName).local"
   ```

3. On the iPhone, install `rootCA.pem` from `$(mkcert -CAROOT)` (AirDrop it; never send `rootCA-key.pem`), then turn it on in Settings ▸ General ▸ About ▸ Certificate Trust Settings.

4. Start the server:

   ```bash
   cd "/Users/tylerbeattie/Developer 2/HL7-Build-the-Code/BrownBag" && node tools/serve.mjs
   ```

   It prints the addresses to open. On the phone, use the `.local` address to test Face ID: passkeys don't work on a plain number address like `192.168.0.224`, which falls back to the PIN.

## Publish and verify

1. Push the files, including `.nojekyll`, to `main` of a GitHub project repository.
2. In **Settings → Pages → Build and deployment**, select **Deploy from a branch**, then **main** and **/(root)**. Save.
3. After deployment, open `launch.html`. The SMART sandbox asks you to sign in as a patient. After you approve access, the app opens `index.html`, asks you to set up the lock, and shows that patient's medicines.

| Page | Default GitHub Pages URL |
| --- | --- |
| App, after sign-in | `https://<owner>.github.io/<repo>/` |
| Health check | `https://<owner>.github.io/<repo>/health.html` |
| Patient sign-in | `https://<owner>.github.io/<repo>/launch.html` |

These URLs assume a project site with the default domain. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Patient sign-in

`launch.html` starts a standalone launch at the [SMART Health IT R4 sandbox](https://launch.smarthealthit.org/). The scopes are:

```
launch/patient openid fhirUser patient/Patient.read patient/MedicationRequest.read patient/MedicationStatement.read patient/Medication.read patient/Practitioner.read
```

`launch/patient` makes the sandbox ask which patient is signing in. Each `patient/<Resource>.read` scope lets the app read only that patient's records of that type, and never change them. The sandbox sends the browser back to `index.html`, and `FHIR.oauth2.ready()` exchanges the authorization code for an access token. [HL7 SMART App Launch](https://hl7.org/fhir/smart-app-launch/app-launch.html)

## Privacy

- Health data goes only to the patient's phone and, through the QR code, to the person they show it to.
- The QR list sits after `#` in the link, which browsers never send to the web server.
- Everything Brown Bag saves on the phone is encrypted with a key rebuilt from Face ID or the PIN. The key itself is never stored.
- This list is what the patient and their records say. Their care team confirms it.
