// Small pieces of the main screen that don't touch the page, so Node's
// tests can check them: names, the three groups, and the lines of text
// under each medicine.

import { listDate } from "./offline.js";

// FHIR Patient.name is a list. Prefer the official name, then the first one.
// given and family are optional, so don't read them without checking.
export function formatName(patient) {
  var names = patient && Array.isArray(patient.name) ? patient.name : [];
  var name = names.filter(function (entry) { return entry.use === "official"; })[0] || names[0];
  if (!name) {
    return "Name not recorded";
  }
  if (name.text) {
    return name.text;
  }
  var given = Array.isArray(name.given) ? name.given.join(" ") : "";
  return (given + " " + (name.family || "")).trim() || "Name not recorded";
}

// Current medicines the patient marked "Not taking" move to their own group
// (stoppedAt). Ones they marked "As needed" stay current, with asNeededAt,
// and show in the As needed group. Not taking wins if both are set. A mark
// for a medicine that is no longer current is ignored.
export function arrangeList(split, data) {
  var marks = (data && data.stopped) || {};
  var needed = (data && data.asNeeded) || {};
  var has = function (map, key) { return Object.prototype.hasOwnProperty.call(map, key); };
  var current = [];
  var stopped = [];
  split.current.forEach(function (entry) {
    // A fill-only card can answer to several keys (claims.js); a mark saved
    // under any of them counts.
    var keys = [entry.key].concat(entry.otherKeys || []);
    var marked = keys.filter(function (key) { return has(marks, key); })[0];
    var neededKey = keys.filter(function (key) { return has(needed, key); })[0];
    if (marked !== undefined) {
      stopped.push(Object.assign({}, entry, { key: marked, stoppedAt: marks[marked] }));
    } else if (neededKey !== undefined) {
      current.push(Object.assign({}, entry, { key: neededKey, asNeededAt: needed[neededKey] }));
    } else {
      current.push(entry);
    }
  });
  return { current: current, older: split.older, stopped: stopped };
}

// What goes on the QR code: older prescriptions are left off (spec).
export function shareListFrom(patient, arranged, additions) {
  return {
    patient: { name: patient.name, birthDate: patient.birthDate },
    current: arranged.current,
    additions: additions,
    stopped: arranged.stopped
  };
}

// Why "From your records" is empty, or null when it isn't.
export function emptyRecordsText(split, arranged) {
  // Medicines only the insurer knows about have their own section.
  var fromRecords = function (entry) { return entry.origin !== "claims"; };
  if (arranged.current.some(function (entry) { return fromRecords(entry) && !entry.asNeededAt; })) return null;
  if (arranged.current.some(fromRecords)) return "Your current medicines are under As needed.";
  if (arranged.stopped.some(fromRecords)) return "You've marked all the medicines from your records Not taking.";
  if (split.older.some(fromRecords)) return "No current medicines in your records.";
  return "No medicines in your records.";
}

// Where a medicine goes when "I stopped this" is undone.
export function backToList(entry) {
  return entry.origin === "claims"
    ? { name: "Filled, not in your records", focusId: "fills-heading" }
    : { name: "From your records", focusId: "records-heading" };
}

// A half-typed addition is kept while Brown Bag stays unlocked, so Done,
// Back or an update doesn't throw it away.
export function draftStarted(draft) {
  return Boolean(draft && (draft.name.trim() || draft.dose.choice || draft.often.choice));
}

export function unsavedText(draft) {
  return (draft.name.trim() || "The medicine you were adding") + " isn't saved yet. Open My medicines to finish adding it.";
}

export function makeAddition(input, now) {
  var name = String(input.name || "").trim();
  if (!name) {
    throw new Error("An addition needs a name.");
  }
  return {
    id: randomId(),
    rxcui: input.rxcui ? String(input.rxcui) : null,
    name: name,
    dose: blankToNull(input.dose),
    frequency: blankToNull(input.frequency),
    // Picked from the lists: the same answer as numbers, for the QR code.
    quantity: input.quantity || null,
    schedule: input.schedule || null,
    addedAt: localDate(now)
  };
}

