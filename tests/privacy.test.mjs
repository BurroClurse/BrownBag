import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const page = () => read("privacy.html");
const words = () => page().replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const CODE = () => [...readdirSync(new URL("../js/", import.meta.url)).map((f) => "js/" + f), "index.html", "launch.html", "share.html", "privacy.html", "sw.js", "css/brownbag.css", "manifest.webmanifest"];

// Names of code systems and formats. Nothing is ever asked of them.
const ONLY_NAMES = ["www.w3.org", "loinc.org", "hl7.org", "terminology.hl7.org", "unitsofmeasure.org", "www.nlm.nih.gov", "snomed.info", "smarthealth.cards", "fhir-registry.smarthealthit.org", "www.hl7.org"];
// Who is contacted, and the words that say so.
const CONTACTED = {
  "launch.smarthealthit.org": "Your health records",
  "rxnav.nlm.nih.gov": "The National Library of Medicine",
  "burroclurse.github.io": "GitHub",
  "github.com": "GitHub"
};

test("the privacy page names everyone the code can contact", () => {
  for (const file of CODE()) {
    for (const [, host] of read(file).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      if (ONLY_NAMES.includes(host)) continue;
      assert.ok(CONTACTED[host], file + " has a new address: " + host);
      assert.ok(words().includes(CONTACTED[host]), host);
    }
  }
});

test("no tracking is true of the code", () => {
  assert.match(words(), /no Brown Bag server, account, ads or tracking/);
  for (const file of CODE()) assert.doesNotMatch(read(file), /document\.cookie|sendBeacon|gtag|analytics/i, file);
});

test("it says the parts a patient would want said", () => {
  for (const line of [
    "Don't enter real health information.",
    "Your list, what you add, and your sign-in are saved locked.",
    "gets medicine names you type and drug codes, but not your name.",
    "it doesn't expire",
    "could work out the digits by trying them all",
    "Sign out ends the sign-in on this phone and keeps your list, locked.",
    "Start over erases Brown Bag on this phone.",
    "It doesn't cover the copy in Brown Bag.",
    "Brown Bag has no way to contact you.",
    "Don't include health information."
  ]) assert.ok(words().includes(line), line);
  assert.match(words(), /Last changed: [A-Z][a-z]+ \d{1,2}, \d{4}/);
  assert.doesNotMatch(words(), /HIPAA[- ]compliant/i);
});

test("it's a whole page by itself: nothing loads from elsewhere, and Back works without a script", () => {
  assert.doesNotMatch(page(), /(src|rel="stylesheet" href)="https?:/);
  assert.match(page(), /<a [^>]*id="privacy-back"[^>]*href="\.\/"|<a [^>]*href="\.\/"[^>]*id="privacy-back"/);
  assert.match(page(), /<h1[^>]*>Privacy<\/h1>/);
  assert.match(page(), /href="https:\/\/github\.com\/BurroClurse\/BrownBag\/issues"/);
});

test("the connections screen links to it, and it works with no signal", () => {
  const app = read("js/app.js");
  const screen = app.slice(app.indexOf("function drawConnections(")).split("\n}\n")[0];
  assert.match(screen, /privacy\.html/);
  assert.ok(read("sw.js").includes('"./privacy.html"'));
  assert.ok(read("README.md").includes("`privacy.html`"));
});
