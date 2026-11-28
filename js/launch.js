// launch.html's screen: the list of sources, then sign-in. startSignIn() is
// in launch.html, with the SMART settings.

import { browseLink, chosen, clearStarted, launchScreen, leavingText, markStarted, signInLink, startFor } from "./sources.js";
import { GROUPS, OWN_LIST, sandboxServer } from "./test-patients.js";
import { PATIENTS } from "./sandbox-patients.js";
import { DEFAULT_SORT, PAGE, SORTS, askAdded, findPatients, matchesName, rowLines } from "./browse.js";
import { withTimeout } from "./pass.js";
import { SCOPES_V1, scopesFor, smartConfigUrl } from "./scopes.js";
import { bornText } from "./card.js";
import { hasSavedList } from "./offline.js";
import { SIGNED_OUT_KEY, offerSaved } from "./signed-out.js";

window.brownBagStarted = true;
try { sessionStorage.removeItem("brownbag:retried"); } catch (error) { /* not needed */ }

var root = document.getElementById("launch");

function add(parent, tag, text, className) {
  var node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  parent.appendChild(node);
  return node;
}

function title(text) {
  var h = add(root, "h1", text);
  h.tabIndex = -1;
  return h;
}

// Back to the connections screen, which the sign-in was started from.
function back(className) {
  add(root, "a", "Back", "button " + className).href = "./?open=connections";
}

// The list of sources is the app's connections screen now (design
// 2026-11-25), after the lock. A plain launch.html goes there.
function showList() {
  location.replace("./?open=connections");
}

// Counts sign-ins started. A slow one answering after the patient has gone
// Back must not take the page away, or put its error over the list.
var tries = 0;
var SIGN_IN_WAIT_MS = 12000;
// The server's SMART configuration says whether it knows v2 scopes. Its own
// limit leaves time for the sign-in within SIGN_IN_WAIT_MS.
var CONFIG_WAIT_MS = 5000;

// The sandbox's test patients. Each choice is a fresh page: the sign-in library
// reads the address, and keeps an earlier try's answers. It's its own history
// step after the list's, so Back while sign-in is starting, or from "Couldn't
// start sign-in", is the list (the developer, Task 10d). Once the sandbox's address is
// known, the sandbox takes the choice's step, so Back from the sandbox comes
// to the list once, then the connections screen. Forward to a choice's step
// after Back shows "Couldn't start sign-in", never a new start
// (launchScreen).
function showPatients() {
  root.textContent = "";
  var top = add(root, "div", null, "screen-top");
  add(top, "a", "Back", "button secondary big").href = "./?open=connections";
  var h = title("Choose a test patient");
  add(root, "p", "All of them are made up.");
  GROUPS.forEach(function (group) {
    var section = add(root, "section", null, "option-group");
    add(section, "h2", group.title, "option-title");
    var card = add(section, "div", null, "option-card");
    group.patients.forEach(function (patient) {
      patientButton(card, patient.name, bornText(patient.born) + ". " + patient.about + ".", function () { location.href = signInLink(patient.id); });
    });
  });
  var other = add(add(root, "section", null, "option-group"), "div", null, "option-card");
  patientButton(other, "Browse all patients", "Search and sort the sandbox's " + PATIENTS.length + " patients with medicines.", function () { location.href = browseLink(); });
  h.focus();
}

// Browse all patients (design 2026-11-28): the saved list of the sandbox's
// patients with a medicine record, searched by name and sorted, 20 at a time,
// or, for Added by other people, the sandbox asked live. The search, the sort
// and how many are showing stay in this step's history state, so Back from
// the sandbox comes back to the same place.
var LIVE_WAIT_MS = 12000;
var NO_MATCH = "No one by that name. Check the spelling, or clear the search.";
var NONE_ADDED = "No one added by other people has medicines right now.";
var added = null;
var pending = null;

