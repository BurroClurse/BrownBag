# Brown Bag: one unlock, and a shorter note at the top

Status: approved by the developer, 2026-11-21.

## Why

Opening Brown Bag takes two steps today: unlock Brown Bag (Face ID or PIN),
then "Sign in to update" at the health system. The sign-in only lasts while
the page is open, so every reopen shows the saved copy and asks again. The developer
asked whether the two could be one (2026-11-21). They also found the note at the
top of home takes almost half the screen on their iPhone: the saved-copy line
plus the three-sentence Home Screen instructions.

## Who and what for

The same patients as the one-screen design: someone who may be 90, opening
the app at a check-in desk. One unlock should give them an up-to-date list
and the QR code, with nothing else to read or tap first.

## Goals

- Normal open: one unlock (Face ID or PIN), and the list updates by itself.
  The health system's sign-in page appears only the first time, and again
  when the health system ends Brown Bag's access.
- The note area on home is one short line per note, and the bag keeps most
  of its room.
- The Home Screen tip can be put away for good once it's done.

## Non-goals

- No change to the QR code, the list, additions, stopped marks, the staff
  page, or the lock itself.
- More than one health system (the course has one sandbox).

## Anti-goals

- The pass leaking: it never goes into a backup file, a link or the console,
  and it is never stored unencrypted on the phone. (Claude's call: while
  the page is open, fhirclient keeps its working copy in sessionStorage, as
  it already does with today's sign-in. The browser erases sessionStorage
  when the page closes. The pass saved between visits is always the
  encrypted copy.)
- An old list looking current. If an update fails, the date of the list
  still shows.
- A failed update that blocks the app. The saved list and the QR code always
  work, with or without signal.

## Approaches considered

### One unlock

1. **Stay signed in with a long-lasting pass (chosen by the developer,
   2026-11-21).** SMART's `offline_access` permission makes the health
   system hand Brown Bag a refresh token, a long-lasting pass it can trade for
   fresh access without the sign-in page. Brown Bag keeps the pass inside its
   locked storage, so only an unlock can use it.
2. Drop Brown Bag's own lock and keep only the health system's sign-in. The
   saved list would sit on the phone unprotected. Dropped.
3. Keep two steps. Dropped.

**Checked 2026-11-21 with a test sign-in** against the sandbox (patient
e7de504a): asking for `offline_access` returns a `refresh_token` to Brown
Bag's public client (no secret, PKCE). A client rebuilt from the saved state,
as after a reopen, refreshed and then read the Patient record. Access tokens
last 3600 seconds. The refresh token stayed the same after a refresh in that
test; the build still saves a new one if the server sends it.

### The note at the top

1. **One short line per note; the Home Screen steps behind a "How?" button
   (chosen by the developer, 2026-11-21), plus a way to hide the tip for good once
   it's done (the developer, same day).**
2. Move the Home Screen tip to More options only. Dropped.
3. Show one note at a time. Dropped.

## How it works

### Signing in the first time

- `launch.html` adds `offline_access` to the scopes it asks for.
- After sign-in, Brown Bag saves the pass: the server address, client id,
  token address, refresh token and patient id, encrypted with the same key
  and method as the saved list (AES-GCM, `js/vault.js`), under a
  `brownbag:` storage name so Start over erases it.
- One pass per patient, stored next to that patient's saved list (same
  hashed patient id). Opening the app updates the patient whose list opens,
  the last one used, as today. (Claude's call: a caregiver with two patients
  keeps both passes.)
- If the health system doesn't send a refresh token (a server that doesn't
  offer it, or the patient unticks it), Brown Bag works as it does today.

### Every open after that

```
Unlock (Face ID or PIN)
   │
   ├─ saved pass, and signal ─▶ home shows the saved list at once with
   │                            "Updating your list…" in the note area,
   │                            then the new list replaces it
   ├─ saved pass, no signal ──▶ saved list + "No connection. List from Nov 21."
   └─ no pass ────────────────▶ as today: sign in (or the saved list with
                                "Sign in to update")
```

