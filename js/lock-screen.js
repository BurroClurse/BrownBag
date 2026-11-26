// The lock screen, drawn inside index.html before the list. It resolves with
// the key once the patient unlocks. The key lives only in the page's memory,
// so closing or reloading the page locks Brown Bag again.
// All text goes in with textContent.

import { hasLock, lockMethod, setupLock, unlock, LockError, LOCK_KEY, eraseBrownBag } from "./lock.js";
import { importBackup, importOpened, isPasswordBackup } from "./vault.js";
import { openPopup, popupButton, popupLine } from "./popup.js";
import { openWithPassword } from "./backup-popups.js";
import { lockRecordFrom, startOverText } from "./install.js";

export function showLockScreen(root) {
  return new Promise(function (resolve) {
    function done(key) {
      clear(root);
      resolve(key);
    }
    drawLockStart(root, done);
  });
}

function drawLockStart(root, done) {
  if (!hasLock()) {
    drawSetup(root, done);
  } else if (lockMethod() === "pin") {
    drawPinUnlock(root, done, {});
  } else {
    drawPasskeyUnlock(root, done, {});
  }
}

// opened: what a password backup held. It's saved under the new lock.
function drawSetup(root, done, opened, onBack) {
  clear(root);
  var box = panel(root, "Set up your lock");
  if (opened) para(box, "Your backup is open. Choose a lock for this phone, and it's restored.");
  para(box, "Brown Bag keeps your list locked on this phone. Only you can open it.");
  var message = status(box);
  var button = action(box, "Use Face ID or fingerprint");
  button.addEventListener("click", async function () {
    button.disabled = true;
    say(message, "");
    try {
      await done(await setupLock());
    } catch (error) {
      button.disabled = false;
      if (error instanceof LockError && error.code === "needs-pin") {
        drawPinSetup(root, done, opened, onBack);
      } else if (error instanceof LockError && error.code === "cancelled") {
        say(message, "Set-up was cancelled. Try again when you're ready.");
      } else {
        say(message, "Something went wrong. Try again.");
      }
    }
  });
  var pinLink = action(box, "Use a 6-digit PIN instead", "secondary");
  pinLink.addEventListener("click", function () {
    drawPinSetup(root, done, opened, onBack);
  });
  if (opened) action(box, "Back", "secondary").addEventListener("click", onBack);
  else drawRestoreOption(root, box, done, message);
  button.focus();
}

// After the phone erased Brown Bag's storage: the backup file holds the lock
// settings. The patient unlocks the usual way with them, the list is
// restored, and only then are the lock settings saved. A failed or
// abandoned restore leaves nothing behind.
function drawRestoreOption(root, box, done, message) {
  var picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".json,application/json";
  picker.hidden = true;
  box.appendChild(picker);
  var restore = action(box, "Restore from a backup", "secondary");
  restore.addEventListener("click", function () { picker.click(); });
  picker.addEventListener("change", async function () {
    var file = picker.files && picker.files[0];
    if (!file) return;
    var text = await file.text();
    picker.value = "";
    var again = function () { drawSetup(root, done); };
    if (isPasswordBackup(text)) {
      try {
        await startPasswordRestore(root, text, done, again, restore);
      } catch (error) {
        say(message, "That file isn't a Brown Bag backup.");
      }
    } else if (!startRestore(root, text, done, again)) {
      say(message, "That file isn't a Brown Bag backup.");
    }
  });
}

// Unlocks a backup with the lock settings it carries, restores it, and only
// then saves those lock settings. False if the file isn't a backup.
function startRestore(root, text, done, onBack) {
  var lock = lockRecordFrom(text);
  var method = null;
  try { method = JSON.parse(lock).method; } catch (error) { method = null; }
  if (!lock || !method) {
    return false;
  }
  var restoreThenDone = async function (key) {
    try {
      await importBackup(localStorage, key, text);
    } catch (error) {
      throw new LockError("restore-failed");
    }
    localStorage.setItem(LOCK_KEY, lock);
    done(key);
  };
  var options = { record: lock, onBack: onBack };
  if (method === "pin") {
    drawPinUnlock(root, restoreThenDone, options);
  } else {
    drawPasskeyUnlock(root, restoreThenDone, options);
  }
  return true;
}

