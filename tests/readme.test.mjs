import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const readme = read("README.md");
const DOCS = ["README.md", "NOTICE.md", "docs/HOW-IT-WORKS.md", "docs/FILES.md", "docs/SANDBOXES.md", "docs/LIMITS.md", "docs/NEEDS-TESTING.md", "docs/LEARNING.md"];

test("the files list names every script of the app", () => {
  const files = read("docs/FILES.md");
  for (const file of readdirSync(path.join(ROOT, "js"))) {
    assert.ok(files.includes("`js/" + file + "`"), file);
  }
});

test("How it works lists the permissions sign-in asks for", () => {
  const asked = /scope: "([^"]+)"/.exec(read("launch.html"))[1].split(" ");
  const tour = read("docs/HOW-IT-WORKS.md");
  for (const scope of asked) assert.ok(tour.includes(scope), scope);
});

test("the test patient links sign in as that patient", () => {
  const sandboxes = read("docs/SANDBOXES.md");
  const links = [...sandboxes.matchAll(/launch\.html\?iss=([^)\s]+)\)/g)].map((m) => decodeURIComponent(m[1]));
  assert.equal(links.length, 2);
  const patients = links.map((iss) => {
    const [, code] = /^https:\/\/launch\.smarthealthit\.org\/v\/r4\/sim\/([\w-]+)\/fhir$/.exec(iss);
    const options = JSON.parse(Buffer.from(code, "base64url").toString());
    assert.equal(options[0], 3, "patient standalone");
    return options[1];
  });
  assert.deepEqual(patients, ["e89af71d-4aa4-2237-e71d-6fa8e4b5af09", "e7de504a-311d-49be-b2bc-566a328bcc72"]);
  for (const id of patients) assert.ok(sandboxes.includes("`" + id + "`"));
});

test("the docs don't say the libraries load from somewhere else", () => {
  for (const file of ["README.md", "NOTICE.md", "docs/FILES.md", "docs/HOW-IT-WORKS.md"]) assert.doesNotMatch(read(file), /jsDelivr/i, file);
});

// GitHub's heading anchors: lower case, punctuation dropped, spaces to dashes.
function anchorsOf(text) {
  return new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1].trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-")));
}

test("every relative link in the README and the docs leads somewhere", () => {
  for (const file of DOCS) {
    const text = read(file).replace(/```[\s\S]*?```/g, "");
    const targets = [...text.matchAll(/\]\(([^)\s]+)\)/g), ...text.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]);
    for (const target of targets) {
      if (/^[a-z]+:/i.test(target)) continue;
      const [where, anchor] = target.split("#");
      const to = where ? path.join(path.dirname(path.join(ROOT, file)), where) : path.join(ROOT, file);
      assert.ok(existsSync(to), file + ": " + target);
      if (anchor && to.endsWith(".md")) assert.ok(anchorsOf(readFileSync(to, "utf8")).has(anchor), file + ": " + target);
    }
  }
});

test("the README keeps both halves, the plans and the standards, at a readable length", () => {
  const lines = readme.split("\n").length;
  assert.ok(lines <= 240, lines + " lines");
  for (const heading of ["## Standards", "## Front end: what people see", "## Back end: what happens behind the screen", "## What's planned", "## Copyright"]) {
    assert.ok(readme.includes(heading), heading);
  }
  // The standards come near the top, before the front end.
  assert.ok(readme.indexOf("## Standards") < readme.indexOf("## Front end: what people see"));
  assert.match(readme, /not a medical device/);
  for (const link of ["LICENSE", "NOTICE.md", "docs/HOW-IT-WORKS.md", "docs/SANDBOXES.md", "docs/LIMITS.md"]) {
    assert.ok(readme.includes("](" + link), link);
  }
  // Working files for the developer and Claude stay in the repo, off the README
  // (the developer, 2026-11-26). How it works links the file list.
  for (const link of ["docs/FILES.md", "docs/NEEDS-TESTING.md", "docs/DECISIONS.md", "docs/LEARNING.md", "docs/superpowers/)"]) {
    assert.ok(!readme.includes("](" + link), link);
  }
  assert.ok(read("docs/HOW-IT-WORKS.md").includes("](FILES.md)"));
});

test("the README's sign-in snippet asks for exactly the app's scopes", () => {
  const asked = /scope: "([^"]+)"/.exec(read("launch.html"))[1].split(" ");
  const snippet = /&scope=([\s\S]*?)\n\s*&aud=/.exec(readme)[1].split(/\s+/).filter(Boolean);
  assert.deepEqual(snippet, asked);
  assert.ok(readme.includes('client_id=' + /clientId: "([^"]+)"/.exec(read("launch.html"))[1]));
});

test("the README's QR and FHIR file snippets use the app's own systems and codes", () => {
  const share = read("js/share.js");
  const ips = read("js/ips.js");
  assert.ok(share.includes('"https://burroclurse.github.io/BrownBag/tags"') && readme.includes("https://burroclurse.github.io/BrownBag/tags"));
  assert.ok(share.includes('var PREFIX = "v3."') && readme.includes('share.html#v3.'));
  assert.ok(readme.includes(/var PROFILE = "([^"]+)"/.exec(ips)[1]));
  for (const [, code] of ips.matchAll(/loinc\("([\d-]+)"/g)) assert.ok(readme.includes('"code": "' + code + '"'), code);
  assert.ok(readme.includes("iterations: " + /PBKDF2_ITERATIONS = (\d+)/.exec(read("js/vault.js"))[1]));
});

test("the README's pictures are small, described, and not app files", () => {
  const pictures = [...readme.matchAll(/<img src="(assets\/readme-[\w-]+\.png)" width="160" alt="([^"]{40,})">/g)];
  assert.equal(pictures.length, 3);
  const worker = read("sw.js");
  for (const [, file] of pictures) {
    assert.ok(readFileSync(path.join(ROOT, file)).length < 300 * 1024, file);
    assert.ok(!worker.includes(file), file + " is precached");
  }
  assert.doesNotMatch(worker, /assets\//);
});

test("the README says how many patients Browse all patients lists, of the sandbox's own", async () => {
  const { PATIENTS, SANDBOX_OWN, SANDBOX_TOTAL } = await import("../js/sandbox-patients.js");
  assert.match(readme, /\*\*Browse all patients\*\*/);
  assert.ok(readme.includes("lists " + PATIENTS.length + " of the\nsandbox's " + SANDBOX_OWN + " own patients (" + SANDBOX_TOTAL + " in all"), PATIENTS.length + " " + SANDBOX_OWN);
});
