# README: Standards and code snippets (design)

**Why.** The README is for reviewers, instructors and the HL7 FHIR community.
They should see, near the top, which standards Brown Bag uses, and see what
each one looks like on the wire, the way the developer's
[SMART on FHIR Interactive Lab](https://burroclurse.github.io/SMART-on-FHIR-Interactive-Lab/)
shows HTTP requests and FHIR JSON. The list of docs should only name what
those readers need.

**Goals.** A Standards section before Front end. Snippets under the back-end
part each one shows. A shorter doc list.

**Non-goals.** No app code changes. No doc is deleted. Front end and "What's
planned" keep their wording.

**Anti-goals.** A snippet that doesn't match what the app really sends.

## Approaches

1. **Snippets in the README** (picked by the developer): readers see the
   wire where the idea is explained, like the lab. Costs length.
2. Standards table in the README, snippets in How it works: a short README,
   but the snippets are a click away.
3. Both: a few in the README, the rest in How it works. Two places to keep
   in step.

## What the developer decided (2026-11-26)

- Standards in two groups, Health data and Security and access: standard,
  version, what Brown Bag uses it for, spec link, and a link to its snippet.
- Snippets mostly on the wire (HTTP, FHIR JSON), with JavaScript only for the
  lock and the QR code's packing.
- Snippets: sign-in and reads; the QR code; the lock and the FHIR file. Not
  the code lookups.
- Table at the top, each snippet under its back-end part.
- The README stops linking the Learning log, Needs testing, Decisions, Files
  and `docs/superpowers/`; How it works links Files.
- Claude merges once the tests pass.

## Claude's calls

R43 to R47 in [`DECISIONS.md`](../../DECISIONS.md): the 320-line limit, the
back-end headings, placeholders with real scopes and codes, tests that tie
the snippets to the code, and how versions are written.
