import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const file = (path) => readFileSync(new URL("../" + path, import.meta.url));
const sha384 = (path) => "sha384-" + createHash("sha384").update(file(path)).digest("base64");

test("the two libraries are the exact pinned versions", () => {
  assert.equal(sha384("vendor/fhir-client-3.0.1.js"), "sha384-KCMFUEhPpmBodyBFJ/fdPsY5TQrayEi08dDvK6gTHSvz4BVSRtn8fpbMBFg2nmCJ");
  assert.equal(sha384("vendor/qrcode-generator-1.4.4.js"), "sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k");
});

test("no page loads a script or stylesheet from another site", () => {
  for (const page of ["index.html", "launch.html", "share.html", "health.html"]) {
    const html = file(page).toString("utf8");
    assert.ok(!/<(script|link)[^>]+(src|href)="https?:\/\/(?!burroclurse\.github\.io)[^"]*\.(js|css)"/i.test(html), page);
  }
});

test("the pages load the libraries from this repo, with their hashes", () => {
  assert.match(file("index.html").toString("utf8"), /src="vendor\/fhir-client-3\.0\.1\.js" integrity="sha384-KCMFUEhP/);
  assert.match(file("index.html").toString("utf8"), /src="vendor\/qrcode-generator-1\.4\.4\.js" integrity="sha384-8FWZA6BG/);
  assert.match(file("launch.html").toString("utf8"), /src="vendor\/fhir-client-3\.0\.1\.js" integrity="sha384-KCMFUEhP/);
});

test("the offline copy keeps both libraries", () => {
  const sw = file("sw.js").toString("utf8");
  assert.ok(sw.includes('"./vendor/fhir-client-3.0.1.js"'));
  assert.ok(sw.includes('"./vendor/qrcode-generator-1.4.4.js"'));
});

test("the license notices travel with the libraries", () => {
  const notice = file("vendor/LICENSES.md").toString("utf8");
  assert.ok(notice.includes("fhirclient 3.0.1") && notice.includes("Apache License"));
  assert.ok(notice.includes("qrcode-generator 1.4.4") && notice.includes("MIT"));
});
