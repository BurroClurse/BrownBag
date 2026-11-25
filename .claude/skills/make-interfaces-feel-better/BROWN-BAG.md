# Brown Bag's rules win

Read this before applying anything in this skill to Brown Bag.

This skill is copied from <https://github.com/jakubkrehel/make-interfaces-feel-better>
(MIT, `LICENSE` here), commit `6d9f2f1`, 2026-11-17. The only change to it is
the line at the top of `SKILL.md` pointing here. Tyler chose to add it on
2026-11-25.

Brown Bag is for patients who may be 90, often using it at a check-in desk.
It's built to WCAG 2.2 AA with large text, strong contrast and big buttons.
Where this skill and those needs disagree, the needs win.

## Don't apply these here

- **Shadows instead of borders (principle 3).** Keep the borders. They give
  shapes the edge contrast that low-vision users need, and soft shadows
  fade on a bright screen or with glare. Only use a shadow on something
  that floats over the page, like the update note or the QR overlay.
- **Font smoothing (principle 8).** Don't add `-webkit-font-smoothing:
  antialiased`. It makes text thinner, and readable text matters more here.
- **Decorative motion (principles 5, 6, 7 and 12).** Don't add staggered
  entrances, icon swap animations or press scaling. Brown Bag keeps motion
  to what tells the patient something, like the update note fading. Every
  animation must stop under `prefers-reduced-motion`, which `brownbag.css`
  already does for the whole page.
- **Thin icon strokes (principle 17).** Don't thin an icon to match the text
  beside it. Brown Bag's text is bold, and its icons, like the allergy
  warning, stay heavy so they read at a glance.

## Already the same here

- **Tap targets of at least 44×44px (principle 16).** Never shrink one.
- **Plain CSS with variables on `:root` in `css/brownbag.css`.** Use them,
  and don't add a styling library.
- **No `transition: all` (principle 14).**

## Before calling something polished

- Check it at 200% text size, and at 390px wide as on an iPhone.
- Change the service worker's cache version (`CACHE` in `sw.js`) whenever
  CSS or JS changes, so phones get the new files.
