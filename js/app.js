// The main screen: lock, sign-in, the medicine list in its groups, the
// patient's additions, and the QR code. Everything the records or the
// patient typed goes into the page with textContent, never innerHTML.

import { showLockScreen } from "./lock-screen.js";
import { loadPatientData, savePatientData, exportBackup, importBackup } from "./vault.js";
import { LOCK_KEY } from "./lock.js";
import { shouldShowInstallHint, dismissInstallHint, installHint, backupFileName, restoreMessage, withLockRecord } from "./install.js";
import { fromMedicationRequest, fromMedicationStatement, dedupe, groupByIngredient, splitByStatus, doseChangeText } from "./meds.js";
import { ingredientsFor, searchDrugs } from "./rxnorm.js";
import { buildShareBundle, packShare, fitsInQr } from "./share.js";
import { formatName, arrangeList, shareListFrom, detailLine, sourceLine, countLine, makeAddition, localDate } from "./view.js";

var SOURCE = "SMART sandbox";
var DISCLAIMER = "This list is what you and your records say. Your care team confirms it.";
var SEARCH_DELAY_MS = 300;

var root = document.getElementById("app");
var params = new URLSearchParams(location.search);
var cameBackFromAuth = params.has("code") || params.has("error") || params.has("state");

var state = {
  key: null,
  patientId: null,
  patient: null,
  split: { current: [], older: [], failed: false },
  data: { additions: [], stopped: {} },
  adding: false,
  qr: null,
  announce: "",
  focusId: null
};

start();

async function start() {
  clear(root);
  state.key = await showLockScreen(root);
  var client;
  try {
    client = await FHIR.oauth2.ready();
  } catch (error) {
    drawSignedOut(cameBackFromAuth ? error : null);
    return;
  }
  drawLoading();
  try {
    var patient = await client.patient.read();
    state.patientId = client.patient.id;
    state.patient = { name: formatName(patient), birthDate: patient.birthDate || "" };
  } catch (error) {
    drawSignedOut(error);
    return;
  }
  try {
    state.data = await loadPatientData(localStorage, state.key, state.patientId);
  } catch (error) {
    state.data = { additions: [], stopped: {} };
    state.announce = "Your saved additions couldn't be opened on this phone.";
  }
  state.split = await loadMedicines(client, state.patientId);
  render();
}

// Prescriptions and "what the patient says" records, each with the
// Medication records they point to (_include), all pages (pageLimit 0).
// If one kind fails to load, the screen says so instead of showing less.
async function loadMedicines(client, patientId) {
  var items = [];
  var failed = false;
  var kinds = [["MedicationRequest", fromMedicationRequest], ["MedicationStatement", fromMedicationStatement]];
  for (var i = 0; i < kinds.length; i += 1) {
    var type = kinds[i][0];
    var convert = kinds[i][1];
    try {
      var resources = await client.request(
        type + "?patient=" + encodeURIComponent(patientId) + "&_include=" + type + ":medication",
        { pageLimit: 0, flat: true }
      );
      var medications = new Map(resources
        .filter(function (r) { return r && r.resourceType === "Medication"; })
        .map(function (r) { return ["Medication/" + r.id, r]; }));
      resources
        .filter(function (r) { return r && r.resourceType === type; })
        .forEach(function (r) { items.push(convert(r, SOURCE, medications)); });
    } catch (error) {
      failed = true;
    }
  }
  var merged = dedupe(items);
  var rxcuis = merged.map(function (item) { return item.rxcui; }).filter(Boolean);
  var ingredients = rxcuis.length ? await ingredientsFor(rxcuis) : new Map();
  var split = splitByStatus(groupByIngredient(merged, ingredients));
  split.failed = failed;
  return split;
}

