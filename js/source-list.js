// The sources Brown Bag isn't connected to: names only, grey, nothing to tap.
// The list before sign-in (js/launch.js) and the one under More options
// (js/app.js) draw it the same way.

import { TRADEMARKS, notConnected } from "./sources.js";

export function drawNotConnected(parent) {
  var section = add(parent, "section", null, "not-connected");
  add(section, "h2", "Not connected");
  add(section, "p", "Brown Bag isn't connected to these. It may add them later.");
  var list = add(section, "dl", null, "facts");
  notConnected().forEach(function (group) {
    var row = add(list, "div");
    add(row, "dt", group.kind);
    // A line each; the space keeps them apart for a screen reader.
    var names = add(row, "dd");
    group.names.forEach(function (name) {
      add(names, "span", name);
      names.appendChild(document.createTextNode(" "));
    });
  });
  var about = add(parent, "details", null, "about-names");
  add(about, "summary", "About these names");
  add(about, "p", TRADEMARKS, "fine-print");
}

function add(parent, tag, text, className) {
  var element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}
