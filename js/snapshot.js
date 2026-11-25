// A list that was handed over rather than signed in to: an IPS file, or a
// Brown Bag list opened again. It joins the reconciling as one more source,
// dated by when it was made. No DOM here, so Node's test runner can check it.

import { fromMedicationStatement, usableRecord, isPlaceholderDrug, dedupe, groupByIngredient, splitByStatus } from "./meds.js";

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
  return Boolean(resource.dateAsserted || resource.effectiveDateTime || (resource.effectivePeriod && resource.effectivePeriod.start));
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

  var items = [];
  var placeholders = 0;
  entries.forEach(function (entry) {
    var resource = entry.resource;
    if (resource.resourceType !== "MedicationStatement" || !usableRecord(resource)) return;
    var from = resource.informationSource && resource.informationSource.reference;
    if (own && from && patientEntry && from === patientEntry.fullUrl) return;
    // A statement with no date of its own is as old as the list.
    var dated = !asOf || hasOwnDate(resource) ? resource : Object.assign({}, resource, { dateAsserted: asOf });
    var item = fromMedicationStatement(dated, name);
    if (isPlaceholderDrug(item)) placeholders += 1;
    else items.push(item);
  });

  // No ingredient map: a snapshot only joins by code and name.
  var split = splitByStatus(groupByIngredient(dedupe(items), new Map()));
  split.failed = false;
  split.heldBack = false;
  split.placeholders = placeholders;
  return {
    id: "snapshot:" + asOf + ":" + name,
    name: name,
    kind: "snapshot",
    refreshes: false,
    patient: patientEntry ? patientEntry.resource : null,
    split: split
  };
}
