# Sandboxes looked at

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
