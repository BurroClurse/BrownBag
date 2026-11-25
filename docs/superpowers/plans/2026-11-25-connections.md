# Lock first, then a connections screen: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First run sets up the lock, then the connections screen. Every
sign-in comes back to that screen (or home, when it was started from home's
"Sign in" note). "Done" goes home.

**Architecture:** A small DOM-free module, `js/connections.js`, holds the
choices (where a sign-in returns to, what the screen says) so Node can test
them. `js/app.js` turns today's Health records screen (`drawRecordsFrom`)
into the connections screen and changes the order in `start()`.
`launch.html`'s own source list goes away: a plain `launch.html` sends you to
the app's connections screen, and launch keeps the test-patient picker and the
trip to the sign-in page.

**Tech Stack:** Plain ES modules, fhirclient 3.0.1, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-connections-design.md`

## Global Constraints

- One connection now: `state.patientId` and one pass, as today. Signing in to another test patient replaces it.
- The lock key never outlives the page. Where the patient goes after a sign-in rides in `sessionStorage` only.
- Copy, exactly:
  - setup heading `Connect your health records`
  - intro `Connect each place that has your medicines. You can add more later under More options.`
  - from More options, heading `Health records`
  - connected line `Connected`
  - failed sign-in `Sign-in didn't finish. Try again.`
  - offline `No connection. Connect once you have signal.`
  - buttons `Connect`, `Update now`, `Sign in again`, `Done`
- A saved list counts as connected, pass or not. Sign out keeps today's screen, and its Sign in goes to `./?open=connections`.
- The SMART Launcher (`?iss=`) and the README's test-patient links keep working.
- Every new JS file goes in `sw.js` `APP_FILES`, and the cache version goes up once for the branch.

## Review Focus

1. A sign-in cancelled at the sandbox (`?error=`) must land on the connections screen with the failed line, never a blank or error-only screen. Task 3's test pins `takeReturn` defaulting to `"setup"`.
2. Leaving mid-setup (lock set, nothing connected) and reopening must land on the connections screen, not home. Task 3 routes "no saved list" there.
3. With no signal and no saved list, the screen shows the offline line and still works. Task 1 tests `connectionsView` with `online: false`.
4. Signed out, `?open=connections` must not open the saved list before a new sign-in. Task 3 loads the saved list only when not signed out.
5. Done after a sign-in that started from More options has no history step to go back to. It must go home, not leave the app. Task 2's Done checks `history.state.bb === "records"`.

---

### Task 1: The choices, without the page

**Files:**
- Create: `js/connections.js`
- Test: `tests/connections.test.mjs`
- Modify: `sw.js` (add `"./js/connections.js"` to `APP_FILES`; `brownbag-v83` → `brownbag-v84`)

**Interfaces:**
- Produces:
  - `RETURN_KEY = "brownbag:after-sign-in"`
  - `keepReturn(storage, where)`: `where` is `"home" | "setup" | "more"`; anything else is ignored.
  - `takeReturn(storage) -> "home" | "setup" | "more"`: reads the value and removes it. Defaults to `"setup"`. Never throws.
  - `wantsConnections(search) -> boolean`: true when `open=connections`.
  - `connectionsView({ from, connected, online }) -> { heading, intro, done, offline }`. `done` is `"back" | "home" | null`; `offline` is a string or null.

- [ ] **Step 1: Write the failing tests** in `tests/connections.test.mjs`. Use a `Map`-backed fake storage with `getItem`, `setItem` and `removeItem`.
  - `keepReturn` then `takeReturn` gives `"home"`. A second `takeReturn` gives `"setup"`.
  - `keepReturn(s, "nope")` leaves nothing, so `takeReturn` gives `"setup"`.
  - Storage whose methods throw: `takeReturn` gives `"setup"`.
  - `wantsConnections("?open=connections")` is true; `""`, `"?open=saved"` and `"?code=1"` are false.
  - `connectionsView({ from: "setup", connected: false, online: true })` deep-equals `{ heading: "Connect your health records", intro: "Connect each place that has your medicines. You can add more later under More options.", done: null, offline: null }`.
  - Same with `connected: true`: `done` is `"home"`.
  - `from: "more", connected: true` gives `{ heading: "Health records", intro: null, done: "back", offline: null }`.
  - `online: false` gives `offline: "No connection. Connect once you have signal."`.
  - `sw.js` includes `"./js/connections.js"`.
