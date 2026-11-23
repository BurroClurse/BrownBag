# Medicare Fills (Blue Button v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A patient connects Medicare from More options, and their Part D fills join the same fill lines, "Filled, not in your records" items and QR notes as the sandbox claims, guarded by a same-person check.

**Architecture:** Each insurer is a claims source with its own status and raw fills. The app keeps the medicines before fills (`base`) and the sources' raw fills, both in the encrypted saved copy, and recombines them on every update (`combineSources`). A Netlify function holds the Blue Button client secret and only swaps and renews tokens; the phone reads Blue Button's FHIR API directly. Medicare's NDC codes become RxNorm through RxNav (`rxcuisForNdcs`, from pull request #1).

**Tech Stack:** Static ES modules on GitHub Pages; one Netlify Function (Node, `export default async (request) => Response`); FHIR R4 / CARIN Blue Button on Blue Button **v3**; Node's test runner; headless Chrome checks in the session scratchpad; the two virtual phones per `docs/NEEDS-TESTING.md`.

**Spec:** `docs/superpowers/specs/2026-11-22-medicare-blue-button-design.md`

## Global Constraints

- Blue Button v3 paths: authorize `https://sandbox.bluebutton.cms.gov/v3/o/authorize/`, token `https://sandbox.bluebutton.cms.gov/v3/o/token/`, FHIR base `https://sandbox.bluebutton.cms.gov/v3/fhir/`. Scopes always listed: `patient/Patient.rs patient/ExplanationOfBenefit.rs profile`. PKCE S256 only.
- Redirect address: `https://burroclurse.github.io/BrownBag/medicare.html` (live) and `https://localhost:8443/medicare.html` (home test server), exactly as registered.
- The client secret lives only in Netlify's environment variables (`BB_CLIENT_SECRET`). Never in the repo, GitHub secrets, logs or chat.
- The server never stores or logs a request, a code or a token, and answers only `https://burroclurse.github.io` and `https://localhost:8443`.
- Claims and medicines never pass through the server.
- Same person: family name, first given name and birth date; capitals, spaces, punctuation, accents and endings Jr., Sr., II, III, IV ignored; birth date exact. Different, or not shared: Medicare fills are not added. Sandbox only: shown under "Medicare test patient (not you)", never counted in "My medicines (N)", never in the QR code.
- The insurer label for every Blue Button fill is "Medicare".
- Medicare pass: encrypted with the lock's key, one per records patient, deleted after 30 days unused (`PASS_UNUSED_DAYS`), on Sign out and on "Remove my Medicare claims"; kept when the health system asks to sign in again.
- Copy, exactly: "Add my Medicare claims", "Remove my Medicare claims", "This Medicare account is for someone else.", "Medicare didn't share your name and birth date, so Brown Bag can't check this is you. Remove Medicare and add it again, and allow it.", "Sign in to Medicare again to update your Medicare fills.", "Your Medicare fills couldn't be updated. Showing fills from <date>.", "Your Medicare fills couldn't be loaded.", "Medicare test patient (not you)".
- "No fill found in your claims" (and "No fill found in claims" in the QR) only when every connected source loaded or has saved fills.
- Static site, no new libraries in the app. WCAG 2.2 AA. QR within version 40-M.
- Commits: one short line in Tyler's voice, no dashes, attribution lines; explicit paths. Every task that passes its tests goes to `main` (fast-forward), and adds its phone checks to `docs/NEEDS-TESTING.md`. Sign-in, the lock and the saved list are "test right away" changes.

## Review Focus

1. Medicare shares claims but the patient withheld demographics: the Patient read is refused (403). Expected: "didn't share" note, no Medicare fills merged, no crash. Pinned in Task 4 and Task 7.
2. Sandbox claims load, Medicare is slow or fails: no card says "No fill found", no QR note says "No fill found in claims", and saved Medicare fills show with their date. Pinned in Task 2.
3. Coming back to `medicare.html` with a missing or wrong `state`, or with `error=access_denied` (the patient pressed Deny): no token swap, a plain message, back to the list. Pinned in Task 6.
4. Medicare renewal refused (400/401): the Medicare pass is deleted, the saved Medicare fills stay with the "Sign in to Medicare again…" note, and the health-system update still lands. Pinned in Task 7.
5. A saved copy from before this change (no `base`, fills already merged): opens as before, and the next update rebuilds it. Pinned in Task 3.

---

### Task 1: NDC to RxNorm (from pull request #1)

