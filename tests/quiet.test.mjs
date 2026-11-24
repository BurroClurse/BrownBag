// The sign-in library writes token answers and record addresses (with the
// patient's id) to the browser's log. If these fail, anyone who opens that log
// on the phone or computer can read them.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

// The page's own scripts, in the page's order, with a log we can read.
async function signedInRead(page) {
  const logged = [];
  const log = (...args) => { logged.push(args); };
  const context = vm.createContext({
    console: { debug: log, log, warn: log, error: log, info: log },
    URL, URLSearchParams, Headers, Response, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout, btoa, atob, crypto: globalThis.crypto,
    location: { href: "https://example.test/index.html", origin: "https://example.test", search: "" },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async (url, init) => new Response(JSON.stringify(init && init.method === "POST"
      ? { access_token: "new-token", refresh_token: "new-refresh", expires_in: 3600, token_type: "bearer" }
      : { resourceType: "Patient", id: "secret-patient" }), { headers: { "content-type": "application/json" } })
  });
  context.window = context.self = context.globalThis = vm.runInContext("globalThis", context);
  for (const [, src] of read(page).matchAll(/<script src="([^"]+)"/g)) {
    if (!src.includes("qrcode")) vm.runInContext(read(src), context);
  }
  const client = context.FHIR.client({
    serverUrl: "https://ehr.example/r4", clientId: "app", scope: "offline_access", tokenUri: "https://ehr.example/token",
    tokenResponse: { access_token: "old-token", refresh_token: "old-refresh", scope: "offline_access", patient: "secret-patient" }
  });
  await client.refresh();
  const patient = await client.request("Patient/secret-patient");
  assert.equal(patient.id, "secret-patient", "the library still works");
  context.console.debug("something else");
  return logged;
}

for (const page of ["index.html", "launch.html"]) {
  test(page + " keeps tokens and patient ids out of the log, and nothing else", async () => {
    const logged = await signedInRead(page);
    assert.doesNotMatch(JSON.stringify(logged), /token|refresh|secret-patient/);
    assert.deepEqual(logged.map((args) => args[0]), ["something else"]);
  });
}

// Without this, Brown Bag wouldn't open with no signal.
test("the offline copy keeps it", () => {
  assert.ok(read("sw.js").includes('"./js/quiet.js"'));
});
