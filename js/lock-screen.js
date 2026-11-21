// The lock screen, drawn inside index.html before the list. It resolves with
// the key once the patient unlocks. The key lives only in the page's memory,
// so closing or reloading the page locks Brown Bag again.
// All text goes in with textContent.

import { hasLock, lockMethod, setupLock, unlock, LockError } from "./lock.js";

export function showLockScreen(root) {
  return new Promise(function (resolve) {
    function done(key) {
      clear(root);
      resolve(key);
    }
    if (!hasLock()) {
      drawSetup(root, done);
    } else if (lockMethod() === "pin") {
      drawPinUnlock(root, done);
    } else {
      drawPasskeyUnlock(root, done);
    }
  });
}

function drawSetup(root, done) {
  clear(root);
  var box = panel(root, "Set up your lock");
  para(box, "Brown Bag keeps your list locked on this phone. Only you can open it.");
  var message = status(box);
  var button = action(box, "Use Face ID or fingerprint");
  button.addEventListener("click", async function () {
    button.disabled = true;
    say(message, "");
    try {
      done(await setupLock());
    } catch (error) {
      button.disabled = false;
      if (error instanceof LockError && error.code === "needs-pin") {
        drawPinSetup(root, done);
      } else if (error instanceof LockError && error.code === "cancelled") {
        say(message, "Set-up was cancelled. Try again when you're ready.");
      } else {
        say(message, "Something went wrong. Try again.");
      }
    }
  });
  var pinLink = action(box, "Use a 6-digit PIN instead", "secondary");
  pinLink.addEventListener("click", function () {
    drawPinSetup(root, done);
  });
  button.focus();
}

function drawPinSetup(root, done) {
  clear(root);
  var box = panel(root, "Choose a 6-digit PIN");
  para(box, "You'll type this PIN each time you open Brown Bag. Write it down somewhere safe: if you forget it, your saved list can't be opened.");
  var form = document.createElement("form");
  box.appendChild(form);
  var first = pinField(form, "pin-new", "New PIN", "new-password");
  var second = pinField(form, "pin-again", "Type the PIN again", "new-password");
  var message = status(form);
  action(form, "Save PIN").type = "submit";
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
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
    say(message, "Saving…");
    done(await setupLock({ pin: first.value }));
  });
  first.focus();
}

function drawPinUnlock(root, done) {
  clear(root);
  var box = panel(root, "Unlock Brown Bag");
  var form = document.createElement("form");
  box.appendChild(form);
  var field = pinField(form, "pin", "Your 6-digit PIN", "current-password");
  var message = status(form);
  action(form, "Unlock").type = "submit";
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    say(message, "Checking…");
    try {
      done(await unlock({ pin: field.value }));
    } catch (error) {
      say(message, "That PIN didn't work.");
      field.value = "";
      field.focus();
    }
  });
  field.focus();
}

function drawPasskeyUnlock(root, done) {
  clear(root);
  var box = panel(root, "Unlock Brown Bag");
  var message = status(box);
  var button = action(box, "Unlock with Face ID or fingerprint");
  async function attempt() {
    button.disabled = true;
    say(message, "");
    try {
      done(await unlock());
    } catch (error) {
      button.disabled = false;
      button.textContent = "Try again";
      if (error instanceof LockError && error.code === "cancelled") {
        say(message, "Unlock was cancelled.");
      } else if (error instanceof LockError && error.code === "needs-pin") {
        say(message, "Face ID can't be used at this address. Open Brown Bag from your Home Screen.");
      } else {
        say(message, "That didn't unlock Brown Bag. Try again.");
      }
      button.focus();
    }
  }
  button.addEventListener("click", attempt);
  button.focus();
}

function panel(root, heading) {
  var box = document.createElement("section");
  box.className = "lock";
  box.setAttribute("aria-labelledby", "lock-heading");
  var title = document.createElement("h1");
  title.id = "lock-heading";
  title.textContent = heading;
  box.appendChild(title);
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
  button.className = kind === "secondary" ? "button secondary" : "button";
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
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
}
