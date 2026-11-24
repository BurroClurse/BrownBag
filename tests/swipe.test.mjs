import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dragOf, endsIt, nearTop } from "../js/swipe.js";

const start = { x: 200, width: 400, atTop: true };
test("down and sideways are swipes; up scrolls", () => {
  assert.deepEqual(dragOf(start, 5, 60), { x: 0, y: 60 });
  assert.deepEqual(dragOf(start, -60, 5), { x: -60, y: 0 });
  assert.deepEqual(dragOf(start, 60, 5), { x: 60, y: 0 });
  assert.equal(dragOf(start, 0, -60), null);
  assert.equal(dragOf(start, 50, -60), null);
});

test("down scrolls back up first; the phone's edge swipe is left alone", () => {
  assert.equal(dragOf({ ...start, atTop: false }, 0, 60), null);
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
});
