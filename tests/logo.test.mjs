// The developer: the logo sometimes took a while after Done. Each redraw made a new picture,
// and the service worker asked the network first, up to 3 seconds on weak signal.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const APP = "https://burroclurse.github.io/BrownBag/";
function loadWorker(overrides) {
  const listeners = {};
  const context = Object.assign({ self: { addEventListener: (type, fn) => { listeners[type] = fn; }, location: { origin: "https://burroclurse.github.io" }, registration: { scope: APP } }, URL, Request: class {}, setTimeout, clearTimeout, Promise, Error }, overrides);
  vm.runInNewContext(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), context);
  return { self: context.self, listeners };
}
const LOGO = APP + "icons/logo-trimmed.png";
const fresh = () => ({ ok: true, from: "network", clone: () => "copy" });

test("only the pictures come from the phone first", () => {
  const { self } = loadWorker({ caches: {}, fetch: () => {} });
  assert.equal(self.routeFor(LOGO), "picture");
  for (const f of ["js/app.js", "css/brownbag.css", "index.html", "js/icons.js"]) assert.equal(self.routeFor(APP + f), "app", f);
  assert.equal(self.routeFor("https://launch.smarthealthit.org/icons/x.png"), "network");
});

test("the phone's copy shows without waiting, and is updated after", async () => {
  const put = [];
  let answer;
  const { self } = loadWorker({ fetch: () => new Promise((r) => { answer = r; }), caches: { match: async () => ({ from: "phone" }), open: async () => ({ put: async (...a) => put.push(a) }) } });
  let later;
  assert.equal((await self.pictureFor({ url: LOGO }, (p) => { later = p; })).from, "phone");
  answer(fresh());
  await later;
  assert.deepEqual(put, [[LOGO, "copy"]]);
});

test("no copy on the phone: from the network; no network after: nothing breaks", async () => {
  const none = loadWorker({ fetch: async () => fresh(), caches: { match: async () => undefined, open: async () => ({ put: async () => {} }) } });
  assert.equal((await none.self.pictureFor({ url: LOGO }, () => {})).from, "network");
  const off = loadWorker({ fetch: async () => { throw new Error("offline"); }, caches: { match: async () => ({ from: "phone" }), open: async () => ({ put: async () => {} }) } });
  let later;
  assert.equal((await off.self.pictureFor({ url: LOGO }, (p) => { later = p; })).from, "phone");
  await later;
});

test("home keeps one logo picture instead of making a new one", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const home = app.slice(app.indexOf("function drawHome")).split("\n}\n")[0];
  assert.match(home, /appendChild\(homeLogo\)/);
  assert.doesNotMatch(home, /logo-trimmed/);
});
