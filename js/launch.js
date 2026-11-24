// launch.html's screen: the list of sources, then sign-in. startSignIn() is
// in launch.html, with the SMART settings.

import { TRADEMARKS, connected, leavingText, needsFreshPage, notConnected, signInLink, startFor } from "./sources.js";
import { withTimeout } from "./pass.js";

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

function back(className) {
  add(root, "a", "Back", "button " + className).href = "./";
}

function showList() {
  root.textContent = "";
  var h = title("Choose where your records are");
  connected().forEach(function (source) {
    var button = add(root, "button", source.name, "primary big");
    button.type = "button";
    button.setAttribute("aria-describedby", "source-note-" + source.id);
    button.addEventListener("click", choose);
    add(root, "p", source.note, "source-note").id = "source-note-" + source.id;
  });
  var section = add(root, "section", null, "not-connected");
  add(section, "h2", "Not connected");
  add(section, "p", "Brown Bag isn't connected to these. It may add them later.");
  notConnected().forEach(function (group) {
    add(section, "h3", group.kind);
    var list = add(section, "ul");
    group.names.forEach(function (name) { add(list, "li", name); });
  });
  back("secondary big");
  add(root, "p", TRADEMARKS, "fine-print");
  h.focus();
}

// Counts sign-ins started. A slow one answering after the patient has gone
// Back must not take the page away, or put its error over the list.
var tries = 0;
var SIGN_IN_WAIT_MS = 12000;

function choose() {
  if (needsFreshPage(location.search, tries)) location.replace(signInLink());
  else signIn();
}

function signIn() {
  tries += 1;
  var mine = tries;
  root.textContent = "";
  title("Starting sign-in…").focus();
  add(root, "p", leavingText(location.search));
  back("secondary big");
  withTimeout(window.startSignIn(), SIGN_IN_WAIT_MS).then(function (url) {
    if (mine !== tries) return;
    // Back then comes to the list, and never starts the sign-in again.
    history.replaceState(null, "", "./launch.html");
    location.href = url;
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
    if (startFor(location.search) === "sign-in") location.reload();
    else location.replace(signInLink());
  });
  back("secondary big");
}

// Gone from this page: whatever was being waited for no longer counts.
window.addEventListener("pagehide", function () { tries += 1; });
// Back can bring this page as it was left, mid "Starting".
window.addEventListener("pageshow", function (event) {
  if (event.persisted) showList();
});

if (startFor(location.search) === "sign-in") signIn();
else showList();
