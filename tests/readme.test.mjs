import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const readme = read("README.md");

test("the README names every script of the app", () => {
  for (const file of readdirSync(new URL("../js/", import.meta.url))) {
    assert.ok(readme.includes("`js/" + file + "`"), file);
  }
});

test("the README lists the permissions sign-in asks for", () => {
  const asked = /scope: "([^"]+)"/.exec(read("launch.html"))[1].split(" ");
  for (const scope of asked) assert.ok(readme.includes(scope), scope);
});

test("the README's test patient links sign in as that patient", () => {
  const links = [...readme.matchAll(/launch\.html\?iss=([^)\s]+)\)/g)].map((m) => decodeURIComponent(m[1]));
  assert.equal(links.length, 2);
  const patients = links.map((iss) => {
    const [, code] = /^https:\/\/launch\.smarthealthit\.org\/v\/r4\/sim\/([\w-]+)\/fhir$/.exec(iss);
    const options = JSON.parse(Buffer.from(code, "base64url").toString());
    assert.equal(options[0], 3, "patient standalone");
    return options[1];
  });
  assert.deepEqual(patients, ["e89af71d-4aa4-2237-e71d-6fa8e4b5af09", "e7de504a-311d-49be-b2bc-566a328bcc72"]);
  for (const id of patients) assert.ok(readme.includes("`" + id + "`"));
});

test("the README doesn't say the libraries load from somewhere else", () => {
  assert.doesNotMatch(readme, /jsDelivr/i);
});
