# Brown Bag: Medicare fills through Blue Button 2.0

Status: draft, 2026-11-22. Builder check pending, then Tyler.

## Why

Tyler (2026-11-21): showing what was actually filled is "an incredibly
important aspect of what Brown Bag should show", and "the focus here is
interoperability and combining resources/APIs in order to get the best
picture." The first insurer source (pharmacy claims from the SMART
sandbox, `js/claims.js`) is live. Medicare's Blue Button 2.0 is a truly
separate API, run by CMS, with its own sign-in: the second source.
Tyler chose "both" (sandbox claims, then Blue Button) and asked that it
can be used with real patients, not only as a demo (2026-11-22).

## Who and what for

The patient, and the person checking their medicines through the QR
code. With Medicare fills added, each medicine says whether Medicare
Part D paid for it, and fills from outside the health system show up.

## Goals

- An "Add my Medicare claims" button on the More screen signs the
  patient in at Medicare and brings their Part D fills into the list.
- Medicare fills join each card's fill line with the other insurers
  ("Filled 3 times · last Oct 3, 2026 · Aetna and Medicare claims"),
  become "Filled, not in your records" items when nothing matches, and
  go into the QR code's notes, exactly like the sandbox claims.
- Built so real Medicare patients can use it once CMS approves the app
  (production access), with no change to the design.

## Non-goals

- CMS production approval itself (privacy policy, terms, demo video,
  request form). Built and tested on Medicare's test data only.
- Other insurers. Tyler's growth path (2026-11-22): Medicare directly
  now, a connection service (Flexpa or similar) for other insurers later.
  This design must not get in its way: each insurer is its own source.
- Medicare Advantage plans (their own APIs), Parts A and B claims,
  costs, CMS Aligned Networks.

## Anti-goals

- One person's medicines on another person's list or QR code (see
  "Same person").
- Claims or medicines on Brown Bag's server. The server only swaps and
  renews Medicare's passes.
- An open relay: a server anyone could use with Brown Bag's secret.
- Medicare trouble holding up the list. It has its own time limit and
  its own notes.
- "Not filled" wording. As now: "No fill found in your claims".

## Approaches

Server host (Tyler, 2026-11-22: "option 1 for now"):

1. **A Netlify function (chosen).** Free plan, code and tests in the
   Brown Bag repo, the app keeps burroclurse.github.io/BrownBag.
2. A Cloudflare Worker. Equally able, needs a new account.
3. The whole app on Netlify. Changes the live address and the course
   sign-in settings. Dropped.

Growth (Tyler, 2026-11-22): 3, Medicare directly now, a connection
service for other insurers later; both use this same small server.

## Facts this rests on (checked 2026-11-21)

- Blue Button accepts confidential clients only: authorization code
  with PKCE (S256), and the client secret is sent at `/token`
  (HTTP basic). The secret can't be in a web page, so a server sends it.
- Its FHIR API answers browsers (CORS `*`, `authorization` header
  allowed; checked on sandbox.bluebutton.cms.gov). So the phone reads
  claims directly with the access token; the server never sees them.
- Part D fills are ExplanationOfBenefit records of type PDE. The drug
  is an NDC (package) code, `http://hl7.org/fhir/sid/ndc`, not RxNorm.
  CMS warns many test claims have made-up NDCs.
- Medicare's test people are not the SMART sandbox's people.
- Real patients need CMS production access: privacy policy, terms, demo
  video, request form; keys work only for the reviewed app.

## How it works

### The small server (`server/`, a Netlify function)

- Two routes: swap a sign-in code (with the PKCE verifier and redirect
  address) for a pass, and renew a pass with its refresh token. Each
  forwards to Blue Button's token address only, adding the client id and
  secret, and returns Blue Button's answer as it came.
- Answers only Brown Bag's own addresses (the live site and the home
  test server), refuses anything else, and never stores or logs a
  request or a pass.
- The client id and secret live in Netlify's settings, never in git.
  Sandbox and production are separate settings.

### Signing in to Medicare

- More screen: "Add my Medicare claims". Brown Bag makes the PKCE pair
  and a random state, keeps them in the tab's session storage, and opens
  Medicare's sign-in page asking for `patient/Patient.read`,
  `patient/ExplanationOfBenefit.read` and `profile`.
- Medicare sends the patient back to a page of its own,
  `medicare.html` (Claude's call: `index.html` already treats `code` and
  `state` as the health-system sign-in). It checks the state, asks the
  server to swap the code, saves the pass, and returns to the list.
- The pass (access and refresh token, expiry, Medicare patient id) is
  encrypted on the phone with the same lock as the health-system pass,
  per records patient. Sign out removes it too.