// Wraps a search so only the newest call's answer counts. Typing "Ibupro"
// then "fen" starts two searches; if the first finishes later it must not
// be shown. cancel() marks everything in flight as old (the typing changed).
export function latestOnly(run) {
  var latest = 0;
  function call() {
    var mine = (latest += 1);
    return Promise.resolve(run.apply(null, arguments)).then(function (value) {
      return { value: value, isLatest: mine === latest };
    }, function (error) {
      if (mine === latest) throw error;
      return { value: null, isLatest: false };
    });
  }
  call.cancel = function () {
    latest += 1;
  };
  return call;
}

// The date on the phone's own calendar. toISOString would give the UTC
// date, which is already tomorrow on a US evening.
export function localDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function blankToNull(value) {
  var text = String(value || "").trim();
  return text || null;
}

function randomId() {
  var bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

// The number on the home screen's "My medicines" button: what the patient
// takes now, from records (not marked Not taking, As needed included) and their own additions.
export function medicineCount(arranged, additions) {
  return arranged.current.length + additions.length;
}

// Some of the medicines didn't load, or no record has a medicine name: no
// number anywhere, which would read as the whole.
export function medicinesPartial(state) {
  return someMissing(state) || Boolean(state.split.placeholders && !arrangeList(state.split, state.data).current.some(function (entry) { return entry.origin !== "claims" || entry.asNeededAt; }));
}

function someMissing(state) {
  return Boolean(state.split.failed || state.split.heldBack || state.dataFailed);
}

// What the QR code tells staff about what's missing, so a partial list never
// looks complete.
export function shareWarnings(state) {
  return {
    recordsSavedAt: state.savedAt,
    recordsUpdatedAt: state.updatedAt,
    claims: state.split.claims,
    incomplete: someMissing(state),
    ownMissing: state.dataFailed,
    unnamed: state.split.placeholders || 0,
    allergies: state.dataFailed ? { status: "failed", savedAt: null } : { status: state.allergies.status, savedAt: state.allergies.savedAt, updatedAt: state.allergies.updatedAt }
  };
}

export function medicinesButtonText(count, partial) {
  return partial ? "My medicines" : "My medicines (" + count + ")";
}

// How many medicines the name search found.
export function foundText(count) {
  if (!count) return "No matches. You can still add it.";
  return count === 1 ? "1 match. Pick it, or keep what you typed." : count + " matches. Pick one, or keep what you typed.";
}

// The notes at the top of the home screen, one short line each, only when
// needed, in order. While the list is updating, its date line waits.
export function noticesFor({ updating, savedAt, offline, needsSignIn, failed, dataFailed, allergiesRefused, installTip, now }) {
  var out = [];
  if (updating) {
    out.push({ kind: "updating", text: "Updating your list…" });
  } else if (savedAt && offline) {
    out.push({ kind: "offline", text: "No connection. List from " + listDate(savedAt, now) + "." });
  } else if (savedAt && needsSignIn) {
    out.push({ kind: "sign-in", text: "List from " + listDate(savedAt, now) + ". Sign in again to update it." });
  } else if (allergiesRefused) {
    out.push({ kind: "sign-in", text: "Sign in again to add your allergies." });
  }
  if (failed) out.push({ kind: "failed", text: "Some records didn't load." });
  if (dataFailed) out.push({ kind: "failed", text: "What you added couldn't be opened." });
  if (installTip) out.push({ kind: "install", text: installTip });
  return out;
}

// Changes the patient made while the records part was a saved copy (no
// fresh update since). A change that's undone cancels out.
var OPPOSITE = {
  stopped: "unstopped", unstopped: "stopped", added: "removed", removed: "added",
  "as-needed": "regular", regular: "as-needed",
  "allergy-added": "allergy-removed", "allergy-removed": "allergy-added",
  "none-said": "none-unsaid", "none-unsaid": "none-said"
};
export function logChange(changes, kind, name, extra) {
  var list = (changes || []).slice();
  if (kind.indexOf("reaction-") === 0) return logReaction(list, kind, name, extra);
  var edited = list.findIndex(function (c) { return c.name === name && c.kind === "edited"; });
  // A new one stays "Added", and one edited twice is one line.
  if (kind === "edited" && list.some(function (c) { return c.name === name && (c.kind === "added" || c.kind === "edited"); })) return list;
  if (kind === "removed" && edited !== -1) {
    list.splice(edited, 1);
    return list.concat({ kind: kind, name: name, was: "edited" });
  }
  for (var i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].name === name && list[i].kind === OPPOSITE[kind]) {
      var was = list[i].was;
      list.splice(i, 1);
      // Undo after removing an edited one: the edit still counts.
      return was ? list.concat({ kind: was, name: name }) : list;
    }
  }
  list.push(Object.assign({ kind: kind, name: name }, extra || {}));
  return list;
}

