import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordReader } from "../js/read.js";

const client = { state: { serverUrl: "https://ehr.example/r4" }, getAuthorizationHeader: () => "Bearer abc" };
const answer = (status, body) => ({ ok: status < 400, status, json: async () => body });

test("recordReader asks the health system with the sign-in's pass", async () => {
  const asked = [];
  const read = recordReader(client, async (url, o) => { asked.push([url, o.headers.Authorization, o.headers.Accept]); return answer(200, { resourceType: "Bundle" }); });
  assert.deepEqual(await read("AllergyIntolerance?patient=1"), { resourceType: "Bundle" });
  assert.deepEqual(asked[0], ["https://ehr.example/r4/AllergyIntolerance?patient=1", "Bearer abc", "application/fhir+json"]);
  await read("https://ehr.example/r4?page=2");
  assert.equal(asked[1][0], "https://ehr.example/r4?page=2");
});

test("recordReader never sends the pass to another server", async () => {
  let called = false;
  const read = recordReader(client, async () => { called = true; return answer(200, {}); });
  for (const url of ["https://evil.example/r4?page=2", "https://ehr.example.evil.com/r4", "http://ehr.example/r4"]) {
    await assert.rejects(read(url));
  }
  assert.equal(called, false);
});

test("recordReader passes a refusal on with its status and leaves the sign-in alone", async () => {
  const before = JSON.stringify(client.state);
  for (const status of [401, 403, 500]) {
    await assert.rejects(recordReader(client, async () => answer(status))("X"), (error) => error.status === status);
  }
  assert.equal(JSON.stringify(client.state), before);
});

test("the reader is kept for offline use", () => {
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/read.js"'));
});
