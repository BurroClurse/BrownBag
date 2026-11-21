// Home Screen install hint and backup helpers. iPhone Safari erases a site's
// saved data after 7 days of Safari use without a visit; apps added to the
// Home Screen are exempt, and a backup file brings the list back anyway.

import { localDate } from "./view.js";

var DISMISS_KEY = "brownbag:install-hint-dismissed";
var DISMISS_DAYS = 30;

export function installHint(userAgent) {
  var ua = String(userAgent || "");
  if (/iPhone|iPad|iPod/.test(ua)) {
    // iPhone keeps a Home Screen app's storage apart from Safari's, so the
    // list has to travel by backup.
    return "Add Brown Bag to your Home Screen so your list isn't erased. The Home Screen app starts empty, so first tap More options, then Save a backup. Then tap Share, then Add to Home Screen, open it, and choose Restore from a backup.";
  }
  if (/Android/.test(ua)) {
    return "Install Brown Bag from the browser menu so your list isn't erased.";
  }
  return null;
}

export function shouldShowInstallHint({ userAgent, standalone, storage, now }) {
  if (standalone || !installHint(userAgent)) {
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
