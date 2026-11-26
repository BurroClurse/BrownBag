// The staff page's link carries the patient's list after "#". Once the page has
// read it, the address bar is plain share.html (the developer, 2026-11-26), so a link
// copied or shared from the page never carries the list on. The tab keeps the
// same locked text on its own history step (the developer, Task 10d), so a reload, or
// Safari bringing a put-aside tab back, asks for the 6 digits again. If these
// fail, a staff member who shares the page's address could hand the locked
// list on, or something unlocked could be kept.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { takeListFromLink, listKeptOnStep, KEPT_LIST } from "../js/share.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

// The browser's address and one tab's history, as far as the staff page uses
// them. A reload is a fresh read of the same step; a new tab is a fresh
// browser.
function fakeBrowser(url, refuse) {
  const here = new URL(url);
  const steps = [{ url: here.href, state: null }];
  let at = 0;
  const calls = [];
  const place = {
    get hash() { return here.hash; },
    get pathname() { return here.pathname; },
    get search() { return here.search; }
  };
  const history = {
    get length() { return steps.length; },
    get state() {
      if (refuse === "read") throw new Error("SecurityError");
      return steps[at].state;
    },
    replaceState(state, unused, address) {
      calls.push(["replaceState", address, state]);
      if (refuse === "write" && state && state[KEPT_LIST]) throw new Error("DataCloneError");
      const next = new URL(address, here.href);
      here.hash = next.hash;
      here.search = next.search;
      here.pathname = next.pathname;
      steps[at] = { url: here.href, state };
    },
    pushState() { calls.push(["pushState"]); }
  };
  // Pasting another link into the same tab: a new step, with no state.
  const open = (address) => {
    const next = new URL(address, here.href);
    here.hash = next.hash;
    steps.splice(at + 1);
    steps.push({ url: next.href, state: null });
    at = steps.length - 1;
  };
  const back = () => {
    at -= 1;
    const was = new URL(steps[at].url);
    here.hash = was.hash;
  };
  const forward = () => {
    at += 1;
    const was = new URL(steps[at].url);
    here.hash = was.hash;
  };
  return { place, history, calls, steps, open, back, forward, href: () => here.href };
}

test("the list is read from the link, then the link is plain share.html", () => {
  const b = fakeBrowser("https://example.test/BrownBag/share.html#v3.ABC-def_123");
  assert.equal(takeListFromLink(b.place, b.history), "v3.ABC-def_123");
  assert.equal(b.place.hash, "");
  assert.equal(b.href(), "https://example.test/BrownBag/share.html");
  // The same step, never a new one.
  assert.equal(b.history.length, 1);
  assert.equal(b.calls.length, 1);
  assert.deepEqual(b.calls[0].slice(0, 2), ["replaceState", "/BrownBag/share.html"]);
});