function browseState() {
  var kept = history.state && history.state.browse;
  var sorts = SORTS.map(function (s) { return s.id; });
  return {
    query: kept && typeof kept.query === "string" ? kept.query : "",
    sort: kept && sorts.indexOf(kept.sort) !== -1 ? kept.sort : DEFAULT_SORT,
    shown: kept && kept.shown > PAGE ? Math.floor(kept.shown) : PAGE
  };
}

function showBrowse() {
  var state = browseState();
  root.textContent = "";
  var top = add(root, "div", null, "screen-top");
  add(top, "a", "Back", "button secondary big").href = signInLink();
  var h = title("Browse all patients");
  var intro = add(root, "p");
  var controls = add(root, "div", null, "browse-controls");
  var searchLabel = add(controls, "label", "Search by name");
  searchLabel.htmlFor = "browse-search";
  var search = add(controls, "input");
  search.type = "search";
  search.id = "browse-search";
  search.autocomplete = "off";
  search.spellcheck = false;
  search.value = state.query;
  var sortLabel = add(controls, "label", "Sort by");
  sortLabel.htmlFor = "browse-sort";
  var select = add(controls, "select");
  select.id = "browse-sort";
  SORTS.forEach(function (s) {
    var option = add(select, "option", s.label);
    option.value = s.id;
  });
  select.value = state.sort;
  var status = add(root, "p", null, "browse-count");
  status.setAttribute("role", "status");
  var card = add(root, "div", null, "option-card");
  var more = add(root, "button", "Show more", "secondary big");
  more.type = "button";
  var sort = state.sort;

  function keep() {
    try { history.replaceState({ browse: { query: search.value, sort: select.value, shown: state.shown } }, ""); } catch (error) { /* only Back's place is lost */ }
  }

  function draw(focusFrom) {
    sort = select.value;
    var live = sort === "added";
    intro.textContent = live ? "Added to the sandbox by other people. They may be gone after its nightly reset." : PATIENTS.length + " made-up patients with medicines.";
    card.textContent = "";
    more.hidden = true;
    if (live && !added) {
      status.textContent = "Asking the sandbox…";
      card.hidden = true;
      loadAdded().then(function () { if (select.value === "added") draw(); }).catch(function () {
        // Another try may have loaded it meanwhile; never draw over a list.
        if (select.value !== "added" || added) return;
        status.textContent = "Couldn't reach the sandbox.";
        card.textContent = "";
        card.hidden = false;
        add(card, "p", "Couldn't reach the sandbox.", "error browse-empty");
        var again = add(card, "button", "Try again", "primary big");
        again.type = "button";
        again.addEventListener("click", function () { draw(); h.focus(); });
      });
      return;
    }
    card.hidden = false;
    var found = live ? added.filter(function (patient) { return matchesName(patient, search.value); }) : findPatients(PATIENTS, search.value, sort);
    var showing = found.slice(0, live ? found.length : state.shown);
    if (!found.length) {
      status.textContent = live && !search.value.trim() ? NONE_ADDED : NO_MATCH;
      add(card, "p", status.textContent, "browse-empty");
      keep();
      return;
    }
    status.textContent = "Showing " + showing.length + " of " + found.length + ".";
    var buttons = showing.map(function (patient) {
      var lines = rowLines(patient, sort);
      return patientButton(card, lines.name, lines.detail, function () {
        keep();
        location.href = signInLink(patient.id, sort === "added");
      });
    });
    more.hidden = showing.length >= found.length;
    keep();
    if (focusFrom !== undefined && buttons[focusFrom]) buttons[focusFrom].focus();
  }

  search.addEventListener("input", function () { state.shown = PAGE; draw(); });
  select.addEventListener("change", function () { state.shown = PAGE; draw(); });
  more.addEventListener("click", function () {
    var from = state.shown;
    state.shown += PAGE;
    draw(from);
  });
  draw();
  h.focus();
}

