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

// Start over erases what only a backup brings back, so it says how to make one
// first. The names must be the ones on the screens.
test("Start over says what's erased and how to back up first, in the app's own words", async () => {
  const { startOverText } = await import("../js/install.js");
  const { optionGroups } = await import("../js/options.js");
  const { readFileSync } = await import("node:fs");
  const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const text = startOverText("pin");
  assert.match(text.lines.join(" "), /erases everything Brown Bag saved on this phone/);
  assert.match(text.lines.join(" "), /only from a backup/);
  const steps = text.steps.join(" ");
  assert.ok(steps.includes("Keep my lock") && read("js/lock-screen.js").includes('"Keep my lock"'));
  assert.ok(steps.includes("More options") && read("js/app.js").includes('button(root, "More options"'));
  const names = optionGroups({ status: { rows: [["a", "b"]], note: null }, homeScreen: false }).flatMap((g) => g.rows.map((r) => r.name));
  assert.ok(steps.includes("Save a backup") && names.includes("Save a backup"));
});

// A backup is locked with the same key: without this, someone who forgot the
// PIN would count on a file they can't open.
test("Start over says what the backup needs to open", async () => {
  const { startOverText } = await import("../js/install.js");
  assert.equal(startOverText("pin").note, "The backup opens only with this same PIN.");
  assert.equal(startOverText("passkey").note, "The backup opens only with this same Face ID or fingerprint lock.");
});

// Someone choosing a PIN must not count on a backup they couldn't open.
test("choosing a PIN says backups won't open without it", async () => {
  const { readFileSync } = await import("node:fs");
  const screen = readFileSync(new URL("../js/lock-screen.js", import.meta.url), "utf8");
  assert.ok(screen.includes("If you forget it, you'll have to start over, and your backups won't open."));
  assert.ok(!/a backup brings your additions back/.test(screen));
});

// One tap must never erase everything.
test("erasing asks first, says it can't be undone, and offers a way out", async () => {
  const { startOverText } = await import("../js/install.js");
  const { readFileSync } = await import("node:fs");
  const ask = startOverText("pin").confirm;
  assert.equal(ask.title, "Erase everything?");
  assert.match(ask.line, /can't be undone/);
  assert.match(ask.line, /Without a backup/);
  assert.deepEqual([ask.yes, ask.no], ["Erase everything", "Cancel"]);
  const screen = readFileSync(new URL("../js/lock-screen.js", import.meta.url), "utf8");
  // The only place that erases is the popup's own button.
  assert.equal(screen.match(/eraseBrownBag\(\)/g).length, 1);
  assert.match(screen, /function confirmErase[\s\S]*eraseBrownBag\(\)/);
});
