# One Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the first sign-in, one unlock (Face ID or PIN) opens Brown Bag with an updated list, using a SMART refresh token kept encrypted on the phone; the note area at the top of home shrinks to one short line per note.

**Architecture:** A new `js/pass.js` turns fhirclient's state into a small "pass" record (refresh token and where to use it), saves it encrypted per patient beside the saved list, and rebuilds a client from it. `js/app.js` gains an open path "saved list + pass: show saved list now, update in place". Note text moves to plain helpers (`noticesFor` returns `{ kind, text }`), and the Home Screen steps get their own screen.

**Tech Stack:** Plain HTML, CSS, ES modules; fhirclient 3.0.1 (already loaded, has `FHIR.client(state)` and `client.refresh()`); Web Crypto through `js/vault.js`. Node `node --test`. Headless Chrome scripts in the session scratchpad for screen checks, as in the one-screen plan.

**Spec:** `docs/superpowers/specs/2026-11-21-one-unlock-design.md` (approved 2026-11-21; the pass is kept with a PIN lock too).

## Global Constraints

- Work on `brown-bag-v1`; push after each commit; never touch `main`.
- Scope in `launch.html` gains `offline_access`; nothing else in it changes.
- The pass is stored only encrypted (`encryptJSON` with the lock key), under `brownbag:pass:<idTag(patientId)>`. Never in a backup, a URL, `console`, or unencrypted localStorage. fhirclient's own sessionStorage copy while the page is open is allowed (spec).
- Update gives up after 8000 ms, like the drug lookups.
- Note copy, exact (date is `Nov 21`, with `, 2025` style year only when not the current year):
  - `Updating your list…`
  - `No connection. List from Nov 21.`
  - `List from Nov 21. Sign in again to update it.` (button `Sign in`)
  - `Some records didn't load.`
  - `Add Brown Bag to your Home Screen.` (buttons `How?`, `Not now`)
- Sign out copy, exact: "Signing out disconnects Brown Bag from your records. Your saved list stays on this phone. You'll sign in again next time."
- Home at 375 by 667 with two notes: no scrolling at default text size; the bag at least a third of the screen height.
- WCAG 2.2 AA; notes sit in a live status area.
- Commit messages: one short line in Tyler's voice, no dashes, plus the attribution lines. Tests: `node --test "tests/*.test.mjs"` from `BrownBag/`.

## Review Focus

- The update finishes while the patient is on My medicines with a half-typed addition: the typed text stays; home shows the new list on Done. Headless check in Task 3.
- The token server refuses the pass: pass deleted, saved list kept, note "List from … Sign in again", QR still opens. Headless check in Task 3 (CDP `Fetch` answers the token request with 400 `invalid_grant`).
- The token request fails on the network while the phone says it's online: pass kept, note "No connection. List from …", next open tries again. Headless check in Task 3.
- The server sends no refresh token: no pass saved, the app behaves as before this plan. Unit test in Task 1.
- Sign out, then reopen: the sign-in screen shows, no silent update. Headless check in Task 3.

---

### Task 1: The pass (`js/pass.js`)

**Files:**
- Create: `js/pass.js`, `tests/pass.test.mjs`
- Modify: `sw.js` (add `./js/pass.js` to `APP_FILES`, cache name `brownbag-v3`)

**Interfaces:**
- Produces:
  - `passFromState(fhirState) -> { serverUrl, clientId, tokenUri, scope, refreshToken, patientId } | null` (null when `tokenResponse.refresh_token` is missing).
  - `clientStateFromPass(pass) -> object` for `FHIR.client()`: `{ serverUrl, clientId, tokenUri, scope, tokenResponse: { refresh_token, patient, scope } }`.
  - `savePass(storage, key, pass) -> Promise<void>`, `loadPass(storage, key, patientId) -> Promise<pass|null>` (null on missing or unreadable), `deletePass(storage, patientId) -> Promise<void>`.
  - `refreshRefused(error) -> boolean`: true when the token server answered 400 or 401 (fhirclient `HttpError` with `status`, or `error.response.status`); false for network errors, timeouts and anything else.
  - `withTimeout(promise, ms) -> Promise` rejecting with an `Error` whose `name` is `"TimeoutError"`.

