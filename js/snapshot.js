// A list that was handed over rather than signed in to: an IPS file, or a
// Brown Bag list opened again. It joins the reconciling as one more source,
// dated by when it was made. No DOM here, so Node's test runner can check it.

import { fromMedicationRequest, fromMedicationStatement, usableRecord, isPlaceholderDrug, dedupe, groupByIngredient, splitByStatus, medicationsFrom, noMedicinesKind } from "./meds.js";

var TAGS = "https://burroclurse.github.io/BrownBag/tags";

function resourcesOf(bundle) {
  return (Array.isArray(bundle.entry) ? bundle.entry : []).filter(function (entry) {
    return entry && entry.resource;
  });
}

function entryFor(entries, reference) {
  return entries.filter(function (entry) { return entry.fullUrl && entry.fullUrl === reference; })[0] || null;
}

// Brown Bag's QR list carries its tags. Its saved file has none, but names
// Brown Bag as a Device among the Composition's authors.
function isOwnExport(bundle, entries) {
  var tags = (bundle.meta && bundle.meta.tag) || [];
  if (tags.some(function (tag) { return tag && tag.system === TAGS; })) return true;
  var composition = entries.filter(function (entry) { return entry.resource.resourceType === "Composition"; })[0];
  var authors = (composition && Array.isArray(composition.resource.author)) ? composition.resource.author : [];
  return authors.some(function (author) {
    var found = author && author.reference ? entryFor(entries, author.reference) : null;
    var names = found && found.resource.resourceType === "Device" && Array.isArray(found.resource.deviceName) ? found.resource.deviceName : [];
    return Boolean(names[0]) && names[0].name === "Brown Bag";
  });
}

function hasOwnDate(resource) {
  if (resource.resourceType === "MedicationRequest") return Boolean(resource.authoredOn);
  return Boolean(resource.dateAsserted || resource.effectiveDateTime || (resource.effectivePeriod && resource.effectivePeriod.start));
}

// A record with no date of its own is as old as the list.
function datedBy(resource, asOf) {
  if (!asOf || hasOwnDate(resource)) return resource;
  return Object.assign({}, resource, resource.resourceType === "MedicationRequest" ? { authoredOn: asOf } : { dateAsserted: asOf });
}

// bundle is a FHIR Bundle of type collection or document, or the result is
// null. name is what the patient calls the source.
export function snapshotSource(bundle, name) {
  if (!bundle || (bundle.type !== "collection" && bundle.type !== "document")) return null;
  var entries = resourcesOf(bundle);
  var composition = entries.filter(function (entry) { return entry.resource.resourceType === "Composition"; })[0];
  var asOf = (composition && composition.resource.date) || bundle.timestamp || null;
  var patientEntry = entries.filter(function (entry) { return entry.resource.resourceType === "Patient"; })[0] || null;
  var own = isOwnExport(bundle, entries);

  // An IPS names its Medications by urn:uuid; some files hold prescriptions
  // instead of statements.
  var medications = medicationsFrom(entries);
  var items = [];
  var placeholders = 0;
  var noMedicines = [];
  entries.forEach(function (entry) {
    var resource = entry.resource;
    var convert = resource.resourceType === "MedicationStatement" ? fromMedicationStatement : resource.resourceType === "MedicationRequest" ? fromMedicationRequest : null;
    if (!convert || !usableRecord(resource)) return;
    var from = resource.informationSource && resource.informationSource.reference;
    if (own && from && patientEntry && from === patientEntry.fullUrl) return;
    var kind = noMedicinesKind(resource, medications);
    if (kind) {
      if (!noMedicines.some(function (said) { return said.kind === kind; })) noMedicines.push({ source: name, kind: kind });
      return;
    }
    var item = convert(datedBy(resource, asOf), name, medications);
    if (isPlaceholderDrug(item)) placeholders += 1;
    else items.push(item);
  });

  // No ingredient map: a snapshot only joins by code and name.
  var split = splitByStatus(groupByIngredient(dedupe(items), new Map()));
  split.failed = false;
  split.heldBack = false;
  split.placeholders = placeholders;
  split.noMedicines = noMedicines;
  return {
    id: "snapshot:" + asOf + ":" + name,
    name: name,
    kind: "snapshot",
    refreshes: false,
    patient: patientEntry ? patientEntry.resource : null,
    split: split
  };
}