function render() {
  clear(root);
  var arranged = arrangeList(state.split, state.data);

  add(root, "h1", "Brown Bag");
  add(root, "p", state.patient.name + (state.patient.birthDate ? " · born " + state.patient.birthDate : ""), "who");
  drawInstallHint();
  add(root, "p", DISCLAIMER, "disclaimer");
  var live = add(root, "p", state.announce, "visually-plain");
  live.setAttribute("role", "status");
  state.announce = "";

  drawRecords(arranged);
  drawAdditions();
  drawStopped(arranged);
  drawShare();
  drawBackup();

  var signOut = add(root, "p", "");
  var link = add(signOut, "a", "Sign out");
  link.href = "./";
  link.addEventListener("click", function (event) {
    event.preventDefault();
    sessionStorage.clear();
    location.href = "./";
  });

  if (state.focusId) {
    var target = document.getElementById(state.focusId);
    if (target) target.focus();
    state.focusId = null;
  }
}

function drawRecords(arranged) {
  var section = add(root, "section");
  heading(section, "From your records", "records-heading");
  if (state.split.failed) {
    add(section, "p", "Couldn't load medicines from " + SOURCE + ". Sign out and sign in again to retry.", "error");
  }
  if (!arranged.current.length && !state.split.failed) {
    add(section, "p", "No medicines in your records.");
  }
  var list = add(section, "ul", null, "meds");
  arranged.current.forEach(function (entry) {
    var row = medRow(list, entry);
    button(row, "I stopped this", "secondary", function () {
      state.data.stopped[entry.key] = today();
      state.announce = entry.name + " moved to Stopped by me.";
      state.focusId = "stopped-heading";
      save();
    }, "I stopped this: " + entry.name);
  });
  if (arranged.older.length) {
    var details = add(section, "details");
    add(details, "summary", "Older prescriptions (" + arranged.older.length + ")");
    var older = add(details, "ul", null, "meds");
    arranged.older.forEach(function (entry) { medRow(older, entry); });
  }
}

function drawAdditions() {
  var section = add(root, "section");
  heading(section, "Added by me", "added-heading");
  var list = add(section, "ul", null, "meds");
  state.data.additions.forEach(function (addition) {
    var row = add(list, "li");
    add(row, "p", addition.name, "med-name");
    var line = detailLine(addition);
    if (line) add(row, "p", line, "med-line");
    add(row, "p", "Added " + addition.addedAt, "med-line");
    button(row, "Remove", "secondary", function () {
      state.data.additions = state.data.additions.filter(function (a) { return a.id !== addition.id; });
      state.announce = addition.name + " removed.";
      state.focusId = "added-heading";
      save();
    }, "Remove: " + addition.name);
  });
  add(section, "p", "Saved on this phone only. Clearing your browser erases these.", "med-line");
  if (state.adding) {
    drawAddForm(section);
  } else {
    var open = button(section, "+ Add a medicine or supplement", null, function () {
      state.adding = true;
      state.focusId = "add-name";
      render();
    });
    open.id = "add-open";
  }
}

