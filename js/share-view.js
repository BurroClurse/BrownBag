// The page staff see after scanning a Brown Bag QR code. The list is inside
// the part of the link after "#", which browsers never send to the server.
// It asks for the patient's 6-digit code, unlocks the list on this device,
// and shows it. Nothing is saved, and no request leaves after the page loads.

import { unpackShare, groupShareBundle, ShareError } from "./share.js";

var DISCLAIMER = "This list is what you and your records say. Your care team confirms it.";
var root = document.getElementById("share");
var fragment = location.hash.slice(1);

// Opening a second shared link in the same tab only changes the part after
// "#", which doesn't reload the page. Reload so the old list is never shown
// for the new link.
window.addEventListener("hashchange", function () {
  location.reload();
});

if (fragment) {
  drawCodeForm("");
} else {
  drawNoList();
}

// Opened without the list part of the link (for example, typed by hand).
function drawNoList() {
  clear(root);
  addLogo();
  add(root, "h1", "Shared medicine list");
  add(root, "p", "This link has no list in it. Ask the patient to show their QR code again.", "notice");
}

function drawCodeForm(message) {
  clear(root);
  addLogo();
  add(root, "h1", "Shared medicine list");
  note(root, DISCLAIMER);
  var form = add(root, "form");
  var label = add(form, "label", "Enter the 6-digit code the patient gives you");
  label.htmlFor = "share-code";
  var input = add(form, "input");
  input.id = "share-code";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.maxLength = 6;
  input.pattern = "[0-9]{6}";
  input.required = true;
  input.setAttribute("aria-describedby", "share-status");
  var status = add(form, "p", message, "status");
  status.id = "share-status";
  status.setAttribute("role", "status");
  var open = add(form, "button", "Open the list");
  open.type = "submit";
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var code = input.value.trim();
    if (!/^\d{6}$/.test(code)) {
      status.textContent = "The code is 6 digits.";
      input.focus();
      return;
    }
    open.disabled = true;
    status.textContent = "Opening…";
    try {
      drawList(groupShareBundle(await unpackShare(fragment, code)));
    } catch (error) {
      if (error instanceof ShareError && error.code === "bad-link") {
        drawCodeForm("This link is damaged. Ask the patient to show a new code.");
      } else {
        drawCodeForm("That code didn't work. Check it with the patient.");
      }
      var again = document.getElementById("share-code");
      if (again) again.focus();
    }
  });
  input.focus();
}

function drawList(groups) {
  clear(root);
  addLogo();
  var title = add(root, "h1", groups.patient ? groups.patient.name : "Shared medicine list");
  title.tabIndex = -1;
  if (groups.patient && groups.patient.birthDate) {
    add(root, "p", "Born " + groups.patient.birthDate, "who");
  }
  add(root, "p", "Made on " + madeOn(groups.madeAt), "who");
  if (groups.recordsSavedAt) {
    add(root, "p", "The From records part is a copy saved on " + madeOn(groups.recordsSavedAt) + ". It may be out of date.", "notice");
  }
  if (groups.incomplete) {
    add(root, "p", "Some of the patient's records couldn't be loaded. This list may be missing medicines.", "notice");
  }
  note(root, DISCLAIMER);
  group("From records", groups.fromRecords, "No medicines from records.");
  if (groups.fromClaims && groups.fromClaims.length) {
    group("Filled, not in the health record", groups.fromClaims, "");
  }
  group("Added by patient", groups.addedByPatient, "Nothing added by the patient.");
  group("Patient says stopped", groups.patientSaysStopped, "Nothing marked stopped.");
  title.focus();
}

function group(heading, rows, empty) {
  var section = add(root, "section");
  add(section, "h2", heading + " (" + rows.length + ")");
  if (!rows.length) {
    add(section, "p", empty, "med-line");
    return;
  }
  var list = add(section, "ul", null, "meds");
  rows.forEach(function (row) {
    var item = add(list, "li");
    add(item, "p", row.name, "med-name");
    if (row.detail) add(item, "p", row.detail, "med-line");
  });
}

function madeOn(timestamp) {
  var date = new Date(timestamp);
  if (isNaN(date)) return "an unknown date";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// The bag, small, at the top of the staff page. Decoration only.
function addLogo() {
  var picture = add(root, "img", null, "share-logo");
  picture.src = "icons/logo-trimmed.png";
  picture.alt = "";
}

// An explanation, set apart from the instructions and buttons around it:
// "Note:" in bold, in a box with a teal bar down its left side.
function note(parent, text) {
  var p = add(parent, "p", null, "note");
  add(p, "strong", "Note: ", "note-label");
  p.appendChild(document.createTextNode(text));
  return p;
}

function add(parent, tag, text, className) {
  var element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}

function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}
