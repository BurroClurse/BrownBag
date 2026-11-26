// The staff page's link carries the patient's list after "#". Once the page has
// read it, the address bar is plain share.html (Tyler, 2026-11-26), so a link
// copied or shared from the page never carries the list on. If these fail, a
// staff member who shares the page's address could hand the locked list on.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { takeListFromLink } from "../js/share.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

// The browser's address and history, as far as the staff page uses them.
function fakeBrowser(url) {
  const here = new URL(url);
  const steps = [{ url: here.href, state: null }];
  const calls = [];
  const place = {
    get hash() { return here.hash; },
    get pathname() { return here.pathname; },
    get search() { return here.search; }
  };
  const history = {
    get length() { return steps.length; },
    get state() { return steps[steps.length - 1].state; },
    replaceState(state, unused, address) {
      calls.push(["replaceState", address]);
      const next = new URL(address, here.href);
      here.hash = next.hash;
      here.search = next.search;
      here.pathname = next.pathname;
      steps[steps.length - 1] = { url: here.href, state };
    },
    pushState() { calls.push(["pushState"]); steps.push({}); }
  };
  return { place, history, calls, steps, href: () => here.href };
}

test("the list is read from the link, then the link is plain share.html", () => {
  const b = fakeBrowser("https://example.test/BrownBag/share.html#v3.ABC-def_123");
  assert.equal(takeListFromLink(b.place, b.history), "v3.ABC-def_123");
  assert.equal(b.place.hash, "");
  assert.equal(b.href(), "https://example.test/BrownBag/share.html");
  // The same step, never a new one.
  assert.equal(b.history.length, 1);
  assert.deepEqual(b.calls, [["replaceState", "/BrownBag/share.html"]]);
});

test("a link with nothing after # is left alone", () => {
  for (const url of ["https://example.test/share.html", "https://example.test/share.html#"]) {
    const b = fakeBrowser(url);
    assert.equal(takeListFromLink(b.place, b.history), "");
    assert.equal(b.history.length, 1);
  }
  const plain = fakeBrowser("https://example.test/share.html");
  takeListFromLink(plain.place, plain.history);
  assert.deepEqual(plain.calls, []);
});

test("a second read, as a reload would do, finds no list", () => {
  const b = fakeBrowser("https://example.test/share.html#v3.ABC");
  assert.equal(takeListFromLink(b.place, b.history), "v3.ABC");
  assert.equal(takeListFromLink(b.place, b.history), "");
});

test("the staff page reads the link once, and keeps the list it read", () => {
  const view = read("js/share-view.js");
  assert.match(view, /var fragment = takeListFromLink\(location, history\);/);
  // Nothing else reads the address after it's cleared: the code form and
  // Save as FHIR file use what was read.
  assert.equal(view.match(/location\.hash/g), null);
  assert.match(view, /unpackShare\(fragment, code\)/);
  assert.match(view, /drawSaveFile\(root, bundle, UNLOCKED\.staff\)/);
  // A second shared link opened in the same tab still reloads.
  assert.match(view, /addEventListener\("hashchange"/);
});
