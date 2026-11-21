// The main screen: lock, sign-in, the medicine list in its groups, the
// patient's additions, and the QR code. Everything the records or the
// patient typed goes into the page with textContent, never innerHTML.

import { showLockScreen } from "./lock-screen.js";
import { loadPatientData, savePatientData, exportBackup, importBackup } from "./vault.js";
import { LOCK_KEY } from "./lock.js";
import { shouldShowInstallHint, dismissInstallHint, installHint, backupFileName, restoreMessage, withLockRecord } from "./install.js";
import { fromMedicationRequest, fromMedicationStatement, dedupe, groupByIngredient, splitByStatus, doseChangeText, usableRecord } from "./meds.js";
import { ingredientsFor, searchDrugs } from "./rxnorm.js";
import { buildShareBundle, packShare, fitsInQr } from "./share.js";
import { formatName, arrangeList, shareListFrom, detailLine, sourceLine, countLine, makeAddition, localDate, latestOnly, emptyRecordsText, medicineCount, medicinesButtonText, noticesFor } from "./view.js";
import { saveRecords, loadLastRecords } from "./offline.js";

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
  focusId: null,
  savedAt: null,
  screen: "home"
};

// Keeps the app's own files on the phone so it opens with no signal (sw.js).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(function () {});
}

start();

