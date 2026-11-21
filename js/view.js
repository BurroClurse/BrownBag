// Small pieces of the main screen that don't touch the page, so Node's
// tests can check them: names, the three groups, and the lines of text
// under each medicine.

import { savedNotice } from "./offline.js";

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

// Current medicines the patient marked stopped move to their own group.
// A mark for a medicine that is no longer current is ignored.
export function arrangeList(split, data) {
  var marks = (data && data.stopped) || {};
  var current = [];
  var stopped = [];
  split.current.forEach(function (entry) {
    if (Object.prototype.hasOwnProperty.call(marks, entry.key)) {
      stopped.push(Object.assign({}, entry, { stoppedAt: marks[entry.key] }));
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

export function detailLine(entry) {
  return [entry.dose, entry.route, entry.frequency].filter(Boolean).join(" · ");
}

export function sourceLine(entry) {
  return [
    entry.prescriber,
    entry.start ? "since " + String(entry.start).slice(0, 10) : null,
    entry.end ? "until " + String(entry.end).slice(0, 10) : null,
    entry.source
  ].filter(Boolean).join(" · ");
}

export function countLine(entry) {
  if (!(entry.count > 1)) return null;
  return entry.firstDate
    ? "Prescribed " + entry.count + " times since " + String(entry.firstDate).slice(0, 4)
    : "In your records " + entry.count + " times";
}

// Why "From your records" is empty, or null when it isn't.
export function emptyRecordsText(split, arranged) {
  if (arranged.current.length) return null;
  if (arranged.stopped.length) return "You've marked all your current medicines stopped.";
  if (split.older.length) return "No current medicines in your records.";
  return "No medicines in your records.";
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
// takes now, from records (not marked stopped) and their own additions.
export function medicineCount(arranged, additions) {
  return arranged.current.length + additions.length;
}

export function medicinesButtonText(count) {
  return "My medicines (" + count + ")";
}

// The notices at the top of the home screen, only when needed, in order.
export function noticesFor({ savedAt, online, failed, installHint }) {
  var out = [];
  if (savedAt) out.push(savedNotice(savedAt, online));
  if (failed) out.push("Some of your records couldn't be loaded.");
  if (installHint) out.push(installHint);
  return out;
}
