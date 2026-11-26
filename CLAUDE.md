# Working on Brown Bag

Standing rules from the developer.

- **The README always says both what Brown Bag does now and what's planned.**
  The sections about the app describe it as it is today. "What's planned" lists
  the future features, integrations and plans, how far along each is (idea,
  designed, planned, waiting on someone), and links its design. Any change that
  adds, finishes, drops or moves a plan updates that section in the same change.
- **The README is split into front end and back end.** "Front end" is what people
  see: the patient, and the person checking their medicines. "Back end" is what
  happens behind the screen (sign-in, reads, storage, the QR code's contents),
  which today runs on the phone, with no Brown Bag server. "What's planned" is
  split the same way. New features go in both halves where they touch both.
- **Ask before approval, one question at a time.** Before the developer approves a design
  or plan, ask them about each call made on their behalf, and anything else still in
  question, as its own question. Don't fold them into a list for them to check.
- **Tell the developer when something needs testing on their Mac.** Cloud sessions can't
  reach the Mac's iPhone simulator, Android emulator or their iPhone. Whenever a
  change is ready for a phone check, say so plainly, with what to check and the
  commands to run (`prompts/phone-pass.md` runs the pass), and add it to
  "Waiting for the next pass" in `docs/NEEDS-TESTING.md`.
- **Start each session with the developer's to-do.** It's private: it lives in
  `CLAUDE.local.md` on the developer's Mac, which git ignores, never in the
  repo. On the Mac, remind them of what's open in it, add to it whenever a change
  needs something only they can do, and move items to "Done" with the date. In a
  cloud session, which can't see it, list anything new for it in your reply so
  the developer can add it.
- **Keep the decisions log.** `docs/DECISIONS.md` records the developer's decisions and
  every call Claude made on their behalf (with what it costs if wrong). Add new
  ones as they're made.
