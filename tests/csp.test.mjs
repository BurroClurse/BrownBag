// Each page tells the browser which servers it may contact and which scripts may
// run. If this broke, a page could send the list somewhere else, or stop working.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const PAGES = ["index.html", "launch.html", "share.html", "privacy.html"];
const policy = (page) => {
  const found = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(read(page));
  assert.ok(found, page + " has a policy");
  return Object.fromEntries(found[1].split(";").map((part) => part.trim().split(" ")).map(([name, ...rest]) => [name, rest]));
};

for (const page of PAGES) {
  test(page + ": nothing is allowed unless it's named, and no loose scripts", () => {
    const p = policy(page);
    assert.deepEqual(p["default-src"], ["'none'"]);
    assert.deepEqual(p["base-uri"], ["'none'"]);
    assert.deepEqual(p["form-action"], ["'none'"]);
    const all = Object.values(p).flat();
    for (const loose of ["'unsafe-inline'", "'unsafe-eval'", "*", "https:", "http:"]) assert.ok(!all.includes(loose), loose);
    // It comes before anything it has to cover.
    const html = read(page);
    assert.ok(html.indexOf("Content-Security-Policy") < html.search(/<script|<link/));
  });

  test(page + ": each script in the page is the one the policy allows", () => {
    const inline = [...read(page).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => "'sha256-" + createHash("sha256").update(m[1]).digest("base64") + "'");
    const allowed = policy(page)["script-src"].filter((s) => s.startsWith("'sha256-"));
    assert.deepEqual(allowed.sort(), inline.sort());
    assert.doesNotMatch(read(page), /\son[a-z]+="|<style|\sstyle="/);
  });
}

test("the app contacts only the sandbox and the drug name service", () => {
  assert.deepEqual(policy("index.html")["connect-src"], ["'self'", "https://launch.smarthealthit.org", "https://rxnav.nlm.nih.gov"]);
  assert.deepEqual(policy("launch.html")["connect-src"], ["'self'", "https://launch.smarthealthit.org"]);
});

test("the staff page and the privacy page send nothing anywhere", () => {
  for (const page of ["share.html", "privacy.html"]) assert.deepEqual(policy(page)["connect-src"], ["'none'"]);
});
