// "Save as FHIR file" on the staff page, and on the patient's phone under See
// what's inside: a warning first, then the file, made on this device (js/ips.js).
// Nothing is sent.

import { openPopup, popupButton, popupLine } from "./popup.js";
import { patientSummary, summaryFileName, whyNotSaved } from "./ips.js";
import { saveToDevice } from "./save-file.js";

export var NOT_SAVED = {
  incomplete: "This list is incomplete, so it can't be saved as a file.",
  odd: "This list can't be saved as a file."
};

// The warning, for whoever is saving.
export var UNLOCKED = {
  staff: "Anyone who opens this file can read the patient's name, birth date, allergies and medicines. Save it only where you keep patient records.",
  patient: "Anyone who opens this file can read your name, birth date, allergies and medicines. Give it only to people you trust, and delete it when you're done."
};

export function saveResult(error) {
  if (!error) return "Saved.";
  return error.name === "AbortError" ? "Not saved." : "Couldn't save the file.";
}

export function drawSaveFile(parent, bundle, warning) {
  var section = add(parent, "section", null, "save-file");
  var why = whyNotSaved(bundle);
  if (why) {
    add(section, "p", NOT_SAVED[why], "who");
    return;
  }
  var button = add(section, "button", "Save as FHIR file", "secondary big");
  button.type = "button";
  button.id = "save-file";
  add(section, "p", "For systems that read FHIR. The file isn't locked.", "who");
  var status = add(section, "p", "", "status-line");
  status.setAttribute("role", "status");
  button.addEventListener("click", function () {
    status.textContent = "";
    ask(button, warning, async function () {
      var error = null;
      try {
        await saveFile(bundle);
      } catch (problem) {
        error = problem;
      }
      status.textContent = saveResult(error);
    });
  });
}

function ask(opener, warning, save) {
  var popup = openPopup(document.body, "Save an unlocked file?", opener);
  popupLine(popup.inner, warning);
  var cancel = popupButton(popup.inner, "Cancel", "secondary");
  cancel.addEventListener("click", popup.close);
  popupButton(popup.inner, "Save the file", "primary").addEventListener("click", function () {
    popup.close();
    save();
  });
  cancel.focus();
}

async function saveFile(bundle) {
  var summary = patientSummary(bundle, { now: new Date(), uuid: newId });
  var file = new File([JSON.stringify(summary, null, 2)], summaryFileName(bundle), { type: "application/json" });
  await saveToDevice(file);
}

// A random id (RFC 4122, version 4).
function newId() {
  var bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function add(parent, tag, text, className) {
  var element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}
