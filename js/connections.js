// The connections screen's choices (design 2026-11-25): where a sign-in comes
// back to, and what the screen says. No DOM here, so Node's test runner can
// check it.
//
// Leaving for a sign-in page drops the lock's key, so where the patient was
// going rides in sessionStorage, which the browser keeps only for this tab.

export var RETURN_KEY = "brownbag:after-sign-in";

// home: the note on home started it. setup: the first run, or a link from
// outside. more: Health records under More options.
var PLACES = ["home", "setup", "more"];

export function keepReturn(storage, where) {
  if (PLACES.indexOf(where) === -1) return;
  try {
    storage.setItem(RETURN_KEY, where);
  } catch (error) {
    // Not kept: the sign-in comes back to setting up, which always works.
  }
}

// Read once: a later sign-in from somewhere else isn't sent here.
export function takeReturn(storage) {
  var where = null;
  try {
    where = storage.getItem(RETURN_KEY);
    storage.removeItem(RETURN_KEY);
  } catch (error) {
    where = null;
  }
  return PLACES.indexOf(where) === -1 ? "setup" : where;
}

// The address Sign out and launch.html use to come here.
export function wantsConnections(search) {
  return new URLSearchParams(search).get("open") === "connections";
}

// done: "home" (setting up, once something is connected), "back" (to More
// options), or null (setting up, nothing connected yet).
export function connectionsView({ from, connected, online }) {
  var more = from === "more";
  return {
    heading: more ? "Health records" : "Connect your health records",
    intro: more ? null : "Connect each place that has your medicines. You can add more later under More options.",
    done: more ? "back" : connected ? "home" : null,
    offline: online ? null : "No connection. Connect once you have signal."
  };
}