// Patients other people added that have a medicine record, newest first.
// One request at a time: typing or switching sorts while it's out waits for
// the same answer.
function loadAdded() {
  if (!pending) {
    pending = askAdded(globalThis.fetch.bind(globalThis), function (promise) { return withTimeout(promise, LIVE_WAIT_MS); })
      .then(function (found) { added = found; })
      .finally(function () { pending = null; });
  }
  return pending;
}

function patientButton(card, name, detail, go) {
  var button = add(card, "button", null, "option");
  button.type = "button";
  var words = add(button, "span", null, "option-words");
  add(words, "span", name, "option-name");
  // The space keeps the two lines apart for a screen reader.
  words.appendChild(document.createTextNode(" "));
  add(words, "span", detail, "option-detail");
  button.addEventListener("click", go);
  return button;
}

function signIn() {
  tries += 1;
  var mine = tries;
  root.textContent = "";
  title("Starting sign-in…").focus();
  add(root, "p", leavingText(location.search));
  back("secondary big");
  // So Forward to this step after Back doesn't start it again by itself.
  markStarted(history);
  var server = sandboxServer(chosen(location.search) || OWN_LIST, new URLSearchParams(location.search).get("added") === "1");
  // A link's own iss wins in the sign-in library, so its scopes follow it.
  var asked = new URLSearchParams(location.search).get("iss") || server;
  withTimeout(chooseScopes(asked).then(function (scope) { return window.startSignIn(server, scope); }), SIGN_IN_WAIT_MS).then(function (url) {
    if (mine !== tries) return;
    // Back then comes to the list, and never starts the sign-in again.
    if (chosen(location.search)) {
      location.replace(url);
    } else {
      // A link that named its own server: Back is the connections screen.
      history.replaceState(null, "", "./launch.html");
      location.href = url;
    }
  }).catch(function (error) {
    if (mine !== tries) return;
    // The library's own wording is for developers; it goes to the console.
    console.error("Couldn't start sign-in", error);
    showFailed();
  });
}

// v2 scopes when the server lists permission-v2; v1, as before, when it
// doesn't or its configuration can't be read (design 2026-11-28).
function chooseScopes(server) {
  return withTimeout(fetch(smartConfigUrl(server), { headers: { Accept: "application/json" } }).then(function (response) {
    if (!response.ok) throw new Error("No SMART configuration: " + response.status);
    return response.json();
  }), CONFIG_WAIT_MS).then(scopesFor).catch(function () { return SCOPES_V1; });
}

function showFailed() {
  root.textContent = "";
  title("Couldn't start sign-in").focus();
  add(root, "p", "Check your connection, then try again.", "error");
  var again = add(root, "button", "Try again", "primary big");
  again.type = "button";
  // A fresh page: the library keeps the failed answer and would give it
  // again. A link that named its own server is tried again as it is.
  again.addEventListener("click", function () {
    if (startFor(location.search) === "sign-in") {
      clearStarted(history);
      location.reload();
    } else {
      location.replace(signInLink());
    }
  });
  if (offerSaved({ signedOut: localStorage.getItem(SIGNED_OUT_KEY), saved: hasSavedList(localStorage) })) {
    add(root, "p", "You can still open the list saved on this phone.");
    add(root, "a", "Open my saved list", "button secondary big").href = "./?open=saved";
  }
  back("secondary big");
}

// Gone from this page: whatever was being waited for no longer counts.
window.addEventListener("pagehide", function () { tries += 1; });
// Back or Forward can bring this page as it was left, mid "Starting" or on
// "Couldn't start sign-in". A chosen patient's step then says it couldn't
// start, with Try again, and never draws the picker there.
window.addEventListener("pageshow", function (event) {
  if (event.persisted) showScreen(launchScreen(location.search, history, true));
});

function showScreen(screen) {
  if (screen === "sign-in") signIn();
  else if (screen === "failed") showFailed();
  else if (screen === "patients") showPatients();
  else if (screen === "browse") showBrowse();
  else showList();
}

showScreen(launchScreen(location.search, history, false));
