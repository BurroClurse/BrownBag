import test from "node:test";
import assert from "node:assert/strict";
import { shouldLock, LOCK_AFTER_MS } from "../js/idle.js";

const MIN = 60 * 1000;

test("Brown Bag locks after 5 minutes", () => {
  assert.equal(LOCK_AFTER_MS, 5 * MIN);
});

test("no tap for 5 minutes locks; less doesn't", () => {
  const now = 100 * MIN;
  assert.equal(shouldLock({ now, lastActive: now - 4 * MIN, hiddenAt: null }), false);
  assert.equal(shouldLock({ now, lastActive: now - 5 * MIN, hiddenAt: null }), true);
});

test("5 minutes away from Brown Bag locks; a quick switch doesn't", () => {
  const now = 100 * MIN;
  assert.equal(shouldLock({ now, lastActive: now - 1 * MIN, hiddenAt: now - 1 * MIN }), false);
  assert.equal(shouldLock({ now, lastActive: now - 6 * MIN, hiddenAt: now - 6 * MIN }), true);
});

test("the auto-lock module is kept for offline use", async () => {
  const { readFileSync } = await import("node:fs");
  assert.ok(readFileSync(new URL("../sw.js", import.meta.url), "utf8").includes('"./js/idle.js"'));
});
