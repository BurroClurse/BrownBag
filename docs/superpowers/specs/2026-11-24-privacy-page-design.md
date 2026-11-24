# Privacy page: design

Approved by Tyler 2026-11-24. A small change.

## Why

Reviewers (Epic, CMS) ask for a public privacy policy, and LIMITS #9 said Brown
Bag had none. The 2026 HIPAA final rule says a personal health app's developer
isn't a business associate, so the page says plainly what protects the patient
and what doesn't.

## What

- `privacy.html`: one public page, no sign-in, no script needed, works with no
  signal. Its wording is the draft Tyler approved.
- A **Privacy** row on More options, and a small **Privacy** link under the
  sign-in list. Back goes to where they were, and may ask them to unlock.
- Questions go to GitHub issues for now. **Later (Tyler): an email address he
  chooses**, before real patients. A lawyer reads the page before then too.
- Not in it: no change to what Brown Bag stores or sends, no consent box.

## Approaches

1. Its own page (picked): reviewers need a web address.
2. A screen inside the app: no address to give, and it's behind the lock.
3. A file on GitHub: doesn't look like Brown Bag.

## Settled while building (Claude's calls)

- The page has no script except Back's. With no script, Back opens Brown Bag.
- A test lists every outside address in the code. A new one fails until the
  page names it, so the page can't quietly go out of date.
