// Home Screen install hint and backup helpers. iPhone Safari erases a site's
// saved data after 7 days of Safari use without a visit; apps added to the
// Home Screen are exempt, and a backup file brings the list back anyway.

import { localDate } from "./view.js";

var DISMISS_KEY = "brownbag:install-hint-dismissed";
var DISMISS_DAYS = 30;
var DONE_KEY = "brownbag:install-done";

function phoneKind(userAgent) {
  var ua = String(userAgent || "");
  if (/iPhone|iPad|iPod/.test(ua)) return "iphone";
  if (/Android/.test(ua)) return "android";
  return null;
}

// The one-line tip on home. The steps are behind its How? button.
export function installTip(userAgent) {
  return phoneKind(userAgent) ? "Add Brown Bag to your Home Screen." : null;
}

export function installSteps(userAgent) {
  var kind = phoneKind(userAgent);
  if (kind === "iphone") {
    // iPhone keeps a Home Screen app's storage apart from Safari's, so the
    // list has to travel by backup.
    return [
      "Tap More options, then Save a backup.",
      "Tap Share, then Add to Home Screen.",
      "Open Brown Bag from your Home Screen.",
      "Tap Restore from a backup and pick the file you saved."
    ];
  }
  if (kind === "android") {
    return [
      "Open your browser's menu.",
      "Tap Install app or Add to Home screen.",
      "Open Brown Bag from your Home Screen."
    ];
  }
  return [];
}

// "I've done this": the tip never comes back (Start over erases this too).
export function markInstallDone(storage) {
  storage.setItem(DONE_KEY, "yes");
}

export function shouldShowInstallHint({ userAgent, standalone, storage, now }) {
  if (standalone || !installTip(userAgent)) {
    return false;
  }
  if (storage && storage.getItem(DONE_KEY)) {
    return false;
  }
  var dismissed = storage && storage.getItem(DISMISS_KEY);
  if (!dismissed) {
    return true;
  }
  return now.getTime() - Number(dismissed) > DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function dismissInstallHint(storage, now) {
  storage.setItem(DISMISS_KEY, String(now.getTime()));
}

export function backupFileName(date) {
  return "brown-bag-backup-" + localDate(date) + ".json";
}

export function restoreMessage(count) {
  return count === 1 ? "Restored 1 person's list." : "Restored " + count + " people's lists.";
}

// The lock settings (how to rebuild the key, never the key) ride along in
// the backup. Without them, a backup made before Safari erased the phone's
// storage could never be opened again.
export function withLockRecord(backupText, lockText) {
  var backup = JSON.parse(backupText);
  if (lockText) {
    backup.lock = lockText;
  }
  return JSON.stringify(backup);
}

export function lockRecordFrom(backupText) {
  try {
    var backup = JSON.parse(backupText);
    return backup && typeof backup.lock === "string" ? backup.lock : null;
  } catch (error) {
    return null;
  }
}

// What Start over says: what's erased, and how to save a backup first. A
// backup is locked the same way as this phone, so it says that too.
export function startOverText(method) {
  return {
    lines: [
      "This erases everything Brown Bag saved on this phone, including your lock.",
      "Your records come back when you sign in. What you added or marked comes back only from a backup."
    ],
    title: "To back up first",
    steps: ["Tap Keep my lock, then unlock.", "Tap More options, then Save a backup."],
    note: "The backup opens only with this same " + (method === "pin" ? "PIN." : "Face ID or fingerprint lock."),
    confirm: {
      title: "Erase everything?",
      line: "This can't be undone. Without a backup, what you added or marked is gone.",
      yes: "Erase everything",
      no: "Cancel"
    }
  };
}