// A password backup: its password, then a lock for this phone, then it's
// restored under that lock. False if the patient cancels the password.
async function startPasswordRestore(root, text, done, onBack, opener) {
  var opened = await openWithPassword(text, opener);
  if (!opened) return false;
  var restoreThenDone = async function (key) {
    await importOpened(localStorage, key, opened);
    done(key);
  };
  drawSetup(root, restoreThenDone, opened, onBack);
  return true;
}

function drawPinSetup(root, done, opened, onBack) {
  clear(root);
  var box = panel(root, "Choose a 6-digit PIN");
  para(box, "You'll type this PIN each time you open Brown Bag. Write it down somewhere safe. If you forget it, you'll have to start over. A backup opens with its own password.");
  var form = document.createElement("form");
  box.appendChild(form);
  var first = pinField(form, "pin-new", "New PIN", "new-password");
  var second = pinField(form, "pin-again", "Type the PIN again", "new-password");
  var message = status(form);
  var save = action(form, "Save PIN");
  save.type = "submit";
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (save.disabled) return;
    if (!/^\d{6}$/.test(first.value)) {
      say(message, "Use exactly 6 digits.");
      first.focus();
      return;
    }
    if (first.value !== second.value) {
      say(message, "The two PINs don't match.");
      second.focus();
      return;
    }
    save.disabled = true;
    say(message, "Saving…");
    try {
      await done(await setupLock({ pin: first.value }));
    } catch (error) {
      save.disabled = false;
      say(message, "Couldn't save the PIN. Try again.");
    }
  });
  if (opened) action(form, "Back", "secondary").addEventListener("click", onBack);
  first.focus();
}

function drawPinUnlock(root, done, options) {
  clear(root);
  var restoring = Boolean(options.record);
  var box = panel(root, restoring ? "Unlock your backup" : null);
  var form = document.createElement("form");
  box.appendChild(form);
  var field = pinField(form, "pin", restoring ? "The PIN you used for this backup" : "Your 6-digit PIN", "current-password");
  var message = status(form);
  action(form, "Unlock").type = "submit";
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    say(message, "Checking…");
    try {
      await done(await unlock({ pin: field.value, record: options.record }));
    } catch (error) {
      say(message, error instanceof LockError && error.code === "restore-failed"
        ? "The PIN worked, but the backup couldn't be restored."
        : "That PIN didn't work.");
      field.value = "";
      field.focus();
    }
  });
  exitOption(root, box, done, options, "Forgot your PIN? Start over");
  field.focus();
}

function drawPasskeyUnlock(root, done, options) {
  clear(root);
  var restoring = Boolean(options.record);
  // Laid out like home, which it opens to: the bag fills the screen and the
  // buttons sit at the bottom (the developer, 2026-11-26). Not the PIN screen, whose
  // keyboard covers the bottom.
  if (!restoring) root.classList.add("screen-unlock");
  var box = panel(root, restoring ? "Unlock your backup" : null);
  var message = status(box);
  var button = action(box, "Unlock with Face ID or fingerprint");
  async function attempt() {
    button.disabled = true;
    say(message, "");
    try {
      await done(await unlock({ record: options.record }));
    } catch (error) {
      button.disabled = false;
      button.textContent = "Try again";
      if (error instanceof LockError && error.code === "cancelled") {
        say(message, "Unlock was cancelled.");
      } else if (error instanceof LockError && error.code === "restore-failed") {
        say(message, "Unlocked, but the backup couldn't be restored.");
      } else if (error instanceof LockError && error.code === "needs-pin") {
        say(message, "Face ID can't be used at this address. Open Brown Bag from its usual address or your Home Screen.");
      } else {
        say(message, "That didn't unlock Brown Bag. Try again.");
      }
      button.focus();
    }
  }
  button.addEventListener("click", attempt);
  exitOption(root, box, done, options, "Can't unlock? Start over");
  button.focus();
}

