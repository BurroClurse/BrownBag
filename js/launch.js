// launch.html's screen: the list of sources, then sign-in. startSignIn() is
// in launch.html, with the SMART settings.

import { TRADEMARKS, connected, notConnected, signInLink, startFor } from "./sources.js";

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
    var choose = add(root, "button", source.name, "primary big");
    choose.type = "button";
    choose.setAttribute("aria-describedby", "source-note-" + source.id);
    choose.addEventListener("click", signIn);
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

function signIn() {
  root.textContent = "";
  title("Starting sign-in…").focus();
  add(root, "p", "You are leaving this page for the SMART sandbox. Sign in there as the patient, then the sandbox sends you back here.");
  window.startSignIn().catch(function (error) {
    // The library's own wording is for developers; it goes to the console.
    console.error("Couldn't start sign-in", error);
    root.textContent = "";
    title("Couldn't start sign-in").focus();
    add(root, "p", "The sandbox didn't answer. Check your connection, then try again.", "error");
    var again = add(root, "button", "Try again", "primary big");
    again.type = "button";
    // A fresh page: the library keeps the failed answer and would give it
    // again. A link that named its own server is tried again as it is.
    again.addEventListener("click", function () {
      if (startFor(location.search) === "sign-in") location.reload();
      else location.href = signInLink();
    });
    back("secondary big");
  });
}

// Back from the sandbox can bring this page as it was left, mid "Starting".
window.addEventListener("pageshow", function (event) {
  if (event.persisted) showList();
});

if (startFor(location.search) === "sign-in") signIn();
else showList();