- [ ] **Step 2: Run** `node --test tests/connections.test.mjs`. Expect it to fail with a module-not-found error.
- [ ] **Step 3: Implement** `js/connections.js` and the `sw.js` lines.
- [ ] **Step 4: Run** `node --test "tests/*.test.mjs"`. All pass except the 5 RxNav tests, which need network and get cancelled.
- [ ] **Step 5: Commit** with the message "Connections: where a sign-in returns, and what the screen says".

### Task 2: The connections screen

**Files:**
- Modify: `js/app.js`. `drawRecordsFrom()` (about line 2099) becomes `drawConnections()`. Also change the `render()` records branch, home's notice "Sign in" link in `drawNotices()`, and `state` (add `recordsFrom: "more"`, `signInFailed: false`).
- Modify: `css/brownbag.css`: a `.connected-mark` style (green, the same `#1d7a3a` as `.toast-check`).
- Test: `tests/connections.test.mjs`, source checks on `js/app.js` in the style of `tests/sources.test.mjs`.

**Interfaces:**
- Consumes: `connectionsView` and `keepReturn` from Task 1, plus `connected()`, `recordsStatus()` and `signInLink()` from `js/sources.js`.
- Produces: the `records` screen draws from `state.recordsFrom` (`"setup" | "more"`). `openConnections(from)` sets the screen to `records`, sets `recordsFrom` and calls `render()`. Task 3 uses it.

- [ ] **Step 1: Write the failing tests.**
  - `js/app.js` has `function drawConnections(` and no `function drawRecordsFrom(`.
  - Its body includes `keepReturn(sessionStorage, state.recordsFrom)`.
  - `drawNotices` includes `keepReturn(sessionStorage, "home")`.
  - Its body includes `history.state.bb === "records"`.
- [ ] **Step 2: Run.** Expect them to fail.
- [ ] **Step 3: Implement `drawConnections()`.**
  - The view comes from `connectionsView({ from: state.recordsFrom, connected: Boolean(state.patientId), online: navigator.onLine })`.
  - Top: a Done button when `view.done` is set. If `history.state && history.state.bb === "records"`, Done calls `history.back()`. Otherwise it calls `go("home", "show-qr")`.
  - Then the `h1` (id `records-from-heading`), the intro, and the offline line as a `notice`.
  - One card per `connected()` source.
    - Linked (`state.patientId` set): `✓ Connected` in `.connected-mark`, today's status rows and note, Update now, and Sign in again.
    - Not linked: the name, the note, and a primary `Connect` link to `signInLink()`.
    - When `state.signInFailed` is set, add `Sign-in didn't finish. Try again.` as `.error`.
    - Every sign-in link gets a click listener that calls `keepReturn(sessionStorage, state.recordsFrom)`.
  - Then `drawNotConnected(root)`.
  - With `from === "setup"` and something linked, add a big primary Done again at the end.
  - Home's notice Sign in link calls `keepReturn(sessionStorage, "home")` on click.
  - `go("records", ...)` from More options sets `state.recordsFrom = "more"` first.
- [ ] **Step 4: Run** the full suite. Everything passes.
- [ ] **Step 5: Commit** with the message "Health records becomes the connections screen".

### Task 3: Lock first, and where sign-ins land

