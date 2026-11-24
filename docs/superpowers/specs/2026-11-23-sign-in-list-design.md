# Sign-in list: short design

Status: approved by Tyler, 2026-11-23. Aetna is left out; he may add it later
("It would be a good resource"), once its terms are settled.

## Why

Tyler, 2026-11-23: an app like this normally lets you choose where your
records are. The SMART sandbox keeps working; the sources he wants to add
later show too, greyed out, and none of them works.

## Approaches

- **A. Tapping Sign in opens the list (Tyler's choice).** Where people expect
  it. One more tap on the first sign-in.
- B. A Connections screen under More options. Out of the way, but only seen
  after signing in.
- C. Both. More to keep up, for one working source.

## What they see

```text
Choose where your records are

[ SMART Health IT sandbox ]
  Test patients only

Not connected
  Brown Bag isn't connected to these. It may add them later.
  Health systems
    Epic®
    Oracle® Health
    MEDITECH
  Insurance
    Medicare
    Medicaid

[ Back ]

Epic is a trademark of Epic Systems Corporation. Oracle is a registered
trademark of Oracle and/or its affiliates. Other names may be trademarks of
their respective owners. Brown Bag isn't affiliated with or endorsed by any
of them, or by any government agency.
```

- The sandbox is the only button. The others are grey text, not buttons and
  not links: a tap does nothing, and VoiceOver reads the heading first, then
  each name. The grey keeps 4.5 to 1 contrast. No logos or brand colors.
- "Not connected", not "Planned": Medicare and Medicaid names may not give
  the impression of a connection (42 U.S.C. 1320b-10), and a disclaimer
  doesn't undo one. The sentence under it says they may come later.

## When it shows

- `launch.html` opened plain (every Sign in button, and the live link).
- Not shown, straight to sign-in as today: `launch.html?iss=…` (the README's
  test patient links and the SMART Launcher), and the two Sign in buttons
  shown after Face ID when a sign-in has expired or allergies were refused.
  Those go to `launch.html?source=smart-sandbox`.
- Any other `source` shows the list; it never signs in to an unknown one.
- Back goes to Brown Bag. With no signal, the list shows and choosing the
  sandbox says what to do.

## Left to the builder

- The list is data in one file (`js/sources.js`: id, name, kind, connected),
  so a source is turned on by changing one entry.
- Tests first: which addresses show the list, which go straight, only
  connected ones are buttons, names and notices exact.
- README, LEARNING, both virtual phones before publishing (it touches
  sign-in).

## Not in this

Signing in to more than one place, remembering a choice, and search: they come
with the second working source.

## Naming rules read 2026-11-23

No owner says anything about "planned" lists. Not legal advice.

- Epic: plain naming allowed, no logo, no implied endorsement, written
  "Epic", credited. `epic.com/epic/page/trademark-usage-guidelines-non-licensee/`
- Oracle: naming its products allowed, credit line asked, no implied
  endorsement (from search results; the page refused a direct read).
  `oracle.com/legal/trademarks/`. No rule found on "formerly Cerner", so left
  out.
- MEDITECH: no naming page; API terms bar suggesting a partnership.
- Medicare: CMS asks apps to list it as "Medicare".
  `bluebutton.cms.gov/production-access/`. The Blue Button notice goes in
  only once its API is used.
- Medicaid: same law; run by states.
- Aetna (left out for now): CVS Health's terms ask for written permission to use its marks, and
  no allowance for plain naming was found. `cvshealth.com/terms-of-use.html`

## Changed 2026-11-23 (Tyler)

- Signed in, the list is also under More options, "Where my records come from",
  with the dates and Update now.
- The names sit in one card. The trademark words open under "About these names".
