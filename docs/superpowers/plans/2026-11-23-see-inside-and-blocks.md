# See what's inside, and two blocks: Implementation Plan

**Goal:** The patient can open their own QR code's contents; allergies and
medicines are two clear blocks on every screen that lists them.

**Spec:** docs/superpowers/specs/2026-11-23-see-inside-and-blocks-design.md

Native execution, in one session (approved 2026-11-23).

- [x] 1. `js/allergies.js` `showsSymbol(count, unspecified, notices)`;
  `js/share.js` `shareMedicineCount(groups)` (equal to the home button's
  number). Tests first.
- [x] 2. `js/share-list.js` `drawShareList(parent, groups, level)`: the staff
  page's drawing, moved, with the two blocks. `js/share-view.js` uses it.
- [x] 3. `js/app.js`: the two blocks on My medicines; "See what's inside" on
  the QR screen (`openInside`, `closeInside`, its own history step).
- [x] 4. CSS, `sw.js` (v29), README, LEARNING, NEEDS-TESTING.
- [x] 5. Test browser (axe, 320 px, 200% text), fresh review, virtual iPhone,
  Android or Claude in Chrome, publish, live check.

Review focus: a code that can't be unlocked never shows an empty list; Back,
Escape and the lock from the inside screen; a double tap; the too-long list;
allergies that failed to load, none, only an unnamed entry; an older `v2.` code
on the staff page; the Undo rows and forms inside the blocks.