**Files:**
- Modify: `js/rxnorm.js` (add `rxcuisForNdcs`, share one parallel lookup helper with `ingredientsFor`)
- Test: `tests/rxnorm.test.mjs`

**Interfaces:**
- Produces: `rxcuisForNdcs(ndcs: string[], fetchFn?, { timeoutMs }?) -> Promise<Map<ndc, { rxcui: string, name: string|null }>>`. Dashes are removed before the lookup; the map is keyed by the NDC as given.

- [ ] **Step 1: Write the failing tests** (adapt the pull request's tests to the current `ingredientsFor` signature, which takes `{ timeoutMs }`):
  - "rxcuisForNdcs uses ndcstatus and keys by the NDC given": fake fetch returns `{ ndcStatus: { rxcui: "617310", conceptName: "atorvastatin 20 MG Oral Tablet" } }` for `ndc=00071015523`; `rxcuisForNdcs(["00071-0155-23"], fake)` → map has `"00071-0155-23"` → `{ rxcui: "617310", name: "atorvastatin 20 MG Oral Tablet" }`, and the URL asked for `ndc=00071015523`.
  - "an NDC no longer sold uses the newest history rxcui": `{ ndcStatus: { ndcHistory: [{ activeRxcui: "1", endDate: "2019" }, { activeRxcui: "2", endDate: "2023" }] } }` → `"2"`.
  - "unknown NDCs and failed lookups are left out".
- [ ] **Step 2: Run to see them fail.** `node --test tests/rxnorm.test.mjs` → `rxcuisForNdcs` not exported.
- [ ] **Step 3: Implement** from the pull request's `rxcuisForNdcs` and `newestHistoryRxcui`, keeping the current `ingredientsFor` behaviour (all ingredients joined with "+", its timeout option).
- [ ] **Step 4: Run the whole suite.** All pass.
- [ ] **Step 5: Commit** `js/rxnorm.js tests/rxnorm.test.mjs`: "Turn package codes into drug codes through RxNav".

### Task 2: Claims sources, combined

**Files:**
- Modify: `js/claims.js`, `js/app.js` (`medRow` fill line rule; `loadFresh` returns `base` and `sources`), `js/share.js` (no "No fill found" note unless every source is in)
- Test: `tests/claims.test.mjs`, `tests/share.test.mjs`

**Interfaces:**
- Consumes: `rxcuisForNdcs` (Task 1).
- Produces:
  - `fillsFromClaims(eobs, { insurer?: string, types?: string[] }?)`: `types` adds accepted type codes besides `pharmacy` (Medicare passes `["PDE"]`, any system); `insurer` replaces every fill's insurer and sets `cash: false`. Each fill also gets `ndc` (the `http://hl7.org/fhir/sid/ndc` code, or null).
  - `readClaims(request, patientId, lookup, ms, { query?: string, toFills?: (eobs) => Promise<fill[]> }?)`: `query` is appended to the first search ("&type=PDE"); `toFills` replaces `fillsFromClaims`.
  - `combineSources(base, sources, now) -> split`: `base` is the medicines split before fills (with `ingredientOf` as a Map); `sources` is `{ [name]: { status: "loaded"|"none"|"refused"|"failed"|"stale", fills: fill[], ingredientOf: [rxcui, value][], savedAt?: string } }`. All usable fills (status `loaded`, or `stale` with saved fills) go through `attachFills` together. The result's `claims` is `"loaded"` only when every source is `loaded` or `none`; `"partial"` when some fills are in but a source is `stale`/`failed`/`refused`; otherwise the single source's status (as today). `split.sources` keeps each source's `{ status, savedAt }`.
- `mergeClaims` stays as a thin wrapper: `combineSources(split, { sandbox: result }, now)`.

- [ ] **Step 1: Write the failing tests**
  - "Medicare PDE claims count with insurer Medicare and keep their NDC": a claim with `type.coding [{ system: "https://bluebutton.cms.gov/resources/codesystem/eob-type", code: "PDE" }]`, product coding only NDC `00071015523` → with `{ insurer: "Medicare", types: ["PDE"] }` one fill `{ rxcui: null, ndc: "00071015523", insurer: "Medicare", cash: false }`; without options, no fill.
  - "fills from two sources land on one card": base lisinopril; sandbox fill Aetna 2026-09-21, medicare fill Medicare 2026-10-03 → `fills.count` 2, `insurers` `["Aetna", "Medicare"]`, `claims` `"loaded"`.
  - "one source failed: claims is partial and fills already in still show": sandbox loaded with a lisinopril fill, medicare `failed` → `claims` `"partial"`, lisinopril `fills.count` 1.
  - "a stale source uses its saved fills": medicare `{ status: "stale", fills: [...], savedAt: "2026-11-20T…" }` → its fills counted; `split.sources.medicare.savedAt` kept.
  - share.test: "No fill found is left out when claims are partial": item `fills: { count: 0 }` with `claims: "partial"` passed in the share list → no note "No fill found in claims". (Pass `claims` through `shareListFrom` → `buildShareBundle` as `list.claims`.)
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** `medRow`: show `fillLine` when `fills.count > 0` and `claims` is `"loaded"` or `"partial"`; show "No fill found in your claims" only when `claims === "loaded"`. Notes in `drawRecords` keep today's sandbox wording for `refused`/`failed`.
- [ ] **Step 4: Run the whole suite**, then `drive/fills.mjs` demo is skipped (Avery is wiped nightly; Loria has no claims): run `drive/final.mjs full` and `drive/addform.mjs` lists on Loria.
- [ ] **Step 5: Commit** `js/claims.js js/app.js js/share.js tests/claims.test.mjs tests/share.test.mjs`: "Claims come from sources that combine on each card". Publish.

### Task 3: The saved copy keeps medicines and sources apart

**Files:**
- Modify: `js/app.js` (`loadFresh`, `usePatient`, `keepFreshCopy`, `useSaved`), `js/view.js` if a pure helper fits there
- Test: `tests/view.test.mjs` (or `tests/claims.test.mjs`) and a headless check

**Interfaces:**
- Consumes: `combineSources` (Task 2).
- Produces: `state.base` and `state.sources`; saved copy gains `base: { current, older, failed, placeholders, ingredientOf: [k, v][] }` and `sources`; `splitFromSaved(saved, now) -> split` (in `js/claims.js`): with `base` → `combineSources(base, sources marked "stale", now)`; without `base` (older copies) → the saved `current`/`older`/`claims` as today.

- [ ] **Step 1: Write the failing tests**
  - "splitFromSaved rebuilds fills from base and saved sources" (stale statuses, fills counted, `claims` `"partial"` until an update).
  - "splitFromSaved opens a copy saved before this change unchanged" (Review Focus 5).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement**; an update replaces a source only when that source answered (`loaded`/`none`), otherwise keeps its saved fills as `stale`.
- [ ] **Step 4: Run the suite and `drive/final.mjs full`** (sign in, reopen with the pass, list shows the same).
- [ ] **Step 5: Commit**: "Saved list keeps medicines and fills apart". Publish; add "saved list reopens the same after an update" to NEEDS-TESTING (test right away: both simulators).

### Task 4: Medicare pieces (no screen yet)

**Files:**
- Create: `js/medicare.js`, `js/medicare-config.js`
- Modify: `sw.js` (add both files; next cache name)
- Test: `tests/medicare.test.mjs`

**Interfaces:**
- Produces, in `js/medicare.js`:
  - `makePkce() -> Promise<{ verifier: string, challenge: string }>` (43+ char verifier, S256 base64url challenge).
  - `authorizeUrl({ clientId, redirectUri, state, challenge }) -> string` with `response_type=code`, the Global Constraints scopes, `code_challenge_method=S256`.
  - `medicarePassFrom(tokenResponse, now) -> { accessToken, refreshToken, expiresAt, medicarePatientId, usedAt }` (`expiresAt = now + expires_in*1000`; `medicarePatientId` from `patient`).
  - `needsRenewal(pass, now) -> boolean`: true within 5 minutes of `expiresAt` (Claude's call; the spec leaves "near expiry" to the builder).
  - `samePerson(records: { name, birthDate }, medicarePatient) -> "same" | "different" | "unknown"`; `records.name` is the display name Brown Bag already shows ("Given Family"); compare family and first given after normalising (lowercase, strip accents with NFD, drop punctuation, drop suffixes jr sr ii iii iv); "unknown" when Medicare's Patient is missing or has no name or birthDate.
  - `readMedicare(pass, { fetchFn, lookup, ndcLookup, ms }) -> Promise<{ status, fills, ingredientOf, person: "same"|"different"|"unknown"|null }>`: reads `Patient/{medicarePatientId}` (403 → person "unknown"), then `readClaims` with `query "&type=PDE"` and `toFills` that maps NDCs to RxNorm with `ndcLookup` and sets insurer "Medicare". 401 on the claims → status "refused".
- `js/medicare-config.js`: `export var MEDICARE = { clientId: "<from Tyler>", tokenServer: "<Netlify function URL>", sandbox: true, authorize, fhirBase }`, with the v3 addresses.

- [ ] **Step 1: Write the failing tests**
  - "makePkce challenge is the S256 of the verifier".
  - "authorizeUrl lists the scopes and S256": contains `scope=patient%2FPatient.rs+patient%2FExplanationOfBenefit.rs+profile` (or `%20`), `code_challenge_method=S256`, the exact redirect.
  - "samePerson ignores capitals, punctuation, accents and suffixes": records `{ name: "Mary O'Brien-Núñez Jr.", birthDate: "1950-03-14" }` vs Medicare `name [{ family: "OBRIEN NUNEZ", given: ["MARY"] }]`, `birthDate "1950-03-14"` → "same"; birth date off by a day → "different"; no birthDate → "unknown".
  - "readMedicare with a refused Patient read says person unknown and still reads claims" (Review Focus 1).
  - "readMedicare maps NDC fills to RxNorm and labels them Medicare".
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite.**
- [ ] **Step 5: Commit** `js/medicare.js js/medicare-config.js sw.js tests/medicare.test.mjs`: "Medicare pieces: PKCE, same person check and reading Part D". (`clientId` and `tokenServer` stay placeholders until Task 5's checkpoint.)

### Task 5: The token server, and Tyler's Netlify checkpoint

**Files:**
- Create: `server/token.mjs` (pure handler), `netlify/functions/medicare-token.mjs` (wraps it), `netlify.toml`, `server/public/index.html` (one line: "Brown Bag token service")
- Test: `tests/token.test.mjs`

**Interfaces:**
- Produces: `handleToken(request: Request, env: { BB_CLIENT_ID, BB_CLIENT_SECRET, BB_TOKEN_URL? }, fetchFn) -> Promise<Response>`.
  - Allowed origins `https://burroclurse.github.io`, `https://localhost:8443`; others → 403 with no CORS header.
  - `OPTIONS` → 204 with `Access-Control-Allow-Origin` (the caller's allowed origin), methods `POST`, headers `content-type`.
  - `POST` JSON body only, at most 4 KB: `{ grant_type: "authorization_code", code, code_verifier, redirect_uri }` (redirect must be one of the two registered) or `{ grant_type: "refresh_token", refresh_token }`; anything else → 400.
  - Forwards form-encoded to `BB_TOKEN_URL` (default the v3 token address) with HTTP Basic `BB_CLIENT_ID:BB_CLIENT_SECRET`; returns Blue Button's status and JSON body unchanged, with the CORS header.
  - Never logs; never puts the secret in a response.
- `netlify.toml`: `[build] publish = "server/public"`, `[functions] directory = "netlify/functions"`. Function URL: `https://<site>.netlify.app/.netlify/functions/medicare-token`.

- [ ] **Step 1: Write the failing tests**: unknown origin 403; OPTIONS preflight; wrong grant type 400; unregistered redirect 400; body over 4 KB 400; a good code swap sends Basic auth with the id and secret and returns the fake token body; the secret never appears in any response body or header.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite.**
- [ ] **Step 5: Commit** and publish: "Small server that swaps Medicare sign ins".
- [ ] **Step 6: Checkpoint, Tyler (stop and ask).** He creates a Netlify site from the GitHub repo `BurroClurse/BrownBag` (branch `main`), and under Site configuration ▸ Environment variables adds `BB_CLIENT_ID` and `BB_CLIENT_SECRET` (secret). He sends the site address and the Client ID. Claude puts both into `js/medicare-config.js`, checks `OPTIONS` and an unknown-origin `POST` against the live function with curl, commits and publishes.

### Task 6: Connecting and removing Medicare

**Files:**
- Create: `medicare.html`, `js/medicare-return.js`
- Modify: `js/app.js` (`drawMore`: Medicare section; Sign out removes the Medicare pass), `js/pass.js` (Medicare pass storage), `sw.js`
- Test: `tests/pass.test.mjs`, headless `drive/medicare.mjs` (scratchpad)

**Interfaces:**
- Produces, in `js/pass.js`: `saveMedicarePass(storage, key, recordsPatientId, pass)`, `loadMedicarePass(storage, key, recordsPatientId)`, `deleteMedicarePass(storage, recordsPatientId)` under prefix `brownbag:medicare:` + `idTag(recordsPatientId)`; `passExpired` applies.
- More options, above Sign out: heading "Medicare", a short note ("Adds what Medicare Part D paid for. You sign in on Medicare's own page."), and "Add my Medicare claims" (no pass) or "Remove my Medicare claims" (pass; deletes it and the Medicare source, note "You can also stop sharing at Medicare.gov.").
- Add: `makePkce`, random `state`; keep `{ verifier, state, redirect }` in `sessionStorage` under `brownbag:medicare-pending`; `location.assign(authorizeUrl(...))`.
- `medicare.html`: same head as `index.html`; `js/medicare-return.js` checks `state` against the pending item (Review Focus 3: missing, wrong, or `error` param → "Medicare wasn't connected." and a "Back to my list" link; nothing swapped), unlocks with the lock screen, POSTs to the token server, saves the pass with `medicarePassFrom`, clears the pending item, `location.replace("./")`.

- [ ] **Step 1: Write the failing tests**: pass.test "Medicare pass saves, loads and deletes per records patient"; headless checks with Fetch interception of the token server and Blue Button: the button opens the v3 authorize address with S256; coming back with the right state swaps and saves; wrong state, missing state and `error=access_denied` each show "Medicare wasn't connected." and make no token request; Remove deletes it; Sign out deletes it.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite, the headless checks, then the real sandbox once**: sign in at Medicare with a CMS test enrollee (BBUser login from CMS's published sandbox users) and confirm a pass is saved. Test right away on both simulators (sign-in change).
- [ ] **Step 5: Commit** and publish: "Connect Medicare from More options".

### Task 7: Medicare fills on the list

**Files:**
- Modify: `js/app.js` (update paths, notes, test-patient section, QR help), `js/share.js` only if needed, `docs/LEARNING.md` (Step 16), `README.md`, `docs/NEEDS-TESTING.md`
- Test: `tests/claims.test.mjs` / `tests/medicare.test.mjs` for any pure helper; headless `drive/medicare.mjs`

**Interfaces:**
- Consumes: `readMedicare`, `needsRenewal`, `samePerson` (Task 4); token server (Task 5); Medicare pass (Task 6); `combineSources`, `splitFromSaved` (Tasks 2 and 3).
- On every update with a Medicare pass (alongside the medicines, own 6-second limit, `CLAIMS_WAIT_MS`): renew through the server when `needsRenewal`; refused → delete the Medicare pass, source stale + "Sign in to Medicare again to update your Medicare fills."; then `readMedicare`. `person` "same" → source `medicare` loaded; "different" → not merged, note "This Medicare account is for someone else."; "unknown" → not merged, the "didn't share" note. Sandbox and not "same" → fills shown in a section "Medicare test patient (not you)" after "Filled, not in your records", not counted, not shared.
- "What's in this code?" adds "Medicare Part D fills" to its insurance line when Medicare is connected.

- [ ] **Step 1: Write the failing tests**: headless with intercepted Blue Button answers: same person → "Aetna and Medicare claims" on a card; different → the note and no Medicare fills on cards; Patient 403 → the "didn't share" note (Review Focus 1); Medicare slow (held) → list updates, no "No fill found", saved fills with "Showing fills from …" (Review Focus 2); renewal 401 → pass deleted, note shown, health-system update still lands (Review Focus 4); sandbox mismatch → the test-patient section, "My medicines (N)" unchanged, QR bundle has no Medicare-only items.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite, the headless checks, `drive/final.mjs full`, then both simulators** against the live site with a CMS test enrollee (test right away: wrong medicines or mixed people).
- [ ] **Step 5: Docs.** LEARNING "Step 16. A second, separate insurer" (confidential clients and why the server only swaps tokens; PKCE; NDC vs RxNorm; v3; the same-person check) with "Practice in the lab" Go Deeper ▸ "Granular scopes". README: Medicare in the features and the "Records and claims" steps. NEEDS-TESTING: Tyler's real-iPhone checks (Medicare sign-in from the Home Screen app; VoiceOver on the new notes).
- [ ] **Step 6: Commit and publish**: "Medicare fills join the list". Then close pull request #1 with a comment that its NDC lookup landed in Task 1 (`gh pr close 1 --comment …`) and delete its branch (Tyler chose this, 2026-11-23).

### Later, separate (Tyler: "hold off but add it to the plan later")

- A second demo patient on the SMART sandbox with the same name and birth date as the chosen Medicare test enrollee, so the demo shows Medicare fills joined with the records. Not built until Tyler says, and only once the SMART team keeps demo patients through the nightly reset.
