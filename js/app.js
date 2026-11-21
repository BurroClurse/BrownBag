// The main screen: lock, sign-in, the medicine list in its groups, the
// patient's additions, and the QR code. Everything the records or the
// patient typed goes into the page with textContent, never innerHTML.

import { showLockScreen, restoreBackupText } from "./lock-screen.js";
import { loadPatientData, savePatientData, exportBackup, importBackup } from "./vault.js";
import { LOCK_KEY, hasLock } from "./lock.js";
import { shouldShowInstallHint, dismissInstallHint, installTip, installSteps, markInstallDone, backupFileName, restoreMessage, withLockRecord } from "./install.js";
import { fromMedicationRequest, fromMedicationStatement, dedupe, groupByIngredient, splitByStatus, doseChangeText, usableRecord, isPlaceholderDrug } from "./meds.js";
import { ingredientsFor, searchDrugs } from "./rxnorm.js";
import { buildShareBundle, packShare, fitsInQr } from "./share.js";
import { formatName, arrangeList, shareListFrom, detailLine, sourceLine, countLine, makeAddition, localDate, latestOnly, emptyRecordsText, medicineCount, medicinesButtonText, noticesFor, logChange, changeAlert } from "./view.js";
import { saveRecords, loadLastRecords, hasSavedList } from "./offline.js";
import { passFromState, clientStateFromPass, savePass, loadPass, deletePass, refreshRefused, withTimeout, storePassFrom, passExpired } from "./pass.js";
import { shouldLock } from "./idle.js";

var SOURCE = "SMART sandbox";
var DISCLAIMER = "This list is what you and your records say. Your care team confirms it.";
var TAGLINE = "Every pill bottle, without the bag.";
var SEARCH_DELAY_MS = 300;
// How long an update with the pass waits for the health system.
var UPDATE_WAIT_MS = 8000;
// And for the records after that (the drug lookups inside have their own 8).
var RECORDS_WAIT_MS = 12000;

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
  screen: "home",
  // The notes at the top of home: updating with the pass, no connection,
  // or the pass ended (or there is none) and the list is a saved copy.
  updating: false,
  offline: false,
  needsSignIn: false
};

// Locks Brown Bag again after 5 minutes without a tap, or 5 minutes away
// from it (js/idle.js). Locking reloads the page, which forgets the key; the
// next unlock opens and updates the list as usual.
var autoLockStarted = false;
function startAutoLock() {
  if (autoLockStarted) return;
  autoLockStarted = true;
  var lastActive = Date.now();
  var hiddenAt = null;
  ["pointerdown", "keydown", "touchstart", "input"].forEach(function (type) {
    document.addEventListener(type, function () { lastActive = Date.now(); }, { capture: true, passive: true });
  });
  function check() {
    if (state.key && shouldLock({ now: Date.now(), lastActive: lastActive, hiddenAt: hiddenAt })) {
      state.key = null;
      location.reload();
    }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
    } else {
      check();
      hiddenAt = null;
    }
  });
  setInterval(check, 15000);
}

// A status area that stays on the page between redraws, so VoiceOver reads
// "Updating your list…" and how the update ended.
var liveUpdate = document.createElement("p");
liveUpdate.id = "live-update";
liveUpdate.className = "visually-hidden";
liveUpdate.setAttribute("role", "status");
document.body.appendChild(liveUpdate);
function sayUpdate(text) {
  liveUpdate.textContent = text;
}

// Android tells the page when Brown Bag was installed; the tip is done.
window.addEventListener("appinstalled", function () {
  markInstallDone(localStorage);
});

// Keeps the app's own files on the phone so it opens with no signal (sw.js).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(function () {});
}

start();

async function start() {
  // A reload keeps the last history step; start from home's.
  if (history.state && history.state.bb) history.replaceState(null, "");
  clear(root);
  // Nothing saved yet: there's nothing for the lock to open, so go straight
  // to Sign in. The lock comes once, when the sign-in comes back.
  if (!cameBackFromAuth && !hasSavedList(localStorage)) {
    drawSignedOut(null);
    return;
  }
  state.key = await showLockScreen(root);
  startAutoLock();
  // One unlock: with a saved list and a pass, show the list now and update
  // it in place, with no sign-in page.
  if (!cameBackFromAuth && await openWithPass()) {
    return;
  }
  var client;
  try {
    client = await FHIR.oauth2.ready();
  } catch (error) {
    await signInUnavailable(cameBackFromAuth ? error : null);
    return;
  }
  drawLoading();
  try {
    await loadFromClient(client);
  } catch (error) {
    await signInUnavailable(error);
    return;
  }
  await keepPass(client);
  render();
}

