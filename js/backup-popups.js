// The backup password popups. A PIN is too short to lock a file someone else
// may get, so with a PIN lock a backup has its own long password.

import { openPopup, popupButton, popupLine } from "./popup.js";
import { PASSWORD_HINT, passwordProblem } from "./install.js";
import { openPasswordBackup } from "./vault.js";

// Asks for a new password, makes the file, then offers to save it. Saving is
// its own tap: the phone only opens its share sheet straight after one.
// make(password) resolves with the file's text. save(text) shares it.
export function saveWithPassword(opener, make, save) {
  var popup = openPopup(document.body, "Choose a backup password", opener, { tapOutside: false });
  popupLine(popup.inner, "It opens this backup, on any phone. Brown Bag can't reset it, so keep it somewhere safe.");
  var form = passwordForm(popup.inner);
  var first = field(form, "backup-password", "Backup password", "new-password");
  var hint = popupLine(form, PASSWORD_HINT, "popup-hint");
  hint.id = "backup-password-hint";
  first.setAttribute("aria-describedby", hint.id);
  var again = field(form, "backup-password-again", "Type it again", "new-password");
  showToggle(form, [first, again]);
  var message = status(form);
  var next = popupButton(form, "Make the backup", "primary");
  next.type = "submit";
  popupButton(form, "Cancel", "secondary").addEventListener("click", popup.close);
  var busy = false;
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;
    var problem = passwordProblem(first.value, again.value);
    if (problem) {
      message.textContent = problem;
      (problem.indexOf("match") === -1 ? first : again).focus();
      return;
    }
    busy = true;
    message.textContent = "Making your backup…";
    try {
      var text = await make(first.value);
    } catch (error) {
      busy = false;
      message.textContent = "Couldn't make the backup.";
      return;
    }
    if (!form.isConnected) return;
    form.remove();
    popup.inner.querySelector("h2").textContent = "Your backup is ready";
    var line = popup.inner.querySelector("p");
    line.textContent = "You'll need its password to open it.";
    line.setAttribute("role", "status");
    var saveButton = popupButton(popup.inner, "Save the file", "primary");
    saveButton.addEventListener("click", function () {
      popup.close();
      save(text);
    });
    popupButton(popup.inner, "Cancel", "secondary").addEventListener("click", popup.close);
    saveButton.focus();
  });
  first.focus();
}

// Asks for a backup's password until it opens. Resolves with what's inside, or
// null if the patient cancels. Rejects if the file isn't a backup.
export function openWithPassword(text, opener) {
  return new Promise(function (resolve, reject) {
    var answer = null;
    var failure = null;
    var popup = openPopup(document.body, "Backup password", opener, {
      tapOutside: false,
      onClose: function () { if (failure) reject(failure); else resolve(answer); }
    });
    popupLine(popup.inner, "Type the password you chose for this backup.");
    var form = passwordForm(popup.inner);
    var password = field(form, "backup-password", "Backup password", "current-password");
    showToggle(form, [password]);
    var message = status(form);
    popupButton(form, "Open the backup", "primary").type = "submit";
    popupButton(form, "Cancel", "secondary").addEventListener("click", popup.close);
    var busy = false;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (busy) return;
      busy = true;
      message.textContent = "Checking…";
      try {
        answer = await openPasswordBackup(text, password.value);
        // Closed while it was checking: that's a Cancel.
        if (form.isConnected) popup.close();
      } catch (error) {
        busy = false;
        if (error.code === "bad-backup") {
          failure = error;
          popup.close();
          return;
        }
        message.textContent = "That password didn't work.";
        password.focus();
        password.select();
      }
    });
    password.focus();
  });
}

// A name for the phone's password manager, so it never offers this password
// for the PIN.
function passwordForm(parent) {
  var form = document.createElement("form");
  var name = document.createElement("input");
  name.type = "text";
  name.autocomplete = "username";
  name.value = "Brown Bag backup";
  name.readOnly = true;
  name.tabIndex = -1;
  name.className = "visually-hidden";
  name.setAttribute("aria-hidden", "true");
  form.appendChild(name);
  parent.appendChild(form);
  return form;
}

function field(form, id, text, autocomplete) {
  var label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = text;
  var input = document.createElement("input");
  input.id = id;
  input.type = "password";
  input.autocomplete = autocomplete;
  input.autocapitalize = "off";
  input.spellcheck = false;
  form.appendChild(label);
  form.appendChild(input);
  return input;
}

function showToggle(form, inputs) {
  var label = document.createElement("label");
  label.className = "popup-show";
  var box = document.createElement("input");
  box.type = "checkbox";
  box.addEventListener("change", function () {
    inputs.forEach(function (input) { input.type = box.checked ? "text" : "password"; });
  });
  label.appendChild(box);
  label.appendChild(document.createTextNode(" Show password"));
  form.appendChild(label);
}

function status(form) {
  var p = popupLine(form, "", "status");
  p.setAttribute("role", "status");
  return p;
}
