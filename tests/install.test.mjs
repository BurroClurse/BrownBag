import test from "node:test";
import assert from "node:assert/strict";
import { installTip, installSteps, markInstallDone, shouldShowInstallHint, dismissInstallHint, backupFileName, restoreMessage, withLockRecord, lockRecordFrom } from "../js/install.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test("installTip is one short line on phones and nothing on a computer", () => {
  assert.equal(installTip(IPHONE), "Add Brown Bag to your Home Screen.");
  assert.equal(installTip(ANDROID), "Add Brown Bag to your Home Screen.");
  assert.equal(installTip(MAC), null);
});

test("installSteps gives the iPhone steps, backup first", () => {
  assert.deepEqual(installSteps(IPHONE), [
    "Tap More options, then Save a backup.",
    "Tap Share, then Add to Home Screen.",
    "Open Brown Bag from your Home Screen.",
    "Tap Restore from a backup and pick the file you saved."
  ]);
});

test("installSteps gives the Android steps", () => {
  assert.deepEqual(installSteps(ANDROID), [
    "Open your browser's menu.",
    "Tap Install app or Add to Home screen.",
    "Open Brown Bag from your Home Screen."
  ]);
});

test("once marked done, the tip never comes back", () => {
  const storage = memoryStorage();
  markInstallDone(storage);
  assert.equal(shouldShowInstallHint({ userAgent: IPHONE, standalone: false, storage, now: new Date() }), false);
  assert.equal(shouldShowInstallHint({ userAgent: IPHONE, standalone: false, storage, now: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) }), false);
});

test("the hint hides when Brown Bag already runs from the Home Screen", () => {
  assert.equal(shouldShowInstallHint({ userAgent: IPHONE, standalone: true, storage: memoryStorage(), now: new Date() }), false);
  assert.equal(shouldShowInstallHint({ userAgent: IPHONE, standalone: false, storage: memoryStorage(), now: new Date() }), true);
});

test("a dismissed hint stays hidden for 30 days, then comes back", () => {
  const storage = memoryStorage();
  dismissInstallHint(storage, new Date("2026-11-20T12:00:00Z"));
  assert.equal(shouldShowInstallHint({ userAgent: IPHONE, standalone: false, storage, now: new Date("2026-12-19T12:00:00Z") }), false);
  assert.equal(shouldShowInstallHint({ userAgent: IPHONE, standalone: false, storage, now: new Date("2026-12-21T12:00:00Z") }), true);
});

test("backupFileName uses the local date", () => {
  assert.equal(backupFileName(new Date(2026, 10, 20, 22, 0)), "brown-bag-backup-2026-11-20.json");
});

test("restoreMessage says how many lists came back, in plain words", () => {
  assert.equal(restoreMessage(1), "Restored 1 person's list.");
  assert.equal(restoreMessage(3), "Restored 3 people's lists.");
});

test("a backup carries the lock settings so it can be opened after the phone is wiped", () => {
  const lock = JSON.stringify({ method: "pin", salt: "abc", check: "def" });
  const text = withLockRecord(JSON.stringify({ app: "brownbag", version: 1, data: { p1: "blob" } }), lock);
  assert.equal(lockRecordFrom(text), lock);
  assert.deepEqual(JSON.parse(text).data, { p1: "blob" });
});

test("lockRecordFrom is null for a backup without lock settings or for junk", () => {
  assert.equal(lockRecordFrom(JSON.stringify({ app: "brownbag", version: 1, data: {} })), null);
  assert.equal(lockRecordFrom("not json"), null);
});
