import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dragOf, endsIt, nearBottom, nearTop, swipeAway } from "../js/swipe.js";

const start = { x: 200, width: 400, atTop: true, atBottom: true };
test("down, up and sideways are swipes", () => {
  assert.deepEqual(dragOf(start, 5, 60), { x: 0, y: 60 });
  assert.deepEqual(dragOf(start, -60, 5), { x: -60, y: 0 });
  assert.deepEqual(dragOf(start, 60, 5), { x: 60, y: 0 });
  assert.deepEqual(dragOf(start, 0, -60), { x: 0, y: -60 });
  assert.deepEqual(dragOf(start, 50, -60), { x: 0, y: -60 });
});

test("a code that scrolls is scrolled first; the phone's edge swipe is left alone", () => {
  assert.equal(dragOf({ ...start, atTop: false }, 0, 60), null);
  assert.equal(dragOf({ ...start, atBottom: false }, 0, -60), null);
  assert.deepEqual(dragOf({ ...start, atTop: false }, 60, 0), { x: 60, y: 0 });
  for (const x of [5, 395]) assert.equal(dragOf({ ...start, x }, 60, 0), null);
  assert.deepEqual(dragOf({ ...start, x: 5 }, 0, 60), { x: 0, y: 60 });
});

test("far enough, or quick, closes; a nudge doesn't", () => {
  assert.equal(endsIt({ x: 0, y: 110 }, 900), true);
  assert.equal(endsIt({ x: -110, y: 0 }, 900), true);
  assert.equal(endsIt({ x: 0, y: 50 }, 80), true);
  assert.equal(endsIt({ x: 0, y: 50 }, 900), false);
  assert.equal(endsIt({ x: 0, y: 20 }, 10), false);
  assert.equal(endsIt(null, 10), false);
});

test("the QR code can be swiped away, and Close is still there", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /swipeAway\(overlay, closeQr\)|swipeAway\(overlay, function \(\) \{ closeQr\(\); \}\)/);
  assert.match(app, /"Close", "primary big"/);
});

// A code a little taller than the screen took two swipes down to close.
test("nearly at the top counts as the top", () => {
  for (const top of [-5, 0, 8, 40]) assert.equal(nearTop(top), true, String(top));
  assert.equal(nearTop(120), false);
  assert.equal(nearBottom({ scrollTop: 0, clientHeight: 700, scrollHeight: 700 }), true);
  assert.equal(nearBottom({ scrollTop: 0, clientHeight: 700, scrollHeight: 730 }), true);
  assert.equal(nearBottom({ scrollTop: 0, clientHeight: 700, scrollHeight: 900 }), false);
  assert.equal(nearBottom({ scrollTop: 200, clientHeight: 700, scrollHeight: 900 }), true);
});

// The phone takes a vertical swipe as scrolling unless its first small move is
// stopped, and then it can't be followed.
test("the first small move of a swipe is kept from scrolling", () => {
  const heard = {};
  const set = new Set();
  const overlay = {
    scrollTop: 0, clientHeight: 700, scrollHeight: 700, style: { setProperty() {}, removeProperty() {} },
    classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) },
    addEventListener: (type, run) => { heard[type] = run; }
  };
  globalThis.window = globalThis.window || {};
  globalThis.innerWidth = 400;
  let closed = 0;
  swipeAway(overlay, () => { closed += 1; });
  const send = (type, y) => { let stopped = false; heard[type]({ target: overlay, animationName: "qr-in", cancelable: true, touches: y === undefined ? [] : [{ clientX: 200, clientY: y }], preventDefault() { stopped = true; } }); return stopped; };
  send("animationend");
  for (const way of [1, -1]) {
    set.delete("dragging");
    send("touchstart", 400);
    assert.equal(send("touchmove", 400 + way * 2), true);
    assert.equal(set.has("dragging"), false);
    send("touchmove", 400 + way * 130);
    send("touchend");
  }
  assert.equal(closed, 2);
  // A flick so quick that only its start and end are reported.
  set.delete("dragging");
  send("touchstart", 400);
  heard.touchend({ touches: [], changedTouches: [{ clientX: 200, clientY: 540 }] });
  assert.equal(closed, 3);
  send("touchstart", 400);
  heard.touchend({ touches: [], changedTouches: [{ clientX: 200, clientY: 401 }] });
  assert.equal(closed, 3);
  overlay.scrollHeight = 1200;
  send("touchstart", 400);
  assert.equal(send("touchmove", 398), false);
});