- [ ] **Step 1: Failing tests** in `tests/pass.test.mjs`:
  - `passFromState` with a state holding `tokenResponse: { refresh_token: "r1", patient: "p1", scope: "s" }` and `serverUrl`, `clientId`, `tokenUri` returns those six fields; without `refresh_token` returns `null`.
  - `clientStateFromPass(passFromState(state))` keeps `serverUrl`, `clientId`, `tokenUri` and puts `refresh_token: "r1"`, `patient: "p1"` in `tokenResponse`.
  - save then load round-trips; the stored text contains neither `"r1"` nor `"p1"`; the storage name starts with `brownbag:pass:`.
  - `loadPass` for another patient → `null`; after `deletePass` → `null`.
  - `exportBackup` (from `js/vault.js`) on storage holding a pass: the backup text doesn't contain the pass's storage name.
  - `refreshRefused({ status: 400 })` and `({ status: 401 })` → true; `(new TypeError("Failed to fetch"))`, `({ name: "TimeoutError" })`, `({ status: 500 })` → false.
  - `withTimeout(new Promise(() => {}), 10)` rejects with `name === "TimeoutError"`; `withTimeout(Promise.resolve(3), 10)` resolves 3.
  - In `tests/offline.test.mjs`'s "every picture" style: `sw.js` lists `"./js/pass.js"`.
- [ ] **Step 2: Run.** Expected: fails, module missing.
- [ ] **Step 3: Implement** `js/pass.js` with `encryptJSON`, `decryptJSON`, `idTag` from `js/vault.js`; add it to `sw.js`.
- [ ] **Step 4: Run.** Expected: all pass.
- [ ] **Step 5: Commit** "Keep the sign in pass locked on the phone".

### Task 2: Note and Home Screen tip helpers

**Files:**
- Modify: `js/view.js`, `js/offline.js`, `js/install.js`, `tests/view.test.mjs`, `tests/offline.test.mjs`, `tests/install.test.mjs`

**Interfaces:**
- Produces:
  - `listDate(savedAt, now) -> string` in `js/offline.js`: `"Nov 21"`, or `"Nov 21, 2025"` when the year differs from `now`'s. Replaces `offlineNotice` and `savedNotice` (remove both and their tests).
  - `noticesFor({ updating, savedAt, offline, needsSignIn, failed, installTip, now }) -> Array<{ kind, text }>` in `js/view.js`, in this order: `updating` (when updating; then no date line) or `offline` (savedAt and offline) or `sign-in` (savedAt and needsSignIn), then `failed`, then `install`. Kinds are exactly `"updating" | "offline" | "sign-in" | "failed" | "install"`; texts are the Global Constraints copy.
  - `installTip(userAgent) -> string | null` in `js/install.js` (`"Add Brown Bag to your Home Screen."` on iPhone and Android, null elsewhere); `installSteps(userAgent) -> string[]`; `markInstallDone(storage)`; `shouldShowInstallHint` also returns false once done. Replaces `installHint`.
  - iPhone steps, exact: `["Tap More options, then Save a backup.", "Tap Share, then Add to Home Screen.", "Open Brown Bag from your Home Screen.", "Tap Restore from a backup and pick the file you saved."]`. Android steps: `["Open your browser's menu.", "Tap Install app or Add to Home screen.", "Open Brown Bag from your Home Screen."]`.

- [ ] **Step 1: Failing tests:** `listDate` same year and other year; `noticesFor` for each kind alone, all at once (`updating` hides the date line; order `updating, failed, install`), and nothing → `[]`; `installTip` on iPhone, Android, Mac; `installSteps(IPHONE)` equals the list above; after `markInstallDone`, `shouldShowInstallHint` is false even 60 days later and with no dismissal.
- [ ] **Step 2: Run.** Expected: fails on missing exports.
- [ ] **Step 3: Implement.** Done key `brownbag:install-done` (Start over erases it, by design).
- [ ] **Step 4: Run.** Expected: all pass. `js/app.js` still imports the old names, so also update its imports to the new ones in this step, with `drawNotices` reading `note.text` (buttons come in Task 4); the suite and a page load must both work.
- [ ] **Step 5: Commit** "Shorten the notes at the top".

### Task 3: Open with one unlock

**Files:**
- Modify: `launch.html` (scope), `js/app.js`