- "Remove my Medicare claims" on More deletes the pass and the Medicare
  fills. It says Medicare.gov can also stop the sharing.

### Same person (Tyler, 2026-11-21: option 1)

- After sign-in and on each update, Brown Bag reads the Medicare
  `Patient` and compares family name, first given name and birth date
  with the health-record patient (case and spacing ignored).
- Different: the fills are not added, and My medicines says "This
  Medicare account is for someone else." The pass is kept so the
  patient can see why, and Remove clears it.
- Medicare's test data only (the sandbox address): the fills show
  anyway, in their own section "Medicare test patient (not you)". They
  aren't matched to the patient's medicines, aren't counted in "My
  medicines (N)", and never go in the QR code.
- Medicare didn't share the name or birth date (patients can decline
  that when they agree): treated as different, with "Medicare didn't
  share your name and birth date, so Brown Bag can't check this is you.
  Remove Medicare and add it again, and allow it." (Claude's call,
  following Tyler's safety choice.)

### Reading the fills

- On each update with a Medicare pass, alongside the medicines and the
  sandbox claims (the same `readClaims` paging with its own 6-second
  limit): `GET ExplanationOfBenefit?patient={id}&type=PDE` on Blue
  Button, every page, with the access token. A pass near expiry is
  renewed through the server first.
- Each fill's NDC goes to RxNav for its RxNorm code
  (`rxcui.json?idtype=NDC`), then its ingredients, so matching is the
  same as for the sandbox claims. An NDC RxNav doesn't know keeps the
  claim's drug name and can only become a "Filled, not in your records"
  item.
- The insurer label is "Medicare" for every Blue Button fill.
- Fills from both sources go through the same matching together, so a
  card counts all of them.

### When something goes wrong

Each is a note at the top of From your records, and the rest of the
list updates as usual:

- Pass renewal refused or expired: "Sign in to Medicare again to update
  your Medicare fills." The saved Medicare fills stay.
- Slow or broken: "Your Medicare fills couldn't be loaded." No Medicare
  fill lines that update.
- Server unreachable: the same as slow.

### Two sources, one fails (Claude's call, after the builder check)

- Each claims source keeps its own status ("loaded", "refused",
  "failed", "none") and its own raw fills, saved encrypted with the
  records copy, and the fills are matched to the list again on every
  update.
- A source that fails this time uses its last saved fills, and its note
  says when they are from: "Your Medicare fills couldn't be updated.
  Showing fills from Nov 20." With no saved fills, that source adds
  nothing.
- "No fill found in your claims" (and "No fill found in claims" in the
  QR code) only shows when every connected source loaded or has saved
  fills. Otherwise a card with no fill shows no fill line.

### The Medicare pass follows the health-system pass's rules (Claude's call)

- It is deleted after 30 days unused, like the health-system pass.
- It stays when the health system asks the patient to sign in again
  (same records patient), and goes on Sign out or Remove.
- Coming back from Medicare's sign-in reloads the page, so the patient
  unlocks with Face ID or the PIN once more before the pass is saved.

### Offline and the QR code

- Medicare fills are saved with the records copy (encrypted) and show
  offline. The offline-changes alert is unchanged.
- QR notes: as now ("Last filled 2026-10-03 (Aetna and Medicare
  claims), 3 fills"); "What's in this code?" names Medicare when it is
  connected.

## Test data and accounts

- Tyler makes the CMS Blue Button developer account and registers the
  app (confidential, authorization code), with redirect addresses for
  the live site and the home test server. He puts the client id and
  secret in Netlify's settings himself.
- Medicare's sandbox has synthetic enrollees with test logins. The
  builder picks one whose Part D fills include drugs that RxNav knows,
  and may add matching prescriptions to a second demo patient on the
  SMART sandbox so the test-patient section has something to compare.

## Constraints

- Static site plus one small function; no new libraries in the app.
- WCAG 2.2 AA; home stays one screen; QR within its version 40-M budget.
- The server code has its own tests run by `node --test`.
- Production-ready shape: nothing in the design depends on sandbox
  except the test-patient exception, keyed on the sandbox address.

## Left to the builder

- Module names, and how the second source plugs into `readClaims` and
  `mergeClaims`.
- When "near expiry" is.
- How the server tells the live site from the home test server.

## Calls made by Claude, for Tyler to check

- A separate return page, `medicare.html`.
- A declined name and birth date counts as a different person.
- The pass is kept after a mismatch, so the note can explain it.
- Test-patient fills are not counted in "My medicines (N)".
- The insurer label is "Medicare".