// Restoring: "Back" to set-up. Otherwise: "Start over", which explains what
// is lost and asks again, in a popup, before erasing anything.
function exitOption(root, box, done, options, label) {
  if (options.onBack) {
    action(box, "Back", "secondary").addEventListener("click", options.onBack);
    return;
  }
  action(box, label, "secondary").addEventListener("click", function () {
    drawStartOver(root, done);
  });
}

function drawStartOver(root, done) {
  clear(root);
  var box = panel(root, "Start over?");
  box.classList.add("start-over");
  var text = startOverText(lockMethod());
  text.lines.forEach(function (line) { para(box, line); });
  var card = document.createElement("div");
  card.className = "backup-first";
  box.appendChild(card);
  var title = document.createElement("h2");
  title.textContent = text.title;
  card.appendChild(title);
  var steps = document.createElement("ol");
  text.steps.forEach(function (step) {
    var item = document.createElement("li");
    item.textContent = step;
    steps.appendChild(item);
  });
  card.appendChild(steps);
  para(card, text.note);
  var erase = action(box, "Erase and start over");
  erase.addEventListener("click", function () {
    confirmErase(box, text.confirm, erase, function () { drawSetup(root, done); });
  });
  var keep = action(box, "Keep my lock", "secondary");
  keep.addEventListener("click", function () {
    drawLockStart(root, done);
  });
  // The top shows first, even on a short screen.
  keep.focus({ preventScroll: true });
}

// The last question before erasing: a popup in the app's own look. Cancel has
// focus, and Escape, Back or a tap outside cancels too. The browser keeps
// everything behind it out of reach.
function confirmErase(box, ask, opener, then) {
  var popup = openPopup(box, ask.title, opener, { danger: true });
  popupLine(popup.inner, ask.line);
  popupButton(popup.inner, ask.yes, "stop").addEventListener("click", function () {
    popup.close();
    eraseBrownBag();
    then();
  });
  var no = popupButton(popup.inner, ask.no, "secondary");
  no.addEventListener("click", popup.close);
  no.focus();
}

// heading null: the bag itself is the heading, read as "Brown Bag", for the
// everyday unlock screen, where the button already says what to do.
function panel(root, heading) {
  var box = document.createElement("section");
  box.className = "lock";
  box.setAttribute("aria-labelledby", "lock-heading");
  var picture = document.createElement("img");
  picture.className = "screen-logo";
  picture.src = "icons/logo-trimmed.png";
  var title = document.createElement("h1");
  title.id = "lock-heading";
  if (heading) {
    // The bag above the heading, as on every screen. Decoration only: the
    // heading says what the screen is for.
    picture.alt = "";
    box.appendChild(picture);
    title.textContent = heading;
  } else {
    picture.alt = "Brown Bag";
    title.className = "screen-title";
    title.appendChild(picture);
  }
  box.appendChild(title);
  if (!heading) {
    var tagline = document.createElement("p");
    tagline.className = "tagline";
    tagline.textContent = "Every pill bottle, without the bag.";
    box.appendChild(tagline);
  }
  root.appendChild(box);
  return box;
}

function para(parent, text) {
  var p = document.createElement("p");
  p.textContent = text;
  parent.appendChild(p);
  return p;
}

function status(parent) {
  var p = document.createElement("p");
  p.className = "status";
  p.setAttribute("role", "status");
  p.setAttribute("aria-live", "polite");
  parent.appendChild(p);
  return p;
}

function say(element, text) {
  element.textContent = text;
}

function action(parent, text, kind) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = kind === "secondary" ? "button secondary big" : "button primary big";
  button.textContent = text;
  parent.appendChild(button);
  return button;
}

function pinField(parent, id, labelText, autocomplete) {
  var label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;
  var input = document.createElement("input");
  input.id = id;
  input.type = "password";
  input.inputMode = "numeric";
  input.autocomplete = autocomplete;
  input.maxLength = 6;
  input.pattern = "[0-9]{6}";
  input.required = true;
  parent.appendChild(label);
  parent.appendChild(input);
  return input;
}

function clear(root) {
  root.classList.remove("screen-unlock");
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
}