test("the tab keeps exactly the locked text the QR code holds, and nothing else", () => {
  const b = fakeBrowser("https://example.test/BrownBag/share.html#v3.ABC-def_123");
  takeListFromLink(b.place, b.history);
  assert.deepEqual(b.history.state, { [KEPT_LIST]: "v3.ABC-def_123" });
  // Not a key the patient app reads on its own steps.
  assert.notEqual(KEPT_LIST, "bb");
  assert.notEqual(KEPT_LIST, "open");
  for (const file of ["js/app.js", "js/launch.js", "js/connections.js"]) assert.equal(read(file).includes(KEPT_LIST), false, file);
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

test("a reload, or Safari bringing the tab back, finds the kept list", () => {
  const b = fakeBrowser("https://example.test/share.html#v3.ABC");
  assert.equal(takeListFromLink(b.place, b.history), "v3.ABC");
  assert.equal(takeListFromLink(b.place, b.history), "v3.ABC");
  assert.equal(takeListFromLink(b.place, b.history), "v3.ABC");
  // The address stays plain, and nothing more is written.
  assert.equal(b.href(), "https://example.test/share.html");
  assert.equal(b.calls.length, 1);
});

test("a copied address, or the address in a new tab, has no list", () => {
  const b = fakeBrowser("https://example.test/share.html#v3.ABC");
  takeListFromLink(b.place, b.history);
  const copied = fakeBrowser(b.href());
  assert.equal(takeListFromLink(copied.place, copied.history), "");
});

test("a second link in the same tab replaces the first", () => {
  const b = fakeBrowser("https://example.test/share.html#v3.AAA");
  assert.equal(takeListFromLink(b.place, b.history), "v3.AAA");
  b.open("https://example.test/share.html#v3.BBB");
  // The page reloads on hashchange and reads it.
  assert.equal(takeListFromLink(b.place, b.history), "v3.BBB");
  assert.equal(b.href(), "https://example.test/share.html");
  // Then a reload is the second list.
  assert.equal(takeListFromLink(b.place, b.history), "v3.BBB");
  assert.deepEqual(b.history.state, { [KEPT_LIST]: "v3.BBB" });
});

test("a tab that can't keep it still clears the address and opens the list", () => {
  const refused = fakeBrowser("https://example.test/share.html#v3.ABC", "write");
  assert.equal(takeListFromLink(refused.place, refused.history), "v3.ABC");
  assert.equal(refused.href(), "https://example.test/share.html");
  assert.equal(refused.history.state, null);
  // So a reload has no list, as before Task 10d.
  assert.equal(takeListFromLink(refused.place, refused.history), "");
  // A step whose state can't be read is no list, not an error.
  const unreadable = fakeBrowser("https://example.test/share.html", "read");
  assert.equal(takeListFromLink(unreadable.place, unreadable.history), "");
});

test("an odd kept value is no list", () => {
  for (const state of [{ [KEPT_LIST]: 42 }, { [KEPT_LIST]: { a: 1 } }, { [KEPT_LIST]: "" }, "v3.ABC", 7]) {
    const b = fakeBrowser("https://example.test/share.html");
    b.steps[0].state = state;
    assert.equal(takeListFromLink(b.place, b.history), "", JSON.stringify(state));
  }
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
  // Only takeListFromLink keeps anything, and it keeps the locked text: the
  // staff page never writes history or storage itself.
  for (const writer of [/replaceState/, /pushState/, /localStorage/, /sessionStorage\.setItem/, /indexedDB/]) assert.doesNotMatch(view, writer);
});

// Every step of the staff tab has the same address, plain share.html, so Back
// and Forward between two links' steps don't load the page again. The page
// reloads when the step it lands on keeps a different list from the one it
// read, so each step shows its own code box and its own code works (Task 10d
// review). A step that keeps the same list, or the popstate some browsers
// sent as a page loaded, changes nothing, so it can never reload over and
// over.
test("Back and Forward between two links' steps find each step's own list", () => {
  const b = fakeBrowser("https://example.test/share.html#v3.AAA");
  takeListFromLink(b.place, b.history);
  const onA = listKeptOnStep(b.history);
  assert.equal(onA, "v3.AAA");
  // A popstate as the page loads: the same step, nothing to reload.
  assert.equal(listKeptOnStep(b.history), onA);
  b.open("https://example.test/share.html#v3.BBB");
  takeListFromLink(b.place, b.history);
  const onB = listKeptOnStep(b.history);
  assert.equal(onB, "v3.BBB");
  b.back();
  assert.equal(listKeptOnStep(b.history), "v3.AAA");
  assert.notEqual(listKeptOnStep(b.history), onB);
  // After the reload, the page reads A's step, and finds A's list.
  assert.equal(takeListFromLink(b.place, b.history), "v3.AAA");
  b.forward();
  assert.equal(listKeptOnStep(b.history), "v3.BBB");
  assert.equal(takeListFromLink(b.place, b.history), "v3.BBB");
  // A step that can't be read keeps no list.
  const unreadable = fakeBrowser("https://example.test/share.html", "read");
  assert.equal(listKeptOnStep(unreadable.history), "");
});

test("the staff page reloads on Back and Forward only when the step's list changed", () => {
  const view = read("js/share-view.js");
  assert.match(view, /var onStep = listKeptOnStep\(history\);/);
  const listener = /window\.addEventListener\("popstate", function \(\) \{([\s\S]*?)\n\}\);/.exec(view);
  assert.ok(listener, "a popstate listener");
  assert.match(listener[1], /if \(listKeptOnStep\(history\) !== onStep\) location\.reload\(\);/);
  // Read after the link is taken, so it's the step as the page left it.
  assert.ok(view.indexOf("var onStep") > view.indexOf("var fragment = takeListFromLink"));
});
