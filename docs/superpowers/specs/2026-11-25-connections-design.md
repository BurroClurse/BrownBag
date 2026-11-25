# Brown Bag: lock first, then a connections screen

Status: Tyler handed the remaining choices to Claude, 2026-11-25 ("I'll let
you choose the best options until this is complete, just tell me at the end
what you chose and why"). Built 2026-11-25, plan
`docs/superpowers/plans/2026-11-25-connections.md`.

## Why

Tyler, 2026-11-25: there will be many places a patient's records come from
(health systems, pharmacies, insurers). "The person will need to sign in to
the app account first, then be directed to the sign in for their
provider/pharmacy/insurance company, which shouldn't go straight home after
signing in to one, it should stay on the connections screen so the patient
should finish connecting to others." The same screen is reached later from
More options → Health records.

"App account" means the phone lock (Face ID, fingerprint or 6-digit PIN).
No server (Tyler, 2026-11-25: "I don't want a server right now").

## Who and what for

The same patients as before: someone who may be 90, setting Brown Bag up
once, then opening it at a check-in desk. Setting up should feel like one
guided path: lock, connect what you have, done. Everyday opens stay one
unlock, straight to home.

## Goals

- First run: set up the lock first, then the connections screen.
- After a sign-in at any connection, the patient comes back to the
  connections screen (after unlocking), sees it connected, and can connect
  the next one. "Done" goes home.
- More options → Health records is the same screen and behaves the same way.
- Everyday opens: one unlock, straight to home, and the update checks every
  connection.
- Ready for a second working source (Medicare Blue Button, designed
  2026-11-22) to be turned on by adding it to the list, with no change to
  this flow.

## Non-goals

- Building any new source. Only the SMART sandbox works today; the others
  stay greyed out under "Not connected" as now.
- A server, an account with email and password, or syncing between phones.
- Combining medicine lists from two health systems into one. That comes with
  the second working source and gets its own design.

## Anti-goals

- Weakening the lock to save a Face ID. The key never outlives the page.
- Getting stuck: a patient who leaves mid-setup (closes the app, cancels a
  sign-in, loses signal) can always pick up where they left off.
- A home screen with nothing on it. Home only shows once at least one
  connection has loaded.

## How many connections now (Claude's call, 2026-11-25)

**One connection now, ready for more.** The new order (lock, connections
screen, back to it after each sign-in, Done) is built in full, and the screen
lists sources the way it will with several. Storage stays one connection:
`state.patientId`, one pass. Signing in to the sandbox as another test patient
replaces the connection, as today. Why: only the sandbox works, so storage for
several connections would have nothing real to test against, and what home
shows with two lists is undecided. The storage change comes with Medicare.

## Constraints found in the code

- The lock's key lives only in the open page's memory and can't be copied
  out (a non-extractable WebCrypto key). Leaving for a sign-in page drops it,
  so every return from a sign-in needs an unlock. That's already true for
  "Sign in again" today.
- Today the first screen with nothing saved is "Sign in", and the lock is
  set up when the sign-in comes back (`start()` in `js/app.js`).
- The app keeps one connection's records at a time (`state.patientId`, one
  pass per patient in `js/pass.js`). The sandbox opens "Choose a test
  patient" first (`js/launch.js`, `js/test-patients.js`).

## Approaches

- **A. Lock first, then unlock again after each sign-in (Tyler's choice,
  2026-11-25).** One quick Face ID per connection. The lock is as strong as
  today, and it's the least new code.
- B. Sign-in in a pop-up window so Brown Bag stays open and unlocked. No
  repeat Face ID, but iPhone Home Screen apps often open pop-ups in Safari,
  which has its own storage, so the sign-in can't find its way back. Fragile.
- Ruled out: keeping the key across the trip (for example in IndexedDB).
  Anyone holding the phone could skip the lock.

## What they see

First run:

```text
Welcome to Brown Bag            (today's lock set-up, unchanged)
Set up your lock
[ Use Face ID or fingerprint ]
[ Use a 6-digit PIN instead ]
[ Restore from a backup ]       (moves here from the Sign in screen)

        ↓ lock set up

Connect your health records
Connect each place that has your medicines. You can add more later
under More options.

[ SMART Health IT sandbox     ]
  Test patients only    Connect ›

Not connected
  (greyed names, as today)
```

Back from a sign-in (after the unlock):

```text
Connect your health records

✓ SMART Health IT sandbox
  Connected · updated Nov 25, 2:14 PM
  [ Update now ]  [ Sign in again ]

Not connected
  ...

[ Done ]                        (big, primary)
```

- "Done" shows once at least one connection has loaded, and goes home.
- From More options the heading is "Health records", "Done" goes back to
  More options as today, and the dates and Update now stay where they are.
- A failed sign-in comes back to this screen with a line on that
  connection ("Sign-in didn't finish. Try again."), not to an error screen.

## How it flows

- **Nothing on the phone:** lock set-up → connections screen.
- **Lock set up, nothing connected yet** (left mid-setup): unlock →
  connections screen.
- **Back from a sign-in:** unlock → load that connection → connections
  screen (from the first run, or from More options: both land here).
- **Everyday open, at least one connection:** unlock → home, updating
  every connection with its pass, as today.
- **Sign out:** as today, every connection's pass is ended, then the
  lock screen.

Where the patient was going after the sign-in (setup or More options) rides
in the sign-in's return address or sessionStorage, never in anything saved
between visits.

Claude's calls (from the builder check, 2026-11-25):

- **A connection counts once its list has loaded**, pass or no pass. A
  saved list whose pass ended (30 days, refused, or declined) still opens
  home with today's "Sign in again" note, so the list and QR code keep
  working at a check-in desk with no signal.
- **Sign out stays as today** ("You're signed out", and with no signal
  "Open my saved list"). Its Sign in now leads to the connections screen
  instead of launch.html's list.
- **Outside sign-in links keep working** (`?iss=` from the SMART Launcher,
  the README's test-patient links). On a phone with no lock, the lock is
  set up when the sign-in comes back, as today, then the records load and
  the connections screen shows.

## The update note with several connections

Already on its way in PR #6: "Checking your health records…", then a green
check with "Up to date with your health records." With several connections,
one that fails doesn't hide the others: the bar names it ("Couldn't reach
Medicare. List from Nov 24.") and the check still shows for the ones that
worked.

## Left to the builder

- Keep `js/sources.js` as the one list of sources; the connections screen
  and launch.html both read it.
- Whether launch.html's own "Choose where your records are" list stays as a
  page or folds into the connections screen inside the app. (Claude's call:
  fold it in; launch.html keeps only the test-patient picker and the trip to
  the sign-in page, so there's one list to keep up.)
- Tests first: which screen each starting state lands on, Done only after a
  connection, a cancelled sign-in comes back to the screen, Sign out from
  each state.
- README, LEARNING, privacy page wording if it says "sign in first", and
  both virtual phones before publishing (it touches sign-in and the lock).
- Bump the app cache in `sw.js`.