async function openWithPass() {
  var saved = await loadLastRecords(localStorage, state.key);
  var pass = saved ? await loadPass(localStorage, state.key, saved.patientId) : null;
  if (pass && passExpired(pass, Date.now())) {
    // 30 days without opening: the connection ends; sign in again.
    await deletePass(localStorage, pass.patientId);
    pass = null;
  }
  if (!pass) {
    return false;
  }
  pass.usedAt = Date.now();
  await savePass(localStorage, state.key, pass);
  useSaved(saved);
  await loadAdditions();
  state.updating = navigator.onLine;
  state.offline = !navigator.onLine;
  render();
  if (state.updating) {
    await updateWithPass(pass);
  }
  return true;
}

// Trades the pass for fresh access, then loads the records the same way a
// sign-in does. Each step has a time limit, and the new list only replaces
// the saved one once it has fully arrived, so a late answer can't change
// the list after "No connection" shows. Only the token server refusing the
// pass deletes it; anything else keeps it for next time.
async function updateWithPass(pass) {
  sayUpdate("Updating your list…");
  var client;
  try {
    client = FHIR.client(clientStateFromPass(pass));
    await withTimeout(client.refresh(), UPDATE_WAIT_MS);
  } catch (error) {
    if (refreshRefused(error)) {
      await deletePass(localStorage, pass.patientId);
      state.needsSignIn = true;
    } else {
      state.offline = true;
    }
    finishUpdate();
    return;
  }
  try {
    var fresh = passFromState(client.state);
    if (fresh && fresh.refreshToken !== pass.refreshToken) {
      await savePass(localStorage, state.key, Object.assign(fresh, { patientId: fresh.patientId || pass.patientId }));
    }
    var result = await withTimeout(loadFresh(client), RECORDS_WAIT_MS);
    if (result.split.failed) {
      state.offline = true;
    } else {
      var samePatient = result.patientId === state.patientId;
      usePatient(result);
      if (!samePatient) {
        await loadAdditions();
      }
      await keepFreshCopy();
      await clearChanges();
    }
  } catch (error) {
    state.offline = true;
  }
  finishUpdate();
}

function finishUpdate() {
  state.updating = false;
  var note = noticesFor({ savedAt: state.savedAt, offline: state.offline, needsSignIn: state.needsSignIn, now: new Date() })[0];
  sayUpdate(note ? note.text : "Your list is up to date.");
  // Other screens pick up the new list when they go back home, so nothing
  // the patient is typing gets redrawn away.
  if (state.screen === "home") {
    render();
  }
}

// Saves the pass a sign-in returned, or removes the old one if this sign-in
// didn't give one (the patient said no to staying signed in).
async function keepPass(client) {
  try {
    await storePassFrom(localStorage, state.key, client.state, state.patientId);
  } catch (error) {
    // No pass this time: the next open asks to sign in, as before.
  }
}

// Reads the patient and the medicines without touching what's on screen.
// Throws if the patient can't be read.
async function loadFresh(client) {
  var patient = await client.patient.read();
  var patientId = client.patient.id;
  return {
    patientId: patientId,
    patient: { name: formatName(patient), birthDate: patient.birthDate || "" },
    split: await loadMedicines(client, patientId)
  };
}

function usePatient(result) {
  state.patientId = result.patientId;
  state.patient = result.patient;
  state.split = result.split;
  state.savedAt = null;
  state.offline = false;
  state.needsSignIn = false;
}

