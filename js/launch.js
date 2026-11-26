// launch.html's screen: the list of sources, then sign-in. startSignIn() is
// in launch.html, with the SMART settings.

import { chosen, clearStarted, launchScreen, leavingText, markStarted, signInLink, startFor } from "./sources.js";
import { GROUPS, OWN_LIST, sandboxServer } from "./test-patients.js";
import { withTimeout } from "./pass.js";
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
  patientButton(other, "Someone else", "The sandbox's own list. It shows ten.", function () { location.href = signInLink(OWN_LIST); });
  h.focus();
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
  withTimeout(window.startSignIn(sandboxServer(chosen(location.search) || OWN_LIST)), SIGN_IN_WAIT_MS).then(function (url) {
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
  else showList();
}

showScreen(launchScreen(location.search, history, false));