**Files:**
- Modify: `js/app.js`: `start()`, `signInUnavailable()`, `savedListAsked()`. Remove `drawSignedOut`, `drawRestoreFromSignIn`, `drawNoConnection`, and the `!hasSavedList` early branch.
- Modify: `js/lock-screen.js`: remove the `restoreBackupText` export (its only caller goes; restore stays on the lock set-up screen).
- Modify: `tests/sources.test.mjs`. The "Sign in after the lock…" and "sign-in screens don't show the note" tests now expect:
  - no `href = "./launch.html"` in `js/app.js`;
  - `savedListAsked` links `./?open=connections`;
  - `drawConnections` has no `DISCLAIMER`.

**Interfaces:**
- Consumes: `takeReturn` and `wantsConnections` (Task 1), and `openConnections(from)` (Task 2).

- [ ] **Step 1: Write the failing tests** (source checks).
  - `start()` has no `drawSignedOut(`.
  - `start()` calls `takeReturn(sessionStorage)`.
  - `start()` checks `wantsConnections(location.search)`.
  - `js/lock-screen.js` has no `export function restoreBackupText`.
- [ ] **Step 2: Run.** Expect them to fail.
- [ ] **Step 3: Implement the new order in `start()`.**
  1. Signed out, no `?open=saved`, no `?open=connections`: `savedListAsked()`. Its Sign in goes to `./?open=connections`.
  2. `showLockScreen(root)`: set-up when there's no lock, else unlock.
  3. `?open=connections`: `history.replaceState(null, "", "./")`. Load the saved list when not signed out (`loadLastRecords`, then `useSaved` and `loadAdditions`). Then `openConnections("setup")`.
  4. Not back from a sign-in: `openWithPass()` as today.
  5. Back from a sign-in: `where = takeReturn(sessionStorage)`.
     - On success: `"home"` renders home; otherwise `openConnections(where)`.
     - On failure (`signInUnavailable(error)` with `cameBackFromAuth`): load any saved list. Home with the note when `where === "home"` and there is a list. Otherwise set `state.signInFailed = true` and `openConnections(where === "more" ? "more" : "setup")`.
  6. `signInUnavailable` with no saved list (online or not): `openConnections("setup")`.
- [ ] **Step 4: Run** the full suite. Everything passes.
- [ ] **Step 5: Commit** with the message "Lock first; sign-ins come back to the connections screen".

### Task 4: launch.html without its own list

**Files:**
- Modify: `js/launch.js`.
  - `showList()` becomes `location.replace("./?open=connections")`. Drop its `drawNotConnected` import.
  - The patient picker's Back, `back()` and `showFailed`'s Back go to `./?open=connections`.
- Modify: `tests/sources.test.mjs`. "Both lists of sources are drawn the same way" now expects only `js/app.js` to call `drawNotConnected(`, and `js/launch.js` to contain `./?open=connections`.

- [ ] **Step 1: Change the tests.** Run them and expect them to fail.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the full suite. Everything passes.
- [ ] **Step 4: Commit** with the message "launch.html hands its list to the connections screen".

### Task 5: Docs and a real browser run

**Files:**
- `README.md`: the Live link becomes the site root; "Signing in" describes lock, then connections; "Sign in also names" becomes "The connections screen also names".
- `docs/NEEDS-TESTING.md`: a dated entry for this flow on the phones.
- The spec's status line.

- [ ] **Step 1:** Edit the docs. `node --test tests/readme.test.mjs` passes.
- [ ] **Step 2:** Serve the repo over `http://localhost`, where Playwright with a 6-digit PIN can run the flow.
  - First run: PIN set-up, then the connections screen with Connect and no Done.
  - Connect: the test-patient picker.
  - With the sandbox reachable: pick a patient and approve. Expect a PIN unlock, then the connections screen with `Connected` and Done, and Done goes home.
  - `?open=connections` with a lock goes to unlock, then this screen.
  - If the sandbox host is blocked here, say so and stop at the picker.
- [ ] **Step 3: Commit** with the message "Docs for lock first and the connections screen".
