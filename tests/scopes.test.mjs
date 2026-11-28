// SMART v2 scopes (design 2026-11-28): v2 when the server's configuration
// lists permission-v2, else the v1 scopes used before.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCOPES_V1, SCOPES_V2, scopesFor, smartConfigUrl } from "../js/scopes.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const KINDS = ["Patient", "MedicationRequest", "MedicationStatement", "Medication", "Practitioner", "ExplanationOfBenefit", "AllergyIntolerance"];

test("the same permissions either way: v1 reads, v2 reads and searches", () => {
  const start = "launch/patient openid fhirUser offline_access ";
  assert.equal(SCOPES_V1, start + KINDS.map((k) => "patient/" + k + ".read").join(" "));
  assert.equal(SCOPES_V2, start + KINDS.map((k) => "patient/" + k + ".rs").join(" "));
});

test("v2 only when the server lists permission-v2", () => {
  assert.equal(scopesFor({ capabilities: ["launch-standalone", "permission-v1", "permission-v2"] }), SCOPES_V2);
  assert.equal(scopesFor({ capabilities: ["permission-v2"] }), SCOPES_V2);
  for (const config of [{ capabilities: ["permission-v1"] }, { capabilities: [] }, {}, null, undefined, "x", { capabilities: "permission-v2" }]) {
    assert.equal(scopesFor(config), SCOPES_V1, JSON.stringify(config));
  }
});

test("the configuration's address is the server's, with or without a trailing slash", () => {
  assert.equal(smartConfigUrl("https://launch.smarthealthit.org/v/r4/sim/abc/fhir"), "https://launch.smarthealthit.org/v/r4/sim/abc/fhir/.well-known/smart-configuration");
  assert.equal(smartConfigUrl("https://example.test/fhir/"), "https://example.test/fhir/.well-known/smart-configuration");
});

test("sign-in reads the configuration first, with its own time limit, and falls back to v1", () => {
  const launch = read("js/launch.js");
  const signIn = launch.slice(launch.indexOf("function signIn")).split("\n}\n")[0];
  assert.match(launch, /function chooseScopes\(server\) \{/);
  const choose = launch.slice(launch.indexOf("function chooseScopes")).split("\n}\n")[0];
  assert.match(choose, /withTimeout\(fetch\(smartConfigUrl\(server\)/);
  assert.match(choose, /CONFIG_WAIT_MS/);
  assert.match(choose, /\.catch\(function \(\) \{ return SCOPES_V1; \}\)/);
  assert.match(signIn, /window\.startSignIn\(server, scope\)/);
  // launch.html no longer holds the scopes; it takes them.
  const html = read("launch.html");
  assert.match(html, /function startSignIn\(server, scope\)/);
  assert.match(html, /scope: scope,/);
  assert.doesNotMatch(html, /patient\/MedicationRequest\.read/);
});

test("the scopes work with no signal", () => {
  assert.ok(read("sw.js").includes('"./js/scopes.js"'));
});

test("NOTICE.md carries NLM's RxNav attribution and a SNOMED CT notice", () => {
  const notice = read("NOTICE.md").replace(/\s+/g, " ");
  assert.match(notice, /courtesy of the U\.S\. National Library of Medicine/);
  assert.match(notice, /NLM is not responsible for the product and does not endorse or recommend this or any other product/);
  assert.match(notice, /SNOMED CT/);
});
