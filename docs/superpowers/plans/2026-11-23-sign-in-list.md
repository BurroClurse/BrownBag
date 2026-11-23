# Sign-in list Implementation Plan

**Goal:** Tapping Sign in opens a list of sources; only the SMART sandbox works.

**Spec:** docs/superpowers/specs/2026-11-23-sign-in-list-design.md

Native execution, in one session (small change, approved 2026-11-23).

- [x] 1. `js/sources.js`: SOURCES (id, name, kind, connected), `startFor(search)`
  ("sign-in" for any iss or a connected source, else "list"), `notConnected()`
  groups, `signInLink()`, TRADEMARKS. Tests in `tests/sources.test.mjs`.
- [x] 2. `launch.html` keeps `startSignIn()` (fhirclient); `js/launch.js` draws
  the list, starts sign-in, says what to do when it can't start, and shows the
  list again on Back from the sandbox. Missing file: the same "didn't arrive"
  words as the app.
- [x] 3. `js/app.js`: the two Sign in links after the lock go straight to the
  sandbox. `sw.js` keeps the new files; cache v28.
- [ ] 4. README, LEARNING Step, NEEDS-TESTING. Test browser (axe, 320 px, 200%
  text), fresh review, both virtual phones, publish, live check.

Review focus: an unknown or odd `source` never signs in; the README's `iss`
links still go straight; Back from the sandbox never loops; no signal; a file
that doesn't arrive.
