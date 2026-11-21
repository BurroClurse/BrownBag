# One-Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Brown Bag's long scrolling main screen with one screen built around the logo, a QR code that swooshes out of the bag, and a separate "My medicines" screen.

**Architecture:** `js/app.js` keeps its data flow (lock, sign-in, load, save) and gains a `state.screen` of `"home" | "medicines" | "more"` plus a QR overlay. Section drawing moves into `drawMedicines`. The swoosh is CSS keyframes; the overlay's start point is the bag's on-screen box. Pure helpers stay in `js/view.js` with Node tests.

**Tech Stack:** Plain HTML, CSS and ES modules; no new libraries. Node `node --test`. Headless Chrome scripts for screen checks.

**Spec:** `docs/superpowers/specs/2026-11-21-one-screen-design.md` (approved 2026-11-21). Earlier design: `docs/superpowers/specs/2026-11-17-brown-bag-design.md`.

## Global Constraints

- Work on `brown-bag-v1`; push after each commit; never touch `main`.
- WCAG 2.2 AA: contrast 4.5 to 1, 44 by 44 point targets, visible focus, labels on every control, works at the largest text size (scrolling allowed there, never cut off), respects Reduce Motion.
- Disclaimer copy, exact: "This list is what you and your records say. Your care team confirms it."
- All record and patient text via `textContent`.
- QR code always black on white with a 4-module margin.
- Main screen: no scrolling at 390 by 844 and 375 by 667 at default text size.
- Buttons: at least 56 px tall on the main screen, font at least 1.25rem.
- Commit messages: one short line in Tyler's voice, no dashes, plus the attribution lines.
- Tests: `node --test "tests/*.test.mjs"` from `BrownBag/`.

## Review Focus

- A patient with no medicines and no additions: home reads "My medicines (0)" and Show my QR code still works. Test in Task 1 and headless check in Task 5.
- A short phone (375 by 667) with a notice bar showing: nothing cut off; logo shrinks before buttons. Headless check in Task 5.
- Reduce Motion on: the QR overlay fades, no movement. Headless check in Task 3.
- Keyboard and VoiceOver: opening the QR moves focus to Close; Escape and Close return focus to "Show my QR code". Headless check in Task 3.
- Changing the list on "My medicines" then going Done: the home count updates and the next QR uses the new list. Headless check in Task 5.

---

### Task 1: Home helpers

**Files:**
- Modify: `js/view.js`, `tests/view.test.mjs`

**Interfaces:**
- Produces: `medicineCount(arranged, additions) -> number` (current records not marked stopped, plus additions); `medicinesButtonText(count) -> string` ("My medicines (8)"); `noticesFor({ savedAt, online, failed, installHint }) -> string[]` in display order: saved-copy notice (`savedNotice`), then "Some of your records couldn't be loaded.", then the install hint.

- [ ] **Step 1: Failing tests** in `tests/view.test.mjs`: `medicineCount` with 2 current, 1 stopped, 3 additions → 5; with nothing → 0. `medicinesButtonText(0)` → "My medicines (0)". `noticesFor` with all three → three strings in that order; with none → `[]`.
- [ ] **Step 2: Run** `node --test "tests/*.test.mjs"`. Expected: fails, exports missing.
- [ ] **Step 3: Implement** in `js/view.js` (import `savedNotice` from `./offline.js`).
- [ ] **Step 4: Run.** Expected: all pass.
- [ ] **Step 5: Commit** "Add the counts and notices for the home screen".

### Task 2: Home, My medicines and More options screens

**Files:**
- Modify: `js/app.js`, `css/brownbag.css`, `index.html` (no structural change beyond the `<main id="app">`)

**Interfaces:**
- Consumes: Task 1 helpers; existing `drawRecords`, `drawAdditions`, `drawStopped`, `drawBackup`.
- Produces: `state.screen` and `go(screen, focusId)`; `drawHome()`, `drawMedicines()`, `drawMore()`; home button ids `show-qr`, `open-medicines`, `open-more`; bag image id `home-bag`.

