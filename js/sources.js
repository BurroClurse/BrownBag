// Where a patient's records can come from (design 2026-11-23, sign-in list).
// Only a connected one can be signed in to; the others are names only. To
// turn one on, build its sign-in, then change its line here. No DOM here, so
// Node's test runner can check it.

// Aetna may join the list later (Tyler, 2026-11-23), once its terms about
// using its name are settled.
export const SOURCES = [
  { id: "smart-sandbox", name: "SMART Health IT sandbox", note: "Test patients only", connected: true },
  { id: "epic", name: "Epic®", kind: "Health systems", connected: false },
  { id: "oracle-health", name: "Oracle® Health", kind: "Health systems", connected: false },
  { id: "meditech", name: "MEDITECH", kind: "Health systems", connected: false },
  { id: "medicare", name: "Medicare", kind: "Insurance", connected: false },
  { id: "medicaid", name: "Medicaid", kind: "Insurance", connected: false }
];

// The words their owners ask for (read 2026-11-23, listed in the design).
export const TRADEMARKS = "Epic is a trademark of Epic Systems Corporation. Oracle is a registered trademark of Oracle and/or its affiliates. Other names may be trademarks of their respective owners. Brown Bag isn't affiliated with or endorsed by any of them, or by any government agency.";

export function connected() {
  return SOURCES.filter(function (source) { return source.connected; });
}

export function notConnected() {
  var groups = [];
  SOURCES.forEach(function (source) {
    if (source.connected) return;
    var group = groups.filter(function (g) { return g.kind === source.kind; })[0];
    if (!group) groups.push(group = { kind: source.kind, names: [] });
    group.names.push(source.name);
  });
  return groups;
}

// Straight to the source the patient already uses.
export function signInLink() {
  return "./launch.html?source=" + connected()[0].id;
}

// What the screen under More options says about the connected source. A date
// never vouches for a part that didn't all load.
export function recordsStatus(state, format) {
  var allergies = state.allergies;
  var meds = state.savedAt || state.updatedAt;
  var allergyDate = allergies.savedAt || (allergies.status === "loaded" ? allergies.updatedAt : null);
  var rows = [
    state.split.failed || state.split.heldBack ? ["Meds", "Some didn't load"] : meds ? ["Meds last updated", format(meds)] : ["Meds", "Not loaded"],
    allergyDate ? ["Allergies last updated", format(allergyDate)] : ["Allergies", "Not loaded"]
  ];
  var note = null;
  var signIn = false;
  if (state.updating) {
    note = "Updating your list…";
  } else if (state.offline) {
    note = "Couldn't update. This is the last list that loaded.";
  } else if (state.needsSignIn) {
    note = "Sign in again to update your list.";
    signIn = true;
  } else if (allergies.status === "refused") {
    note = "Sign in again to add your allergies.";
    signIn = true;
  }
  return { rows: rows, note: note, signIn: signIn };
}

// What launch.html does. A link that names its own server (the README's test
// patients, the SMART Launcher) or a connected source signs in; anything else
// shows the list, so an odd address never starts a sign-in.
export function startFor(search) {
  var params = new URLSearchParams(search);
  if (params.get("iss")) return "sign-in";
  var id = params.get("source");
  return connected().some(function (source) { return source.id === id; }) ? "sign-in" : "list";
}

// Whether a choice on the list needs a fresh page: the sign-in library reads
// the address (a server left in it would win over the choice), and keeps the
// address and the answers of an earlier try.
export function needsFreshPage(search, tries) {
  return Boolean(search) || tries > 0;
}

export function leavingText(search) {
  return new URLSearchParams(search).get("iss")
    ? "You are leaving this page for your health system's sign-in page. After you sign in, it sends you back here."
    : "You are leaving this page for the SMART sandbox. Sign in there as the patient, then the sandbox sends you back here.";
}
