# SMART v2 scopes and the NLM notice (design)

2026-11-28. A small change.

## Why

A review of the standards Brown Bag uses (the developer, 2026-11-28) found two
things to do now:

1. **The NLM notice.** Brown Bag calls the National Library of Medicine's RxNav
   live, whose terms of service ask for an attribution, and it uses RxNorm and
   SNOMED CT codes. `NOTICE.md` credits LOINC and UCUM but not these.
2. **SMART v2 scopes.** Brown Bag asks for SMART v1 scopes
   (`patient/MedicationRequest.read`). Under ONC's HTI-1 rule, certified health
   record systems support SMART App Launch 2.0 from 2026, whose scopes are v2
   (`patient/MedicationRequest.rs`: read and search). Older servers may know
   only v1.

## Decisions (the developer, 2026-11-28)

- Ask by what the server says: before sign-in, read the server's
  `.well-known/smart-configuration`; ask for v2 scopes when its `capabilities`
  list `permission-v2`, else the v1 scopes used today.
- If that file can't be read (slow, missing, not JSON), ask for v1, as today.

## Approaches

1. **By the server's capabilities** (picked). Works with v1-only and v2 servers;
   one small extra request, a file the sign-in library reads anyway.
2. **v2 only.** Simplest; a v1-only server would refuse or grant nothing.
3. **Both in one request.** No extra request; a long scope list, and servers
   treat the mix differently.

## How it's built

- `js/scopes.js` (no DOM): `SCOPES_V1` and `SCOPES_V2`, the same permissions
  either way (launch/patient, openid fhirUser, offline_access, and read for
  Patient, MedicationRequest, MedicationStatement, Medication, Practitioner,
  ExplanationOfBenefit and AllergyIntolerance), and `scopesFor(config)`.
- `js/launch.js` reads the configuration of the server it's about to sign in
  to (a link's own `iss`, else the sandbox) with a 5-second limit, inside the
  sign-in's existing 12-second limit, then calls `startSignIn(server, scope)`.
- `launch.html`'s inline `startSignIn` takes the scope instead of holding it;
  its content security policy hash changes with it. No new address: the
  sandbox is already allowed.
- Nothing reads the granted scopes back, so the rest of the app is unchanged;
  a refresh token keeps the scopes it was granted.
- `NOTICE.md` gains NLM's RxNav attribution (RxNorm) and a SNOMED CT notice.

## Calls Claude made

- The configuration's own time limit is 5 seconds, so a slow server still
  leaves time for the sign-in itself within the 12 seconds.
- The README's sign-in snippet shows the v2 scopes, with a line on v1.

## Docs

README (the standards row and the sign-in snippet), HOW-IT-WORKS (both scope
lists), FILES, DECISIONS, LEARNING and NEEDS-TESTING. Items 3 to 5 of the same
review (US Core's reported medicines, stronger patient matching, UNII allergy
codes) go into LIMITS and the README's "What's planned" as ideas.
