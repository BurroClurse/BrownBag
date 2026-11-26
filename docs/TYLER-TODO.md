# Tyler needs to do

Things only Tyler can do: cloud sessions can't reach his Mac's virtual phones,
his iPhone, or his accounts. Every Claude session reads this at the start and
reminds Tyler of what's open (see `CLAUDE.md`). When an item is done, move it to
"Done" with the date; when a change needs Tyler, add it here.

## Open

### 1. Mac phone pass for "When sources disagree" (PRs #13 and #14, merged 2026-11-26)

PR #14 was merged before this pass, by Tyler's choice. The pass checks
everything under "Waiting for the next pass" in
[`NEEDS-TESTING.md`](NEEDS-TESTING.md) on the Android emulator (with TalkBack)
and the iPhone 15 simulator: the review cards, the staff code box at large
text, Back after signing out, the staff tab keeping the locked list, Back and
Forward between patients, birth dates, "Last filled over a year ago.", every
source named on a card, the privacy page and the app cache, and the final
review's fixes.

In Terminal on the Mac:

```bash
cd '/Users/tylerbeattie/Developer 2/HL7-Build-the-Code/BrownBag'
git checkout main
git pull
git checkout -b phone-pass-2026-11
claude
```

Then give Claude this prompt:

```
Run the phone test pass in prompts/phone-pass.md.
```

It runs the tests, puts Riley Reconcile and Jordan Partial back on the sandbox,
starts the home server with the test clinic, checks each item on both phones,
records the results in `NEEDS-TESTING.md` and pushes the `phone-pass-2026-11`
branch (never `main`). Afterwards, paste its report into a Claude session:
that session fixes anything that failed and opens a pull request with the
results.

### 2. Checks on Tyler's iPhone (live site: https://burroclurse.github.io/BrownBag/)

Listed under "On a real iPhone (Tyler)" in [`NEEDS-TESTING.md`](NEEDS-TESTING.md).
All can be done on the live site now that PR #14 is merged:

- **Face ID and the Home Screen app:** add Brown Bag to the Home Screen, set
  up Face ID, and unlock with it from the icon.
- **Quit Safari with a staff tab open:** open Chantell Bartell's QR link, type
  the code, swipe Safari away in the app switcher, open it again. The tab shows
  the 6-digit code box, never "This link has no list in it."
- **Reopen a closed staff tab:** close the staff tab, reopen it from Safari's
  recently closed tabs (hold the + button). It shows the code box (or "no
  list"), never the list unlocked.
- **Scan Riley's QR code with a camera:** records that disagree. Riley's
  records only disagree with the test clinic, which only the Mac's home server
  has, so do this during the phone pass and ask that session to show the code
  and check that your iPhone can open its link.
- **Save as FHIR file on a second phone:** the real share sheet, only the
  .json file, the popup starting on Cancel.
- **Airplane mode off with a saved list open:** signed in, it updates by
  itself; signed out, "Sign in again to update it."

### 3. Waiting on others

- **Medicare's approval** for the Blue Button API (Medicare Part D fills). The
  design is done: [`superpowers/specs/2026-11-22-medicare-blue-button-design.md`](superpowers/specs/2026-11-22-medicare-blue-button-design.md).

## Done

- 2026-11-25: first Mac phone pass for PR #13 (four findings, two fixed in
  PR #14, two in LIMITS #27 and #28).
- 2026-11-25: Chantell's QR code read by a real iPhone camera on the live site.
- 2026-11-25: the Colab matching check (`BrownBagMatch.ipynb`) ran on 300
  patients: no wrong joins.