- Updating uses the pass to get fresh access, then loads the records the
  same way a fresh sign-in does. If the server sends a new refresh token, it
  replaces the old one.
- **The health system ended the pass** (the token server refuses it): the
  pass is deleted, the saved list stays, and the note reads "Sign in again
  to update your list." with a Sign in button. After that sign-in, a new
  pass is saved.
- **Signal drops or the server is slow:** the pass is kept, the saved list
  stays, and the note shows the list's date. The update gives up after the
  same 8 seconds the drug lookups use.

### Signing out, starting over, backups

- **Sign out** deletes the pass. Its text becomes "Signing out disconnects
  Brown Bag from your records. Your saved list stays on this phone. You'll
  sign in again next time."
- **Start over** erases it with everything else.
- **Backup files never contain the pass.** A list restored into the Home
  Screen app signs in once there.

### The note area

Each note is one short line. Buttons sit on the same line when they fit.

| When | Note | Buttons |
|---|---|---|
| Updating | Updating your list… | none |
| No signal | No connection. List from Nov 21. | none |
| Pass ended or never saved, with signal | List from Nov 21. Sign in again to update it. | Sign in |
| A source failed | Some records didn't load. | none |
| Home Screen tip | Add Brown Bag to your Home Screen. | How?, Not now |

- **How?** opens a short screen like More options: a big Done at the top, the
  numbered steps for this phone (iPhone: More options ▸ Save a backup; Share
  ▸ Add to Home Screen; open it and Restore from a backup. Android: browser
  menu ▸ Install), and at the bottom a big **"I've done this"** button that
  hides the tip for good.
- **Not now** hides it for 30 days, as today.
- The tip never shows inside the Home Screen app (as today). On Android,
  Chrome's "installed" signal also hides it for good.
- More options gets an "Add to Home Screen" button that opens the same
  steps, so they can still be found after the tip is hidden. It isn't shown
  inside the Home Screen app.

## Constraints

- WCAG 2.2 AA, as before. Notes are a live status area, so "Updating your
  list…" and its result are read out by VoiceOver.
- Static site, no new libraries; fhirclient 3.0.1 already supports refresh.
- Home at 375 by 667 with two notes showing: no scrolling at default text
  size, and the bag keeps at least a third of the screen height.

## Depends on a phone check

The developer's pending check "does sign-in stay inside the Home Screen app?"
decides one case. If sign-in started from the Home Screen app finishes in
Safari instead, the pass is saved in Safari's storage, which the Home Screen
app can't read. The Home Screen app then keeps working as today (saved list
plus "Sign in again"). The build doesn't wait on this; a fix, if one is
needed, is a follow-up.

## Left to the builder

- How the saved pass is turned back into a working client (the test rebuilt
  it from fhirclient's saved state and called `refresh()`).
- Exact wording of the How? steps, within the table above.
- Whether "Updating your list…" also shows on the QR screen if it's opened
  mid-update (the QR uses whatever list is current when it opens).

## Calls made by Claude, for the developer to check

- The pass is kept with either lock, Face ID or PIN. The developer chose this
  on 2026-11-21, knowing a 6-digit PIN can be guessed by someone who copies
  the phone's Brown Bag data to a computer.
- On open with a saved pass and signal, home shows the saved list at once
  and updates in place, rather than a loading screen, so the QR code is never
  more than one tap away.
- Backup files leave the pass out.

## Changed 2026-11-23 (the developer: sign out of everyone, like a real app)

- Sign out deletes every pass on the phone, then asks each health system that
  offers revocation (RFC 7009, same server only) to end its side, within 3 s.
- The next open says "You're signed out", with Sign in and Open my saved list
  (still behind the lock). Signing in ends it.
- A rotated refresh token that arrives after the wait is kept. A sign-in with
  no token address gives no pass.

## Changed 2026-11-24 (the developer: Open my saved list only with no signal)

- "You're signed out" has only Sign in when there's a connection. With none it
  adds "No connection. You can still open the list saved on this phone." and
  Open my saved list. The screen follows the signal.
- A sign-in that doesn't finish while signed out doesn't open the saved list.
