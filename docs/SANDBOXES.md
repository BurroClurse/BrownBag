# Sandboxes and test patients

Brown Bag uses test systems only, with made-up patients. This page has the
test patients to sign in as, the home server's test clinic for trying two
sources, and the other test systems looked at so far. The
[README](../README.md) has the short tour.

## Test patients

Sign in, then SMART Health IT sandbox, lists 20 made-up patients grouped by what
they show, each with their birth date. A choice goes to the sandbox's approval page.

**Browse all patients**, at the end of that list, finds anyone else
(the developer, 2026-11-28). It lists {{N}} of the sandbox's 933 patients: every
living one with a medicine record of any kind, and the 25 deceased ones with
the most different medicines. Every record counts, "entered in error" and the
rest included, because messy records are what testing needs. Search by any
part of the name, and sort by most different medicines (the default),
prescriptions, current medicines, insurance fills or allergies, by name, or
oldest or youngest first, 20 at a time. The list is saved in the app
(`js/sandbox-patients.js`), so it opens with no wait; to refresh it, run
`node tools/sandbox-patients.mjs` (it only reads the sandbox, and takes several
minutes). **Added by other people** asks the sandbox live for patients others
put there through its API, which it deletes every night; those aren't on the
saved list for that reason.

These links sign in as one patient directly, with no list, no approval and no
password:

| Patient | What it shows | Link |
| --- | --- | --- |
| Chantell Bartell `e89af71d-4aa4-2237-e71d-6fa8e4b5af09` | Insurance fills, one allergy, and an allergy entry that doesn't say what it's to. | [Open as Chantell](https://burroclurse.github.io/BrownBag/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImU4OWFmNzFkLTRhYTQtMjIzNy1lNzFkLTZmYThlNGI1YWYwOSIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir) |
| Loria Jenkins `e7de504a-311d-49be-b2bc-566a328bcc72` | Four current medicines, no insurance claims and no allergies. | [Open as Loria](https://burroclurse.github.io/BrownBag/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImU3ZGU1MDRhLTMxMWQtNDliZS1iMmJjLTU2NmEzMjhiY2M3MiIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir) |

Chantell and Loria come with the sandbox, so its nightly reset keeps them. Added
patients are deleted: **Avery Brownbag** (`brownbag-demo-patient`), who shows every
fill case, is there only after `node tools/demo-patient.mjs`, until the next reset.
Nothing done in Brown Bag is sent to the sandbox; what you add stays on your phone.

Two more added patients have records that disagree, for trying two sources with
the home server's [test clinic](#the-home-servers-test-clinic) (below). They're there only after
`node tools/reconcile-patients.mjs`, until the next reset. The script also writes
each one's test clinic file, with dates from the same day, so run it again before
testing on another day.

- **Riley Reconcile** (`brownbag-recon-riley`, born 1948-06-02): lisinopril 10 mg
  in the sandbox and 20 mg at the clinic; methotrexate weekly against daily;
  atorvastatin current in the sandbox, stopped later at the clinic; Zoloft and
  generic sertraline, which agree; regular and extended-release metformin, a
  possible duplicate, whose fill says 60 for 30 days; lisinopril with hydrochlorothiazide beside lisinopril; an
  active hospital IV order; levothyroxine stopped in the record but filled since;
  and amlodipine, which only the clinic lists.
- **Jordan Partial** (`brownbag-recon-jordan`, born 1955-11-20): a stop dated by
  year only, an undated stop, and a clinic file that says it held records back.

On the home server, these sign in as Riley or Jordan (add them to its
address, `https://localhost:8443`, after setting up the lock):

- Riley: `/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImJyb3duYmFnLXJlY29uLXJpbGV5IiwiIiwiQVVUTyIsMSwxLDAsIiIsIiIsIiIsIiIsIiIsIiIsIiIsMCwxLCIiXQ%2Ffhir`
- Jordan: `/launch.html?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Fsim%2FWzMsImJyb3duYmFnLXJlY29uLWpvcmRhbiIsIiIsIkFVVE8iLDEsMSwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0%2Ffhir`

The script rewrites the test clinic files in `tests/fixtures/reconcile/clinics`;
`git checkout -- tests/fixtures/reconcile/clinics` puts the committed ones back
when you're done.

## The home server's test clinic

Passkeys and encryption need https. `tools/serve.mjs` serves this folder at
`https://localhost:8443` with a certificate from
[mkcert](https://github.com/FiloSottile/mkcert) kept in `.certs/` (never
committed). See the comments at the top of that file.

To try two sources, start it with `BROWN_BAG_DEMO=two-clinics node tools/serve.mjs`.
It then serves the demo clinic, Valley Clinic (test records), which the app
adds as a second source with the signed-in patient's name and birth date.
Riley and Jordan ([Test patients](#test-patients), above) each get their own
clinic file; anyone else gets Loria's. Against Loria Jenkins it disagrees on
one dose (metoprolol) and adds lisinopril, which she doesn't have. Her
simvastatin and Lasix are coded only by strength, with no form, so the
clinic's simvastatin and furosemide tablets show as cards of their own
instead of joining hers; Riley has the stops to check.
`?demo=someone-else` in the page
address makes its birth date a day off, so it's kept out as not matching. Only the home server
(port 8443) asks for it; the published app never does.

## Sandboxes looked at

Planning notes for which test systems Brown Bag could connect to next. Kept
out of the app and the README, which name only what the sign-in list names,
under the naming rules in
[`superpowers/specs/2026-11-23-sign-in-list-design.md`](superpowers/specs/2026-11-23-sign-in-list-design.md)
(Aetna's parent asks for written permission to use its marks; Medicare and
Medicaid names may not give the impression of a connection, 42 U.S.C.
1320b-10). Not legal advice.

Each company's own developer documents were read, and each test server was
checked from Brown Bag's web address to see whether a browser page can read
its records directly (CORS), since Brown Bag keeps the list out of any
server. Status as of 2026-11-24.

| Sandbox | Status | Why |
| --- | --- | --- |
| SMART Health IT | Connected | The course sandbox. Test patients only. |
| Medicare (Blue Button) | Being designed | Pharmacy fills from Medicare claims. Its server isn't approved yet. Design: [`superpowers/specs/2026-11-22-medicare-blue-button-design.md`](superpowers/specs/2026-11-22-medicare-blue-button-design.md). |
| Epic (open.epic) | Later | The best fit of the health systems: self-service, no approval wait, browser reading works, and test patient Camila Lopez has medicines. Parked to focus on the SMART sandbox; Epic's terms, a privacy page and an erase button come first (see the next steps in [`superpowers/specs/2026-11-17-brown-bag-design.md`](superpowers/specs/2026-11-17-brown-bag-design.md)). A browser-only app gets no stay-signed-in pass. |
| Aetna | Later | The best fit of the insurers: allows browser apps (PKCE), and records are readable from the browser. Its sign-up questionnaire is reviewed in 2 to 4 business days, even for the sandbox. No stay-signed-in pass. |
| Oracle Health (Ignite) | Later | Free account, and browser reading works. Patient apps need a code in the app's own domain's DNS settings, which a github.io address can't hold, so it needs a custom domain. |
| MEDITECH (Greenfield) | Later | Manual sign-up with a license agreement and a call. Three test patients. Each real hospital approves the app separately. |
| UnitedHealthcare | No | Needs a registered organization, and its server doesn't let a browser read data, so claims would have to pass through a server. No MedicationStatement records either. |
| Humana | No | Needs a D-U-N-S number and a registered company, which a student project can't have. |