**Interfaces:**
- Consumes: Task 1 (`passFromState`, `clientStateFromPass`, `savePass`, `loadPass`, `deletePass`, `refreshRefused`, `withTimeout`), Task 2 (`noticesFor`).
- Produces: `state.updating`, `state.offline`, `state.needsSignIn` (booleans read by `drawNotices`); `loadFromClient(client) -> Promise<void>` (the patient read, additions, medicines and `saveRecords` part of today's `start()`, unchanged in behavior).

- [ ] **Step 1: Write the headless check** `drive/unlock.mjs` (scratchpad, built from `drive/home.mjs`): sign in as e7de504a; assert a `brownbag:pass:` item exists and no localStorage value contains the refresh token (read from `sessionStorage` fhirclient state). Then `sessionStorage.clear()`, open `index.html`, unlock, and assert: the page never navigates to `launch.smarthealthit.org/.../authorize`; a token request goes to `/auth/token`; `Updating your list…` shows, then goes away; home shows `My medicines (4)`. Then the five Review Focus cases (refused with 400 via `Fetch.fulfillRequest`; network failure via `Fetch.failRequest` while online; update held with `Fetch` pause while typing on My medicines then released; sign out then reopen shows `Sign in to your health records`).
- [ ] **Step 2: Run it.** Expected: fails at the first assertion (no pass saved).
- [ ] **Step 3: Implement** in `js/app.js`:
  - After a fresh sign-in (`cameBackFromAuth`), `loadFromClient(client)` then save `passFromState(client.state)` if not null.
  - Open path when not coming back from sign-in: `saved = loadLastRecords`; `pass = saved && loadPass(saved.patientId)`. With both: `useSaved`, `loadAdditions`, `state.updating = navigator.onLine`, `render()`, then if online: `client = FHIR.client(clientStateFromPass(pass))`, `withTimeout(client.refresh(), 8000)`, save the new pass if the refresh token changed, `loadFromClient(client)`. On error: `refreshRefused` → `deletePass`, `state.needsSignIn = true`; else `state.offline = true`. Always `state.updating = false`. Without a pass: today's path, with `needsSignIn` set when a saved list shows online.
  - Redraw after the update only when `state.screen === "home"`; other screens pick it up from `go()`. `render()` re-focuses the element whose id had focus when no `focusId` is set.
  - Sign out: `deletePass` for `state.patientId`, then today's steps; new Sign out copy.
- [ ] **Step 4: Run** the headless check and `node --test "tests/*.test.mjs"`. Expected: all pass.
- [ ] **Step 5: Commit** "Open with one unlock".

### Task 4: The note bar and the Home Screen steps

**Files:**
- Modify: `js/app.js`, `css/brownbag.css`

**Interfaces:**
- Consumes: Task 2 (`noticesFor` kinds, `installTip`, `installSteps`, `markInstallDone`, `dismissInstallHint`).
- Produces: screen `state.screen === "install"` drawn by `drawInstall()`; ids `install-how` (the How? button), `install-heading`, `install-done` (I've done this), `open-install` (on More options).

- [ ] **Step 1: Extend** `drive/unlock.mjs` (or a new `drive/notes.mjs`) with an iPhone user agent (`Emulation.setUserAgentOverride`): home at 375 by 667 shows the install line and an offline line; page height equals the viewport; `#home-bag` height ≥ `innerHeight / 3`; each note one line at default text size (`.notice-row p` height < 2 × its line height). How? opens the steps screen with the four iPhone steps; I've done this returns home and the tip is gone after a reload; More options shows `Add to Home Screen` and it opens the same steps. Run: fails.
- [ ] **Step 2: Implement** `drawNotices` with one row per note: `sign-in` gets a `Sign in` link-button to `./launch.html`; `install` gets `How?` (goes to `install`) and `Not now`. `drawInstall()`: big Done (back to home), `h1` "Add Brown Bag to your Home Screen", an `<ol>` of `installSteps`, big primary "I've done this" (`markInstallDone`, go home focus `show-qr`). `BACK_FOCUS.install = "show-qr"`. More options: "Add to Home Screen" secondary big button, only when `installTip(navigator.userAgent)` and not standalone. Listen for `appinstalled` → `markInstallDone`. The note bar is `role="status"` so VoiceOver reads "Updating your list…" and what replaces it. CSS: notes in a compact row, small buttons kept at least 44 px.
- [ ] **Step 3: Run** the check, axe on home with notes, the steps screen, and More options (light and dark), and `node --test "tests/*.test.mjs"`. Expected: all pass, no serious or critical axe issues.
- [ ] **Step 4: Commit** "Put the Home Screen steps behind How".

### Task 5: Learning log and full recheck

**Files:**
- Modify: `docs/LEARNING.md`

- [ ] **Step 1:** Rerun `drive/home.mjs`, `drive/motion.mjs`, `drive/final.mjs` (full and empty) and `drive/fixes.mjs`; all pass.
- [ ] **Step 2:** Learning log "Step 13. One unlock" (refresh tokens, `offline_access`, why the pass is encrypted, what happens when it ends, the shorter notes), with Practice in the lab: [Tokens](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/#tokens).
- [ ] **Step 3: Commit** "Explain the one unlock in the learning log".
