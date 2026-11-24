// The page staff see after scanning a Brown Bag QR code. The list is inside
// the part of the link after "#", which browsers never send to the server.
// It asks for the patient's 6-digit code, unlocks the list on this device,
// and shows it. Nothing is saved unless staff save the file themselves, and no
// request leaves after the page loads.

import { unpackShare, groupShareBundle, ShareError } from "./share.js";
import { drawShareList } from "./share-list.js";
import { drawSaveFile } from "./fhir-file.js";

// The page's own watcher (in the HTML) stops once the app has started.
window.brownBagStarted = true;
try { sessionStorage.removeItem("brownbag:retried"); } catch (error) { /* not needed */ }

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
  var form = add(root, "form", null, "code-form");
  var label = add(form, "label", "Patient's 6-digit code");
  label.htmlFor = "share-code";
  var input = add(form, "input", null, "code-input");
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
  var open = add(form, "button", "Open the list", "primary big");
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
      var bundle = await unpackShare(fragment, code);
      drawList(groupShareBundle(bundle), bundle);
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

function drawList(groups, bundle) {
  clear(root);
  addLogo();
  var title = drawShareList(root, groups, 1);
  drawSaveFile(root, bundle);
  title.focus();
}

// The bag, small, at the top of the staff page. Decoration only.
function addLogo() {
  var picture = add(root, "img", null, "share-logo");
  picture.src = "icons/logo-trimmed.png";
  picture.alt = "";
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
