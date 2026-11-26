// Where a patient's records can come from (design 2026-11-23, sign-in list).
// Only a connected one can be signed in to; the others are names only. To
// turn one on, build its sign-in, then change its line here. No DOM here, so
// Node's test runner can check it.

import { OWN_LIST, knownPatient } from "./test-patients.js";

// Aetna may join the list later (the developer, 2026-11-23), once its terms about
// using its name are settled.
export const SOURCES = [
  { id: "smart-sandbox", name: "SMART Health IT sandbox", note: "Test patients only", connected: true },
  { id: "epic", name: "Epic®", kind: "Health systems", connected: false },
  { id: "oracle-health", name: "Oracle® Health", kind: "Health systems", connected: false },
  { id: "meditech", name: "MEDITECH", kind: "Health systems", connected: false },
  { id: "medicare", name: "Medicare", kind: "Insurance", connected: false },
  { id: "medicaid", name: "Medicaid", kind: "Insurance", connected: false },
  { id: "pharmacies", name: "Pharmacy fills", kind: "Pharmacies", connected: false }
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

// To the source the patient already uses: straight in as the same person when
// they're on its list, else its list.
export function signInLink(patientId) {
  return "./launch.html?source=" + connected()[0].id + (patientId === OWN_LIST || knownPatient(patientId) ? "&as=" + patientId : "");
}

// The test patient an address asks for ("list" for the sandbox's own page), or
// null.
export function chosen(search) {
  var params = new URLSearchParams(search);
  var id = params.get("as");
  return connectedId(params.get("source")) && (id === OWN_LIST || knownPatient(id)) ? id : null;
}

function connectedId(id) {
  return connected().some(function (source) { return source.id === id; });
}

// What the screen under More options says about the connected source. A date
// never vouches for a part that didn't all load.
export function recordsStatus(state, format) {
  var allergies = state.allergies;
  var meds = state.savedAt || state.updatedAt;
  var allergyDate = allergies.savedAt || (allergies.status === "loaded" ? allergies.updatedAt : null);
  var rows = [
    state.split.failed || state.split.heldBack ? ["Meds", "Some didn't load"] : meds ? ["Meds last updated", format(meds)] : ["Meds", "Not loaded"],
    allergyDate ? ["Allergies last updated", format(allergyDate)] : ["Allergies", "Not loaded"],
    fillsRow(state.split, meds, format)
  ];
  var note = null;
  var signIn = false;
  if (state.updating) {
    note = "Checking your health records…";
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

// Insurance fills load and are saved with the medicines, so they share a date.
function fillsRow(split, date, format) {
  var known = date && !split.failed;
  if (known && split.claims === "loaded") return ["Insurance fills last updated", format(date)];
  if (known && split.claims === "none") return ["Insurance fills", "None found, " + format(date)];
  return ["Insurance fills", split.claims === "refused" ? "Sign in again to add them" : "Not loaded"];
}

// What launch.html does. A link that names its own server (the test
// patients in docs/SANDBOXES.md, the SMART Launcher) or a chosen patient
// signs in. A connected source shows its patients; anything else the
// sources, so an odd address never starts a sign-in.
export function startFor(search) {
  var params = new URLSearchParams(search);
  if (params.get("iss")) return "sign-in";
  if (chosen(search)) return "sign-in";
  return connectedId(params.get("source")) ? "patients" : "list";
}

export function leavingText(search) {
  var id = chosen(search);
  if (id && id !== OWN_LIST && startFor(search) === "sign-in" && !new URLSearchParams(search).get("iss")) {
    return "You are leaving this page for the SMART sandbox. Approve Brown Bag there, then the sandbox sends you back here.";
  }
  return new URLSearchParams(search).get("iss")
    ? "You are leaving this page for your health system's sign-in page. After you sign in, it sends you back here."
    : "You are leaving this page for the SMART sandbox. Sign in there as the patient, then the sandbox sends you back here.";
}

// Back from "Starting sign-in…" or "Couldn't start sign-in" is the list, so a
// chosen patient's step stays in history (the developer, Task 10d). Forward to it must
// not start the sign-in by itself, so the step notes on its own history.state
// that it has started (markStarted). A fresh load of a noted step, and any
// sign-in step brought back as it was left (restored: pageshow with
// persisted), shows "Couldn't start sign-in" again, the screen it was left
// on; Try again takes the note off (clearStarted) and reloads, so it's the
// same patient. A picker is never drawn on a chosen patient's step, so a
// choice can't pile up steps there. steps is history.
export var SIGN_IN_STARTED = "brownBagSignInStarted";

export function launchScreen(search, steps, restored) {
  var start = startFor(search);
  if (start !== "sign-in") return start;
  return restored || startedHere(steps) ? "failed" : "sign-in";
}

export function markStarted(steps) {
  var state = {};
  state[SIGN_IN_STARTED] = true;
  try { steps.replaceState(state, ""); } catch (error) { /* Forward starts it again, as before */ }
}

export function clearStarted(steps) {
  try { steps.replaceState(null, ""); } catch (error) { /* nothing was kept */ }
}

function startedHere(steps) {
  try {
    var state = steps.state;
    return Boolean(state && typeof state === "object" && state[SIGN_IN_STARTED] === true);
  } catch (error) {
    return false;
  }
}