function drawAddForm(section) {
  var form = add(section, "form");
  var picked = null;
  var searchToken = 0;
  var timer = null;

  var nameLabel = add(form, "label", "Medicine or supplement name");
  nameLabel.htmlFor = "add-name";
  var name = add(form, "input");
  name.id = "add-name";
  name.type = "text";
  name.autocomplete = "off";
  name.required = true;
  name.setAttribute("aria-describedby", "add-search-status");
  var searchStatus = add(form, "p", "", "med-line");
  searchStatus.id = "add-search-status";
  searchStatus.setAttribute("role", "status");
  var results = add(form, "ul", null, "results");

  var doseLabel = add(form, "label", "How much (for example, 1 tablet)");
  doseLabel.htmlFor = "add-dose";
  var dose = add(form, "input");
  dose.id = "add-dose";
  dose.type = "text";

  var oftenLabel = add(form, "label", "How often (for example, once a day)");
  oftenLabel.htmlFor = "add-frequency";
  var often = add(form, "input");
  often.id = "add-frequency";
  often.type = "text";

  var saveButton = add(form, "button", "Save");
  saveButton.type = "submit";
  button(form, "Cancel", "secondary", function () {
    state.adding = false;
    state.focusId = "add-open";
    render();
  });

  name.addEventListener("input", function () {
    if (picked && picked.name !== name.value) picked = null;
    clearTimeout(timer);
    clear(results);
    var term = name.value.trim();
    if (term.length < 3) {
      searchStatus.textContent = "";
      return;
    }
    timer = setTimeout(async function () {
      var token = ++searchToken;
      searchStatus.textContent = "Checking the name…";
      try {
        var found = await searchDrugs(term);
        if (token !== searchToken) return;
        searchStatus.textContent = found.length ? found.length + " matches. Pick one, or keep what you typed." : "No matches. You can still add it.";
        found.forEach(function (drug) {
          var item = add(results, "li");
          button(item, drug.name, null, function () {
            picked = { rxcui: drug.rxcui, name: drug.name };
            name.value = drug.name;
            clear(results);
            searchStatus.textContent = "Picked " + drug.name + ".";
            dose.focus();
          });
        });
      } catch (error) {
        if (token !== searchToken) return;
        searchStatus.textContent = "Couldn't check the name. You can still add it.";
      }
    }, SEARCH_DELAY_MS);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!name.value.trim()) {
      searchStatus.textContent = "Type a name first.";
      name.focus();
      return;
    }
    var addition = makeAddition({
      name: name.value,
      rxcui: picked && picked.name === name.value ? picked.rxcui : null,
      dose: dose.value,
      frequency: often.value
    }, new Date());
    state.data.additions.push(addition);
    state.adding = false;
    state.announce = addition.name + " added.";
    state.focusId = "add-open";
    save();
  });
}

function drawStopped(arranged) {
  if (!arranged.stopped.length) return;
  var section = add(root, "section");
  heading(section, "Stopped by me", "stopped-heading");
  var list = add(section, "ul", null, "meds");
  arranged.stopped.forEach(function (entry) {
    var row = medRow(list, entry);
    add(row, "p", "You marked this stopped on " + entry.stoppedAt, "med-line");
    button(row, "Undo", "secondary", function () {
      delete state.data.stopped[entry.key];
      state.announce = entry.name + " moved back to From your records.";
      state.focusId = "records-heading";
      save();
    }, "Undo: " + entry.name);
  });
}

function drawShare() {
  var section = add(root, "section");
  heading(section, "Share my list", "share-heading");
  if (!state.qr) {
    button(section, "Show my QR code", null, showQr).id = "qr-open";
    return;
  }
  if (state.qr.tooLong) {
    add(section, "p", "Your list is too long for one QR code. Show this screen instead.", "notice");
    return;
  }
  var box = add(section, "div", null, "qr");
  box.appendChild(qrCanvas(state.qr.prefix, state.qr.digits));
  add(section, "p", "Read this code to the person who scans it:");
  var code = add(section, "p", state.qr.code, "share-code");
  code.setAttribute("aria-label", "Share code " + state.qr.code.split("").join(" "));
  button(section, "Hide QR code", "secondary", function () {
    state.qr = null;
    state.focusId = "qr-open";
    render();
  });
}

async function showQr() {
  var list = shareListFrom(state.patient, arrangeList(state.split, state.data), state.data.additions);
  var packed = await packShare(buildShareBundle(list, new Date()), new URL("./", location.href).href);
  state.qr = fitsInQr(packed.prefix, packed.digits) ? packed : { tooLong: true };
  state.focusId = "share-heading";
  render();
}

// The web address goes in as text and the packed list as digits, which a
// QR code stores more tightly (see js/share.js). Always dark on white, even
// in dark mode, so scanners read it.
function qrCanvas(prefix, digits) {
  var qr = qrcode(0, "M");
  qr.addData(prefix, "Byte");
  qr.addData(digits, "Numeric");
  qr.make();
  var modules = qr.getModuleCount();
  var margin = 4;
  var scale = 4;
  var size = (modules + margin * 2) * scale;
  var canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "QR code for your medicine list");
  var context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#000000";
  for (var row = 0; row < modules; row += 1) {
    for (var col = 0; col < modules; col += 1) {
      if (qr.isDark(row, col)) {
        context.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
      }
    }
  }
  return canvas;
}

