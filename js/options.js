// What More options offers, in groups. No DOM in optionGroups, so Node's test
// runner can check it; drawOptions puts it on the screen.

// Simple line drawings, 24 by 24. Decoration: the words say it too.
export const ICONS = {
  records: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  save: "M12 4v10M8 10l4 4 4-4M5 17v3h14v-3",
  restore: "M5 4v5h5M5.5 9A8 8 0 1 1 4 13",
  privacy: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4",
  phone: "M8 3h8v18H8zM11 18h2",
  out: "M13 4H6v16h7M10 12h10M17 8.5l3.5 3.5-3.5 3.5"
};

export function recordsLine(status) {
  return status.note || status.rows[0].join(": ");
}

export function optionGroups({ status, homeScreen }) {
  var groups = [
    { rows: [{ id: "open-records", icon: "records", name: "Health records", detail: recordsLine(status), opens: true }] },
    { title: "Backup", titleId: "backup-heading", rows: [
      { id: "save-backup", icon: "save", name: "Save a backup", detail: "Keep a locked copy of your list." },
      { id: "restore-backup", icon: "restore", name: "Restore a backup", detail: "Get your list back from a copy." }
    ] }
  ];
  var about = [];
  if (homeScreen) about.push({ id: "open-install", icon: "phone", name: "Add to Home Screen", detail: "Open Brown Bag like an app.", opens: true });
  about.push({ id: "open-privacy", icon: "privacy", name: "Privacy", detail: "What's kept and who sees it.", opens: true });
  groups.push({ rows: about });
  groups.push({ rows: [{ id: "sign-out", icon: "out", kind: "stop", name: "Sign out", detail: "For everyone who signed in on this phone. Saved lists stay on this phone, locked." }] });
  return groups;
}

// actions: what each option does, by its id; each gets its own button.
export function drawOptions(parent, groups, actions) {
  groups.forEach(function (group) {
    var section = add(parent, "section", null, "option-group");
    if (group.title) {
      var title = add(section, "h2", group.title, "option-title");
      title.id = group.titleId;
      title.tabIndex = -1;
    }
    var card = add(section, "div", null, "option-card");
    group.rows.forEach(function (row) {
      var button = add(card, "button", null, "option" + (row.kind ? " option-" + row.kind : ""));
      button.type = "button";
      button.id = row.id;
      icon(button, ICONS[row.icon], "option-icon");
      var words = add(button, "span", null, "option-words");
      add(words, "span", row.name, "option-name");
      // The space keeps the two lines apart for a screen reader.
      words.appendChild(document.createTextNode(" "));
      add(words, "span", row.detail, "option-detail");
      if (row.opens) icon(button, "M9 5l7 7-7 7", "option-opens");
      button.addEventListener("click", function () { actions[row.id](button); });
    });
  });
}

function icon(parent, path, className) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  var line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", path);
  svg.appendChild(line);
  parent.appendChild(svg);
}

function add(parent, tag, text, className) {
  var element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  parent.appendChild(element);
  return element;
}
