# Phone test pass

The developer asks a Claude session on their Mac to run this. The cloud sessions that
build Brown Bag can't reach the Mac's virtual phones, so every change they make
that needs a phone check is listed in `docs/NEEDS-TESTING.md` for this pass.

## What to do

1. Read `docs/NEEDS-TESTING.md` in full. "How a test pass works" says which
   phones to use and how. "Waiting for the next pass" lists what to check. Also
   read `CLAUDE.md` for the developer's standing rules.
2. Make sure you're on the branch the developer checked out (`git status`) and that it
   is up to date with GitHub (`git pull`). Run the tests first:
   `node --test "tests/*.test.mjs"`. If any fail, stop and tell the developer.
3. Put the test patients whose records disagree back on the sandbox, which
   deletes them every night, and write their test clinic files for today:
   `node tools/reconcile-patients.mjs`. If it fails, tell the developer and skip the
   items that use Riley Reconcile or Jordan Partial. Then start the home test
   server with the test clinic switched on, in the
   background: `BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`. It needs the
   mkcert certificates in `.certs/` (see the top of `tools/serve.mjs`). Without
   `BROWN_BAG_DEMO`, the list is today's with one source; check both ways where
   an item says so.
4. For each item under "Waiting for the next pass", run its checks on:
   - the Android emulator (`Peregrine_Pixel9_API36`, Chrome), with TalkBack for
     anything that says screen reader or TalkBack;
   - the iPhone 15 simulator (Safari).
   Use the test patients named in `docs/NEEDS-TESTING.md` (Loria Jenkins,
   Chantell Bartell for claims and an allergy, or Riley Reconcile and Jordan
   Partial for records that disagree). Take a screenshot of anything
   that looks wrong.
5. Don't change any app code. If something fails, write down exactly what you
   did, what you saw, and on which phone, and keep going with the rest.
6. When done, update `docs/NEEDS-TESTING.md` the way it says: move each item
   that passed to "Tested" with today's date and the phones it passed on, and
   leave failed or blocked ones under "Waiting", with a short note on what
   happened. Items under "On a real iPhone (the developer)" stay for the developer.
7. Stop the server. Step 3 rewrote the clinic files with today's dates, so put
   them back first: `git checkout -- tests/fixtures/reconcile/clinics`. Commit
   only `docs/NEEDS-TESTING.md` with a one-line message in plain words
   ("Phone pass: <what passed>"), then `git pull` and `git push` on the same
   branch. Never push to `main`.
8. Tell the developer, in plain words: what passed, what failed (with screenshots), and
   what's left for their own iPhone.