- [ ] **Step 1: Restructure `render()`** to draw one screen by `state.screen`:
  - `home`: notices bar (from `noticesFor`), patient name as `h1`, `<img id="home-bag" src="icons/logo.png" alt="Brown Bag">` wrapped in a `<button>` with `aria-label="Show my QR code"`, primary button "Show my QR code", secondary button from `medicinesButtonText`, disclaimer, text-style button "More options".
  - `medicines`: big "Done" button at top (returns to home, focus `open-medicines`), `h1` "My medicines", then the existing records, additions (with add form) and stopped sections.
  - `more`: "Done", `h1` "More options", Save a backup, Restore a backup, Sign out as big buttons.
- [ ] **Step 2: CSS** for `.home`: full-height column (`min-height: 100dvh`), logo `flex: 1 1 auto; max-height: 46dvh; object-fit: contain`, buttons full width, 56 px min height, 1.25rem font. Primary is dark teal `#164F5A` on white text; secondary outlined. Notice bar at top.
- [ ] **Step 3: Verify** existing tests still pass: `node --test "tests/*.test.mjs"`.
- [ ] **Step 4: Commit** "Put the list on its own screen and center home on the bag".

### Task 3: The QR overlay and swoosh

**Files:**
- Modify: `js/app.js`, `css/brownbag.css`

**Interfaces:**
- Consumes: `showQr` packing (unchanged), `qrCanvas`, `home-bag` box.
- Produces: `openQr()`, `closeQr()`; overlay `#qr-overlay` with `role="dialog"`, `aria-modal="true"`, `aria-labelledby` its heading.

- [ ] **Step 1:** Overlay content in order: heading "Show this to the person checking you in", the QR canvas sized to `min(88vw, 52dvh)`, "Read this code out loud:", the 6 digits (`.share-code`), big "Close" button. Too-long variant: the message plus "Show my medicines instead".
- [ ] **Step 2: Swoosh:** set CSS variables `--from-x`, `--from-y`, `--from-scale` from the bag's box, play `@keyframes qr-in` (about 450 ms, ease-out) from the bag's middle at small scale to full screen; Close plays it in reverse, then removes the overlay. Under `prefers-reduced-motion: reduce`, a 150 ms opacity fade only.
- [ ] **Step 3: Focus:** focus Close on open; Escape closes; focus returns to `show-qr`.
- [ ] **Step 4: Headless check:** open, see canvas and digits, Escape closes and `document.activeElement.id === "show-qr"`; with `Emulation.setEmulatedMedia` reduced motion, the overlay's computed `animation-name` is the fade.
- [ ] **Step 5: Commit** "Swoosh the QR code out of the bag".

### Task 4: Lock, signed-out, loading and staff page

**Files:**
- Modify: `js/lock-screen.js`, `js/app.js` (`drawSignedOut`, `drawLoading`, `drawNoConnection`), `js/share-view.js`, `css/brownbag.css`

- [ ] **Step 1:** Each of those screens shows `icons/logo.png` centered above its heading (decorative there: `alt=""`), buttons full width and 56 px.
- [ ] **Step 2:** `share.html` shows the logo small at the top of both its states.
- [ ] **Step 3: Verify** `node --test "tests/*.test.mjs"` passes.
- [ ] **Step 4: Commit** "Use the bag on every screen".

### Task 5: Fit, accessibility and learning log

**Files:**
- Modify: `docs/LEARNING.md`, any of the above the checks point to

- [ ] **Step 1: Headless fit check** at 390 by 844 and 375 by 667, signed in, with and without the offline notice: `document.documentElement.scrollHeight <= innerHeight` on home.
- [ ] **Step 2: Headless flow check:** patient with no medicines shows "My medicines (0)" and the QR opens; on My medicines mark one stopped, Done, count drops by one, QR still opens.
- [ ] **Step 3: axe** on home, medicines, more, QR overlay, lock, staff page: no serious or critical issues, light and dark.
- [ ] **Step 4:** Learning log section "Step 12. One screen around the bag" with a Practice in the lab link.
- [ ] **Step 5: Commit** "Check the one screen fits and reads well".