async function keepFreshCopy() {
  try {
    await saveRecords(localStorage, state.key, {
      patientId: state.patientId,
      patient: state.patient,
      current: state.split.current,
      older: state.split.older,
      placeholders: state.split.placeholders || 0,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    // Not saved for offline use this time. The list still shows.
  }
}

// After a sign-in: the patient, the patient's additions and the medicines,
// then the copy saved for offline use. Throws if the patient can't be read.
async function loadFromClient(client) {
  var result = await loadFresh(client);
  usePatient(result);
  await loadAdditions();
  if (state.split.failed) {
    var saved = await loadLastRecords(localStorage, state.key);
    if (saved && saved.patientId === state.patientId) {
      useSaved(saved);
      state.needsSignIn = true;
    }
  } else {
    await keepFreshCopy();
    await clearChanges();
  }
}

// Changes made while the records part is a saved copy are kept, so the QR
// screen can say what changed since the records were last updated.
function recordChange(kind, name, extra) {
  if (state.savedAt) {
    state.data.changes = logChange(state.data.changes, kind, name, extra);
  }
}

async function clearChanges() {
  if (state.data.changes && state.data.changes.length) {
    state.data.changes = [];
    try {
      await savePatientData(localStorage, state.key, state.patientId, state.data);
    } catch (error) {
      // Kept for next time; the alert only shows with a saved copy anyway.
    }
  }
}

// No sign-in (closed app, no signal, weak Wi-Fi): show the last saved list
// if there is one, otherwise say what to do.
async function signInUnavailable(error) {
  var saved = await loadLastRecords(localStorage, state.key);
  if (saved) {
    useSaved(saved);
    await loadAdditions();
    state.offline = !navigator.onLine;
    state.needsSignIn = navigator.onLine;
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
  state.split = { current: saved.current, older: saved.older, failed: false, placeholders: saved.placeholders || 0 };
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
  var placeholders = 0;
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
        .forEach(function (r) {
          var item = convert(r, SOURCE, medications);
          if (isPlaceholderDrug(item)) {
            placeholders += 1;
          } else {
            items.push(item);
          }
        });
    } catch (error) {
      failed = true;
    }
  }
  var merged = dedupe(items);
  var rxcuis = merged.map(function (item) { return item.rxcui; }).filter(Boolean);
  var ingredients = rxcuis.length ? await ingredientsFor(rxcuis) : new Map();
  var split = splitByStatus(groupByIngredient(merged, ingredients));
  split.failed = failed;
  split.placeholders = placeholders;
  return split;
}

// One screen at a time: "home" (the bag and two big buttons), "medicines"
// (the full list) or "more" (backup and sign out). The QR code opens over
// whichever screen is showing (openQr).
function render() {
  // A redraw keeps focus where it was unless a screen change says otherwise.
  var had = !state.focusId && document.activeElement && document.activeElement.id;
  clear(root);
  root.className = "screen-" + state.screen;
  var arranged = arrangeList(state.split, state.data);
  if (state.screen === "medicines") {
    drawMedicines(arranged);
  } else if (state.screen === "more") {
    drawMore();
  } else if (state.screen === "install") {
    drawInstall();
  } else {
    drawHome(arranged);
  }
  var live = add(root, "p", state.announce, "status-line");
  live.setAttribute("role", "status");
  state.announce = "";
  if (!state.focusId && had && document.getElementById(had)) {
    document.getElementById(had).focus();
  }
  if (state.focusId) {
    var target = document.getElementById(state.focusId);
    if (target) target.focus();
    state.focusId = null;
  }
}

// The phone's Back button. Each screen past home, and the QR code, is one
// step in the browser's history, so Back goes home or closes the code
// instead of leaving Brown Bag. Done and Close take that same step back.
var BACK_FOCUS = { medicines: "open-medicines", more: "open-more", install: "show-qr" };
window.addEventListener("popstate", function () {
  if (document.getElementById("qr-overlay")) {
    var after = qrAfter;
    qrAfter = null;
    closeQr(after, true);
  } else if (state.screen !== "home") {
    go("home", BACK_FOCUS[state.screen]);
  }
});

function go(screen, focusId) {
  if (screen !== "home" && state.screen === "home") {
    history.pushState({ bb: screen }, "");
  } else if (screen === "home" && history.state && history.state.bb) {
    history.back();
    return;
  }
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
  note(root, DISCLAIMER);
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
  if (installTip(navigator.userAgent) && !isStandalone()) {
    var home = add(root, "section");
    heading(home, "Home Screen", "home-screen-heading");
    button(home, "Add to Home Screen", "secondary big", function () {
      go("install", "install-heading");
    }).id = "open-install";
  }
  var section = add(root, "section");
  heading(section, "Sign out", "signout-heading");
  note(section, "Signing out disconnects Brown Bag from your records. Your saved list stays on this phone. You'll sign in again next time.");
  button(section, "Sign out", "secondary big", async function () {
    if (state.patientId) {
      await deletePass(localStorage, state.patientId);
    }
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
  if (state.split.placeholders) {
    var one = state.split.placeholders === 1;
    note(section, "Your records also have " + state.split.placeholders + (one ? " entry" : " entries") + " with no medicine name, so " + (one ? "it isn't" : "they aren't") + " listed. Ask your care team what " + (one ? "it is." : "they are."));
  }
  var list = add(section, "ul", null, "meds");
  arranged.current.forEach(function (entry) {
    var row = medRow(list, entry);
    button(row, "I stopped this", "stop card-action", function () {
      state.data.stopped[entry.key] = today();
      recordChange("stopped", entry.name);
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
  note(section, "Saved on this phone only. Clearing your browser erases these.");
  var list = add(section, "ul", null, "meds");
  state.data.additions.forEach(function (addition) {
    var row = add(list, "li");
    add(row, "p", addition.name, "med-name");
    var line = detailLine(addition);
    if (line) add(row, "p", line, "med-line");
    add(row, "p", "Added " + addition.addedAt, "med-line");
    button(row, "Remove", "stop card-action", function () {
      state.data.additions = state.data.additions.filter(function (a) { return a.id !== addition.id; });
      recordChange("removed", addition.name);
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
      recordChange("added", removed.name, { checked: Boolean(removed.rxcui) });
      state.lastRemoved = null;
      state.announce = removed.name + " is back.";
      state.focusId = "added-heading";
      save();
    }, "Undo: put " + removed.name + " back");
    undo.id = "undo-remove";
  }
  if (state.adding) {
    drawAddForm(section);
  } else {
    var open = button(section, "+ Add a medicine or supplement", "primary big", function () {
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

  var saveButton = add(form, "button", "Save", "primary big");
  saveButton.type = "submit";
  button(form, "Cancel", "secondary big", function () {
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
    recordChange("added", addition.name, { checked: Boolean(addition.rxcui) });
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
    button(row, "Undo", "secondary card-action", function () {
      delete state.data.stopped[entry.key];
      recordChange("unstopped", entry.name);
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
// Making the code takes about a second (the list is encrypted first). A
// second tap in that time is ignored, and the button says it's working.
var qrBusy = false;
var qrAfter = null;
async function openQr() {
  if (qrBusy || document.getElementById("qr-overlay")) return;
  qrBusy = true;
  var showButton = document.getElementById("show-qr");
  if (showButton) {
    showButton.textContent = "Getting your code…";
    showButton.setAttribute("aria-busy", "true");
  }
  try {
    await buildQr();
  } finally {
    qrBusy = false;
    if (showButton) {
      showButton.textContent = "Show my QR code";
      showButton.removeAttribute("aria-busy");
    }
  }
}

async function buildQr() {
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
  var titleRow = add(overlay, "div", null, "help-row");
  var title = add(titleRow, "h2", fits ? "Show this to the person checking your medicines" : "Your list is too long for one QR code");
  title.id = "qr-heading";
  if (fits) {
    var whatsIn = helpBubble(titleRow, "What's in this code?", function (panel) {
      add(panel, "p", "Your list from My medicines, as it is right now:");
      var items = add(panel, "ul");
      [
        "Your name and birth date",
        "Your current medicines from your records, with the dose, how often, and who prescribed them",
        "Medicines you added",
        "Medicines you marked stopped",
        "When the code was made, and a warning if the list is an older saved copy or some records didn't load"
      ].forEach(function (text) { add(items, "li", text); });
      add(panel, "p", "Older prescriptions aren't included. The list is inside the code itself, not on a server, so it works without signal. Change My medicines, and your next code shows the change.");
    });
    overlay.appendChild(whatsIn);
    var alert = changeAlert(state.data.changes, state.savedAt, new Date());
    if (alert) {
      var warning = add(overlay, "div", null, "qr-alert");
      warning.id = "qr-alert";
      add(warning, "p", alert.title, "qr-alert-title");
      add(warning, "p", alert.intro);
      var changed = add(warning, "ul");
      alert.lines.forEach(function (line) { add(changed, "li", line); });
      add(warning, "p", alert.advice);
      overlay.setAttribute("aria-describedby", "qr-alert");
    }
    var box = add(overlay, "div", null, "qr");
    box.appendChild(qrCanvas(packed.prefix, packed.digits));
    var sayRow = add(overlay, "div", null, "help-row");
    add(sayRow, "p", "After they scan it, tell them this code:", "qr-say");
    var why = helpBubble(sayRow, "Why tell them the code?", function (panel) {
      add(panel, "p", "The QR code holds your list, locked. These 6 digits are its key. After the person checking your medicines scans it, their screen asks for the digits, and telling them opens your list. Someone who only sees or takes a photo of the QR code can't read it.");
      add(panel, "p", "The digits stay hidden until you tap them, so people nearby can't see them. You get a new code each time.");
    });
    drawCodeReveal(overlay, packed.code);
    overlay.appendChild(why);
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
  history.pushState({ bb: "qr" }, "");
  document.getElementById("qr-close").focus();
}

// fromHistory is true when the Back button (or Close, through history.back)
// is what closes it.
function closeQr(after, fromHistory) {
  var overlay = document.getElementById("qr-overlay");
  if (!overlay || overlay.classList.contains("closing")) return;
  if (!fromHistory && history.state && history.state.bb === "qr") {
    if (overlay.dataset.leaving) return;
    overlay.dataset.leaving = "yes";
    qrAfter = after || null;
    history.back();
    return;
  }
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
    ? installTip(navigator.userAgent)
    : null;
  var notes = noticesFor({
    updating: state.updating,
    savedAt: state.savedAt,
    offline: state.offline,
    needsSignIn: state.needsSignIn,
    failed: state.split.failed,
    installTip: hint,
    now: new Date()
  });
  if (!notes.length) return;
  // One card, one short line per note. It's a live area, so VoiceOver
  // reads "Updating your list…" and what replaces it.
  var bar = add(root, "div", null, "notice-bar");
  bar.setAttribute("role", "status");
  notes.forEach(function (note) {
    var row = add(bar, "div", null, "notice-row notice-" + note.kind);
    add(row, "p", note.text);
    if (note.kind === "sign-in") {
      var update = add(row, "a", "Sign in", "button secondary");
      update.href = "./launch.html";
    }
    if (note.kind === "install") {
      var actions = add(row, "div", null, "notice-actions");
      button(actions, "How?", "secondary", function () {
        go("install", "install-heading");
      }).id = "install-how";
      button(actions, "Not now", "secondary", function () {
        dismissInstallHint(localStorage, new Date());
        state.focusId = "show-qr";
        render();
      });
    }
  });
}

// The Home Screen steps for this phone, and a way to put the tip away for
// good once they're done.
function drawInstall() {
  var top = add(root, "div", null, "screen-top");
  button(top, "Done", "secondary big", function () {
    go("home", "show-qr");
  }).id = "install-back";
  var title = add(root, "h1", "Add Brown Bag to your Home Screen");
  title.id = "install-heading";
  title.tabIndex = -1;
  note(root, "Brown Bag works best from your Home Screen. Your phone keeps its list safe there.");
  var steps = add(root, "ol", null, "install-steps");
  installSteps(navigator.userAgent).forEach(function (step) {
    add(steps, "li", step);
  });
  button(root, "I've done this", "primary big", function () {
    markInstallDone(localStorage);
    state.announce = "The Home Screen tip is put away.";
    go("home", "show-qr");
  }).id = "install-done";
}

// The backup stays encrypted. It also carries the lock settings (never the
// key), so it can be opened after the phone's storage is erased.
function drawBackup() {
  var section = add(root, "section");
  heading(section, "Backup", "backup-heading");
  note(section, "Save a backup file to Files or iCloud. If your phone ever erases Brown Bag's saved list, Restore brings it back.");
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
  plainScreen();
  add(root, "p", "Sign in to your health records to load your medicines.", "screen-text");
  if (error) {
    // The server's own wording is for developers; it goes to the console.
    console.error("Sign-in didn't finish", error);
    add(root, "p", "Sign-in didn't finish. Tap Sign in to try again.", "error");
  }
  var link = add(root, "a", "Sign in", "button primary big");
  link.href = "./launch.html";
  if (!state.key && !hasLock()) {
    drawRestoreFromSignIn();
  }
  note(root, DISCLAIMER);
}

// A new phone or the Home Screen app starts empty, with no lock. Its first
// screen is Sign in, so restoring a backup starts here too.
function drawRestoreFromSignIn() {
  var message = add(root, "p", "", "status");
  message.setAttribute("role", "status");
  var picker = add(root, "input");
  picker.type = "file";
  picker.accept = ".json,application/json";
  picker.hidden = true;
  button(root, "Restore from a backup", "secondary big", function () { picker.click(); });
  picker.addEventListener("change", async function () {
    var file = picker.files && picker.files[0];
    if (!file) return;
    try {
      var key = await restoreBackupText(root, await file.text());
      if (!key) {
        drawSignedOut(null);
        return;
      }
      state.key = key;
      startAutoLock();
      state.announce = "Your backup is restored. Sign in to load your medicines.";
      await signInUnavailable(null);
    } catch (error) {
      message.textContent = "That file isn't a Brown Bag backup.";
    }
  });
}

function drawNoConnection() {
  plainScreen();
  add(root, "p", "No connection, and no saved list on this phone yet. Connect once to save your list.", "notice");
}

function drawLoading() {
  plainScreen();
  var p = add(root, "p", "Loading your medicines…", "screen-text");
  p.setAttribute("role", "status");
}

// The sign-in, loading and no-connection screens: the bag at the top as the
// screen's heading, so a screen reader still reads "Brown Bag".
function plainScreen() {
  clear(root);
  root.className = "screen-plain";
  var title = add(root, "h1", null, "screen-title");
  var picture = add(title, "img", null, "screen-logo");
  picture.src = "icons/logo-trimmed.png";
  picture.alt = "Brown Bag";
  add(root, "p", TAGLINE, "tagline");
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

// An explanation, set apart from the instructions and buttons around it:
// "Note:" in bold, in a box with a teal bar down its left side.
// The 6 digits, blurred until tapped so people nearby can't read them. A
// second tap hides them again. VoiceOver reads them only once shown.
function drawCodeReveal(parent, digits) {
  var spoken = digits.split("").join(" ");
  var reveal = add(parent, "button", null, "code-reveal");
  reveal.type = "button";
  reveal.id = "code-reveal";
  var code = add(reveal, "span", digits, "share-code");
  var hint = add(reveal, "span", "", "code-hint");
  function show(shown) {
    reveal.classList.toggle("shown", shown);
    reveal.setAttribute("aria-expanded", String(shown));
    code.setAttribute("aria-hidden", String(!shown));
    hint.textContent = shown ? "Tap to hide the code" : "Tap to show the code";
    reveal.setAttribute("aria-label", shown ? "Code " + spoken + ". Tap to hide." : "Tap to show the code");
  }
  show(false);
  reveal.addEventListener("click", function () {
    show(!reveal.classList.contains("shown"));
  });
}

// A round "?" button that opens an explanation under it, as a note. The
// caller puts the returned panel where it should open.
var helpCount = 0;
function helpBubble(row, label, fill) {
  helpCount += 1;
  var panel = document.createElement("div");
  panel.className = "note help-panel";
  panel.id = "help-" + helpCount;
  panel.hidden = true;
  fill(panel);
  var ask = add(row, "button", "?", "help-button");
  ask.type = "button";
  ask.setAttribute("aria-label", label);
  ask.setAttribute("aria-expanded", "false");
  ask.setAttribute("aria-controls", panel.id);
  ask.addEventListener("click", function () {
    var opening = panel.hidden;
    panel.hidden = !opening;
    ask.setAttribute("aria-expanded", String(opening));
  });
  return panel;
}

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

function today() {
  return localDate(new Date());
}