// One line per reaction, saying what changed since the records were updated:
// added, changed or removed. "reaction-restored" is Undo after a removal.
function logReaction(list, kind, name, extra) {
  var at = function (k) { return list.findIndex(function (c) { return c.kind === k && c.name === name; }); };
  var entry = function (k, more) { return Object.assign({ kind: k, name: name }, extra || {}, more || {}); };
  var added = at("reaction-added");
  var changed = at("reaction-changed");
  var removed = at("reaction-removed");
  if (kind === "reaction-restored") {
    if (removed === -1) return list.concat(entry("reaction-added"));
    var was = list[removed].was;
    list.splice(removed, 1);
    return was ? list.concat(entry(was)) : list;
  }
  if (kind === "reaction-removed") {
    if (added !== -1) {
      list.splice(added, 1);
      return list;
    }
    if (changed !== -1) {
      list.splice(changed, 1);
      return list.concat(entry(kind, { was: "reaction-changed" }));
    }
    return removed === -1 ? list.concat(entry(kind)) : list;
  }
  if (kind === "reaction-changed" && (added !== -1 || changed !== -1)) return list;
  return added === -1 ? list.concat(entry(kind)) : list;
}

// Said when an update ends with nothing else to say.
export function updateDoneText(allergyStatus) {
  return allergyStatus === "failed"
    ? "Your medicines are up to date. Your allergies couldn't be updated."
    : "Your list is up to date.";
}

function partOf(change) {
  return change.part || "medicines";
}

// The log after one part was updated from the records: that part's changes
// no longer need a warning.
export function keepChanges(changes, updatedPart) {
  return (changes || []).filter(function (change) { return partOf(change) !== updatedPart; });
}

function changeLine(change) {
  switch (change.kind) {
    case "stopped": return "Marked " + change.name + " Not taking";
    case "unstopped": return "Put " + change.name + " back on your list";
    case "as-needed": return "Marked " + change.name + " As needed";
    case "regular": return "Took " + change.name + " off As needed";
    case "edited": return "Changed " + change.name;
    case "removed": return "Removed " + change.name;
    case "allergy-added": return "Added the allergy " + change.name;
    case "allergy-removed": return (change.record ? "Removed your entry for " : "Removed the allergy ") + change.name;
    case "reaction-added": return "Added a reaction to " + change.name;
    case "reaction-changed": return "Changed your reaction to " + change.name;
    case "reaction-removed": return "Removed your reaction to " + change.name;
    case "none-said": return "Said you have no known allergies";
    case "none-unsaid": return "Took back that you have no known allergies";
    default: return "Added " + change.name + (change.checked === false ? " (name not checked)" : "");
  }
}

// The alert on the QR screen when the list was changed while it was a saved
// copy: what changed, and that the records part needs a connection. Medicines
// and allergies update on their own, so each has its own saved date (or null
// when it's fresh).
export function changeAlert(changes, saved, now) {
  var shown = (changes || []).filter(function (change) { return saved[partOf(change)]; });
  if (!shown.length) {
    return null;
  }
  var parts = ["medicines", "allergies"].filter(function (part) {
    return shown.some(function (change) { return partOf(change) === part; });
  });
  var when = listDate(parts.map(function (part) { return saved[part]; }).sort()[0], now);
  return {
    title: "This code isn't fully up to date",
    intro: "It includes the changes you made since your records were last updated on " + when + ":",
    lines: shown.map(changeLine),
    advice: "Your " + parts.join(" and ") + " from your records are from " + when + ". Get a connection and open Brown Bag again to update them, then show a new code."
  };
}

// Where the QR code comes out from: the bag, measured from the middle of the
// screen, and never past its edge (home can be scrolled with large text).
export function swooshFrom(bag, width, height) {
  var within = function (value, most) { return Math.max(-most, Math.min(most, value)); };
  return {
    x: within(bag.left + bag.width / 2 - width / 2, width / 2),
    y: within(bag.top + bag.height * 0.35 - height / 2, height / 2)
  };
}
