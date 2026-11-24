# Privacy page: plan

Spec: `docs/superpowers/specs/2026-11-24-privacy-page-design.md`. Built in one
session (Tyler, 2026-11-24).

- [x] 1. Tests first (`tests/privacy.test.mjs`, `tests/options.test.mjs`): each
  outside address is named on the page; wording that code decides (no cookies,
  no tracking); More options and the sign-in list link to it; `sw.js` keeps it;
  no outside file loads on it.
- [x] 2. `privacy.html`, its styles, the row in `js/options.js` and `js/app.js`,
  the link in `js/launch.js`, `sw.js` cache v53.
- [x] 3. README, LEARNING Step 47, NEEDS-TESTING, LIMITS #9 and #15.
- [ ] 4. Test browser (320 to 1440 wide, 200 percent text, no signal, Back from
  both places, no script), More options and the list still fit. Publish once
  GitHub issues is on, live check.

Review focus: opened from a search result or a shared link (no page to go back
to); Back after the app has locked; no signal; largest text; the row pushes
Sign out off a small screen.