async function start() {
  clear(root);
  state.key = await showLockScreen(root);
  var client;
  try {
    client = await FHIR.oauth2.ready();
  } catch (error) {
    await signInUnavailable(cameBackFromAuth ? error : null);
    return;
  }
  drawLoading();
  try {
    var patient = await client.patient.read();
    state.patientId = client.patient.id;
    state.patient = { name: formatName(patient), birthDate: patient.birthDate || "" };
  } catch (error) {
    await signInUnavailable(error);
    return;
  }
  await loadAdditions();
  state.split = await loadMedicines(client, state.patientId);
  if (state.split.failed) {
    var saved = await loadLastRecords(localStorage, state.key);
    if (saved && saved.patientId === state.patientId) {
      useSaved(saved);
    }
  } else {
    try {
      await saveRecords(localStorage, state.key, {
        patientId: state.patientId,
        patient: state.patient,
        current: state.split.current,
        older: state.split.older,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      // Not saved for offline use this time. The list still shows.
    }
  }
  render();
}

// No sign-in (closed app, no signal, weak Wi-Fi): show the last saved list
// if there is one, otherwise say what to do.
async function signInUnavailable(error) {
  var saved = await loadLastRecords(localStorage, state.key);
  if (saved) {
    useSaved(saved);
    await loadAdditions();
    render();
  } else if (!navigator.onLine) {
    drawNoConnection();
  } else {
    drawSignedOut(error);
  }
}

function useSaved(saved) {
  state.patientId = saved.patientId;
  state.patient = saved.patient;
  state.split = { current: saved.current, older: saved.older, failed: false };
  state.savedAt = saved.savedAt;
}

async function loadAdditions() {
  try {
    state.data = await loadPatientData(localStorage, state.key, state.patientId);
  } catch (error) {
    state.data = { additions: [], stopped: {} };
    state.announce = "Your saved additions couldn't be opened on this phone, so new changes can't be saved over them.";
  }
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
        .filter(function (r) { return r && r.resourceType === type && usableRecord(r); })
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

// One screen at a time: "home" (the bag and two big buttons), "medicines"
// (the full list) or "more" (backup and sign out). The QR code opens over
// whichever screen is showing (openQr).
function render() {
  clear(root);
  root.className = "screen-" + state.screen;
  var arranged = arrangeList(state.split, state.data);
  if (state.screen === "medicines") {
    drawMedicines(arranged);
  } else if (state.screen === "more") {
    drawMore();
  } else {
    drawHome(arranged);
  }
  var live = add(root, "p", state.announce, "status-line");
  live.setAttribute("role", "status");
  state.announce = "";
  if (state.focusId) {
    var target = document.getElementById(state.focusId);
    if (target) target.focus();
    state.focusId = null;
  }
}

function go(screen, focusId) {
  state.screen = screen;
  state.focusId = focusId;
  render();
  window.scrollTo(0, 0);
}

function drawHome(arranged) {
  drawNotices();
  add(root, "h1", state.patient.name, "home-name");
  var bag = add(root, "button", null, "home-bag");
  bag.type = "button";
  bag.id = "home-bag";
  bag.setAttribute("aria-label", "Show my QR code");
  var logo = add(bag, "img");
  logo.src = "icons/logo-trimmed.png";
  logo.alt = "";
  bag.addEventListener("click", openQr);
  var actions = add(root, "div", null, "home-actions");
  button(actions, "Show my QR code", "primary big", openQr).id = "show-qr";
  button(actions, medicinesButtonText(medicineCount(arranged, state.data.additions)), "secondary big", function () {
    go("medicines", "medicines-heading");
  }).id = "open-medicines";
  add(root, "p", DISCLAIMER, "disclaimer home-disclaimer");
  button(root, "More options", "link-button", function () {
    go("more", "more-heading");
  }).id = "open-more";
}

function drawMedicines(arranged) {
  var top = add(root, "div", null, "screen-top");
  button(top, "Done", "secondary big", function () {
    state.adding = false;
    go("home", "open-medicines");
  }).id = "medicines-done";
  var title = add(root, "h1", "My medicines");
  title.id = "medicines-heading";
  title.tabIndex = -1;
  drawRecords(arranged);
  drawAdditions();
  drawStopped(arranged);
}

function drawMore() {
  var top = add(root, "div", null, "screen-top");
  button(top, "Done", "secondary big", function () {
    go("home", "open-more");
  }).id = "more-done";
  var title = add(root, "h1", "More options");
  title.id = "more-heading";
  title.tabIndex = -1;
  drawBackup();
  var section = add(root, "section");
  heading(section, "Sign out", "signout-heading");
  add(section, "p", "Signing out ends this visit to your records. Your saved list stays on this phone.", "med-line");
  button(section, "Sign out", "secondary big", function () {
    sessionStorage.clear();
    location.href = "./";
  });
}

function drawRecords(arranged) {
  var section = add(root, "section");
  heading(section, "From your records", "records-heading");
  if (state.split.failed) {
    add(section, "p", "Couldn't load medicines from " + SOURCE + ". Sign out and sign in again to retry.", "error");
  }
  var empty = emptyRecordsText(state.split, arranged);
  if (empty && !state.split.failed) {
    add(section, "p", empty);
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
      state.lastRemoved = addition;
      state.announce = addition.name + " removed.";
      state.focusId = "undo-remove";
      save();
    }, "Remove: " + addition.name);
  });
  if (state.lastRemoved) {
    var removed = state.lastRemoved;
    var undoRow = add(section, "p", "Removed " + removed.name + ".", "med-line");
    var undo = button(undoRow, "Undo", "secondary", function () {
      state.data.additions.push(removed);
      state.lastRemoved = null;
      state.announce = removed.name + " is back.";
      state.focusId = "added-heading";
      save();
    }, "Undo: put " + removed.name + " back");
    undo.id = "undo-remove";
  }
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
  var timer = null;
  var search = latestOnly(searchDrugs);

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
    search.cancel();
    clear(results);
    var term = name.value.trim();
    if (term.length < 3) {
      searchStatus.textContent = "";
      return;
    }
    timer = setTimeout(async function () {
      searchStatus.textContent = "Checking the name…";
      try {
        var answer = await search(term);
        if (!answer.isLatest) return;
        var found = answer.value;
        clear(results);
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

// The QR code covers the screen: it swooshes up out of the bag and tucks
// back in on Close (css/brownbag.css; a fade with Reduce Motion). It shows
// only the code, the 6 digits and Close. Focus stays inside it, Escape
// closes it, and focus goes back to "Show my QR code".
async function openQr() {
  if (document.getElementById("qr-overlay")) return;
  var list = shareListFrom(state.patient, arrangeList(state.split, state.data), state.data.additions);
  // Staff are told when the records part is an older saved copy, or when a
  // source failed to load, so a partial list never looks complete.
  var warnings = { recordsSavedAt: state.savedAt, incomplete: state.split.failed };
  var packed = await packShare(buildShareBundle(list, new Date(), warnings), new URL("./", location.href).href);
  var fits = fitsInQr(packed.prefix, packed.digits);

  var overlay = document.createElement("div");
  overlay.id = "qr-overlay";
  overlay.className = "qr-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "qr-heading");
  var bag = document.getElementById("home-bag");
  if (bag) {
    var from = bag.getBoundingClientRect();
    overlay.style.setProperty("--from-x", (from.left + from.width / 2 - innerWidth / 2) + "px");
    overlay.style.setProperty("--from-y", (from.top + from.height * 0.35 - innerHeight / 2) + "px");
  }
  var title = add(overlay, "h2", fits ? "Show this to the person checking you in" : "Your list is too long for one QR code");
  title.id = "qr-heading";
  if (fits) {
    var box = add(overlay, "div", null, "qr");
    box.appendChild(qrCanvas(packed.prefix, packed.digits));
    add(overlay, "p", "Read this code out loud:", "qr-say");
    var code = add(overlay, "p", packed.code, "share-code");
    code.setAttribute("aria-label", "Share code " + packed.code.split("").join(" "));
  } else {
    add(overlay, "p", "Show your medicines on this screen instead.");
    button(overlay, "Show my medicines instead", "secondary big", function () {
      closeQr(function () { go("medicines", "medicines-heading"); });
    });
  }
  button(overlay, "Close", "primary big", function () { closeQr(); }).id = "qr-close";
  overlay.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeQr();
    } else if (event.key === "Tab") {
      var stops = Array.from(overlay.querySelectorAll("button"));
      var at = stops.indexOf(document.activeElement);
      var next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length;
      event.preventDefault();
      stops[next].focus();
    }
  });
  document.body.appendChild(overlay);
  root.inert = true;
  root.setAttribute("aria-hidden", "true");
  document.getElementById("qr-close").focus();
}

function closeQr(after) {
  var overlay = document.getElementById("qr-overlay");
  if (!overlay || overlay.classList.contains("closing")) return;
  overlay.classList.add("closing");
  root.inert = false;
  root.removeAttribute("aria-hidden");
  var finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    overlay.remove();
    if (typeof after === "function") {
      after();
    } else {
      var back = document.getElementById("show-qr");
      if (back) back.focus();
    }
  }
  // Only the closing animation ends it; the opening one may still be
  // finishing if Close was pressed quickly.
  overlay.addEventListener("animationend", function (event) {
    if (event.animationName === "qr-out" || event.animationName === "qr-fade-out") finish();
  });
  setTimeout(finish, 700);
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

// The bar at the top of home, only when something needs saying: an older
// saved list, a source that failed, or the Home Screen hint.
function drawNotices() {
  var hint = shouldShowInstallHint({ userAgent: navigator.userAgent, standalone: isStandalone(), storage: localStorage, now: new Date() })
    ? installHint(navigator.userAgent)
    : null;
  var notes = noticesFor({ savedAt: state.savedAt, online: navigator.onLine, failed: state.split.failed, installHint: hint });
  if (!notes.length) return;
  var bar = add(root, "div", null, "notice-bar");
  notes.forEach(function (text, index) {
    var row = add(bar, "div", null, "notice-row");
    add(row, "p", text);
    if (index === 0 && state.savedAt && navigator.onLine) {
      var update = add(row, "a", "Sign in to update", "button secondary");
      update.href = "./launch.html";
    }
    if (hint && text === hint) {
      button(row, "Not now", "secondary", function () {
        dismissInstallHint(localStorage, new Date());
        state.focusId = "show-qr";
        render();
      });
    }
  });
}

// The backup stays encrypted. It also carries the lock settings (never the
// key), so it can be opened after the phone's storage is erased.
function drawBackup() {
  var section = add(root, "section");
  heading(section, "Backup", "backup-heading");
  add(section, "p", "Save a backup file to Files or iCloud. If your phone ever erases Brown Bag's saved list, Restore brings it back.", "med-line");
  button(section, "Save a backup", "secondary big", saveBackup);
  var picker = add(section, "input");
  picker.type = "file";
  picker.accept = ".json,application/json";
  picker.hidden = true;
  picker.id = "restore-file";
  button(section, "Restore a backup", "secondary big", function () { picker.click(); });
  picker.addEventListener("change", async function () {
    var file = picker.files && picker.files[0];
    if (!file) return;
    try {
      var count = await importBackup(localStorage, state.key, await file.text());
      state.data = await loadPatientData(localStorage, state.key, state.patientId);
      state.announce = restoreMessage(count) + " Nothing on this phone was replaced.";
    } catch (error) {
      state.announce = error && error.code === "locked"
        ? "That backup was made with a different lock. To use it, close and reopen Brown Bag, choose Start over on the lock screen, then Restore from a backup."
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
  if (state.focusId !== "undo-remove") state.lastRemoved = null;
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

function drawNoConnection() {
  clear(root);
  add(root, "h1", "Brown Bag");
  add(root, "p", "No connection, and no saved list on this phone yet. Connect once to save your list.", "notice");
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

// kind is a class list: "secondary", "primary big", "link-button", or null.
function button(parent, text, kind, onClick, label) {
  var b = add(parent, "button", text, kind || null);
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