function isStandalone() {
  return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
}

function drawInstallHint() {
  if (!shouldShowInstallHint({ userAgent: navigator.userAgent, standalone: isStandalone(), storage: localStorage, now: new Date() })) {
    return;
  }
  var box = add(root, "div", null, "notice");
  add(box, "p", installHint(navigator.userAgent));
  button(box, "Not now", "secondary", function () {
    dismissInstallHint(localStorage, new Date());
    state.focusId = "records-heading";
    render();
  });
}

// The backup stays encrypted. It also carries the lock settings (never the
// key), so it can be opened after the phone's storage is erased.
function drawBackup() {
  var section = add(root, "section");
  heading(section, "Backup", "backup-heading");
  add(section, "p", "Save a backup file to Files or iCloud. If your phone ever erases Brown Bag's saved list, Restore brings it back.", "med-line");
  button(section, "Save a backup", null, saveBackup);
  var picker = add(section, "input");
  picker.type = "file";
  picker.accept = ".json,application/json";
  picker.hidden = true;
  picker.id = "restore-file";
  button(section, "Restore a backup", "secondary", function () { picker.click(); });
  picker.addEventListener("change", async function () {
    var file = picker.files && picker.files[0];
    if (!file) return;
    try {
      var count = await importBackup(localStorage, state.key, await file.text());
      state.data = await loadPatientData(localStorage, state.key, state.patientId);
      state.announce = restoreMessage(count);
    } catch (error) {
      state.announce = error && error.code === "locked"
        ? "That backup was made with a different lock, so it can't be opened here."
        : "That file isn't a Brown Bag backup.";
    }
    state.focusId = "backup-heading";
    render();
  });
}

async function saveBackup() {
  try {
    var text = withLockRecord(await exportBackup(localStorage, state.key), localStorage.getItem(LOCK_KEY));
    var file = new File([text], backupFileName(new Date()), { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Brown Bag backup" });
    } else {
      var link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }
    state.announce = "Backup saved as " + file.name + ".";
  } catch (error) {
    state.announce = error && error.name === "AbortError" ? "Backup cancelled." : "Couldn't save the backup.";
  }
  state.focusId = "backup-heading";
  render();
}

function medRow(list, entry) {
  var row = add(list, "li");
  add(row, "p", entry.name, "med-name");
  var detail = detailLine(entry);
  if (detail) add(row, "p", detail, "med-line");
  var change = doseChangeText(entry);
  if (change) add(row, "p", change, "med-line");
  add(row, "p", sourceLine(entry), "med-line");
  var count = countLine(entry);
  if (count) add(row, "p", count, "med-line");
  return row;
}

async function save() {
  state.qr = null;
  try {
    await savePatientData(localStorage, state.key, state.patientId, state.data);
  } catch (error) {
    state.announce = "Couldn't save on this phone. Your change shows now but may be lost.";
  }
  render();
}

function drawSignedOut(error) {
  clear(root);
  add(root, "h1", "Brown Bag");
  add(root, "p", DISCLAIMER, "disclaimer");
  add(root, "p", "Sign in to your health records to load your medicines.");
  if (error) {
    add(root, "p", "Sign-in didn't finish: " + (error.message || String(error)), "error");
  }
  var link = add(root, "a", "Sign in", "button");
  link.href = "./launch.html";
}

function drawLoading() {
  clear(root);
  add(root, "h1", "Brown Bag");
  var p = add(root, "p", "Loading your medicines…");
  p.setAttribute("role", "status");
}

function heading(parent, text, id) {
  var h = add(parent, "h2", text);
  h.id = id;
  h.tabIndex = -1;
  return h;
}

function button(parent, text, kind, onClick, label) {
  var b = add(parent, "button", text, kind === "secondary" ? "secondary" : null);
  b.type = "button";
  if (label) b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
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

function today() {
  return localDate(new Date());
}
