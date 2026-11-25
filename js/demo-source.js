// Test records from a made-up second clinic, so joining two sources can be
// tried on a phone before a real second source is connected. Only the home
// test server (tools/serve.mjs, port 8443) has them, and only when it was
// started for it; the published app never asks. No DOM here, so Node's test
// runner can check it.

import { fromMedicationRequest, fromMedicationStatement, usableRecord, isPlaceholderDrug, dedupe, groupByIngredient, splitByStatus, noMedicinesKind } from "./meds.js";

export var DEMO_ID = "valley-clinic-demo";
export var DEMO_NAME = "Valley Clinic (test records)";

// Only the home server's port: GitHub Pages is on 443, so it never asks.
// Per patient, so a test patient made for it (tools/reconcile-patients.mjs)
// gets its own clinic file; the server answers anyone else with Loria's.
export function demoSourceUrl(location, patientId) {
  if (!location || String(location.port) !== "8443" || !patientId) return null;
  return "./_home/demo-source/" + encodeURIComponent(patientId) + ".json";
}

// The next day, so the same-person check can be seen keeping a source out.
function dayAfter(date) {
  var found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!found) return date;
  return new Date(Date.UTC(Number(found[1]), Number(found[2]) - 1, Number(found[3]) + 1)).toISOString().slice(0, 10);
}

// json is { patient, requests, statements, heldBack? }. The records are
// made up, so they're given the signed-in patient's name and birth date to
// join that list; ?demo=someone-else in the address makes the birth date a
// day off.
export function demoSource(json, patient, search) {
  var someoneElse = new URLSearchParams(search || "").get("demo") === "someone-else";
  var birthDate = patient && patient.birthDate;
  var items = [];
  var placeholders = 0;
  var noMedicines = [];
  [[json.requests, fromMedicationRequest], [json.statements, fromMedicationStatement]].forEach(function (pair) {
    (Array.isArray(pair[0]) ? pair[0] : []).filter(usableRecord).forEach(function (resource) {
      // As a real source can say it has none to give.
      var kind = noMedicinesKind(resource);
      if (kind) {
        if (!noMedicines.some(function (said) { return said.kind === kind; })) noMedicines.push({ source: DEMO_NAME, kind: kind });
        return;
      }
      var item = pair[1](resource, DEMO_NAME);
      if (isPlaceholderDrug(item)) placeholders += 1;
      else items.push(item);
    });
  });
  // No ingredient map: the app looks its codes up before joining.
  var split = splitByStatus(groupByIngredient(dedupe(items), new Map()));
  split.failed = false;
  // A clinic file can say it sent only some records, as a real source can.
  split.heldBack = json.heldBack === true;
  split.placeholders = placeholders;
  split.noMedicines = noMedicines;
  return {
    id: DEMO_ID,
    name: DEMO_NAME,
    kind: "records",
    refreshes: true,
    patient: Object.assign({}, json.patient, {
      name: patient && patient.name,
      birthDate: someoneElse ? dayAfter(birthDate) : birthDate
    }),
    split: split
  };
}

// The test source, or null: not the home server, not started for it, no
// signal, or something that isn't the test records. Never stored by the
// service worker (sw.js).
export async function loadDemoSource(location, patient, patientId, fetchFn) {
  var url = demoSourceUrl(location, patientId);
  if (!url) return null;
  try {
    var response = await fetchFn(url, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok || response.status !== 200) return null;
    var json = await response.json();
    if (!json || !json.patient || !Array.isArray(json.requests)) return null;
    return demoSource(json, patient, location.search);
  } catch (error) {
    return null;
  }
}
