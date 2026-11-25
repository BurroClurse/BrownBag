// One source's medicine records, as its server sent them, into its list:
// each record finds the Medication it points to, RxNav says which of its
// codes is the product, and IPS "no medicines" entries are said, not listed.
// No DOM here, so Node's test runner can check it.

import { fromMedicationRequest, fromMedicationStatement, usableRecord, isPlaceholderDrug, dedupe, groupByIngredient, splitByStatus, medicationsFrom, rxnormCodesOf, noMedicinesKind } from "./meds.js";
import { ingredientsFor } from "./rxnorm.js";
import { heldBack } from "./read.js";

var KINDS = [["MedicationRequest", fromMedicationRequest], ["MedicationStatement", fromMedicationStatement]];

// A search answer as Bundle entries, whether it came as one Bundle, a
// Bundle per page, or bare resources.
export function entriesOf(result) {
  var pages = Array.isArray(result) ? result : [result];
  return pages.reduce(function (all, page) {
    if (page && page.resourceType === "Bundle") return all.concat((page.entry || []).filter(function (entry) { return entry && entry.resource; }));
    return page ? all.concat([{ resource: page }]) : all;
  }, []);
}

// Each record's codes, looked up once: ingredients and term types, then the
// current codes any retired ones became.
async function lookUp(codes, fetchFn) {
  var types = new Map();
  var ingredients = codes.length ? await ingredientsFor(codes, fetchFn, { types: types }) : new Map();
  var remapped = [];
  types.forEach(function (type) {
    if (type.remappedTo && !types.has(type.remappedTo) && remapped.indexOf(type.remappedTo) === -1) remapped.push(type.remappedTo);
  });
  if (remapped.length) {
    (await ingredientsFor(remapped, fetchFn)).forEach(function (value, code) { ingredients.set(code, value); });
  }
  return { ingredients: ingredients, types: types };
}

// results: { MedicationRequest, MedicationStatement }, each the search's
// answer (with its _include Medications), or an Error when it didn't load.
// The same split loadMedicines always made, plus noMedicines.
export async function listFromSearch(results, sourceName, fetchFn = globalThis.fetch) {
  var failed = false;
  var leftOut = false;
  var found = [];
  KINDS.forEach(function (kind) {
    var result = results[kind[0]];
    if (result === undefined || result === null || result instanceof Error) {
      failed = true;
      return;
    }
    var entries = entriesOf(result);
    var resources = entries.map(function (entry) { return entry.resource; });
    if (heldBack(resources)) leftOut = true;
    var medications = medicationsFrom(entries);
    resources.filter(function (r) { return r.resourceType === kind[0] && usableRecord(r); }).forEach(function (r) {
      found.push({ resource: r, convert: kind[1], medications: medications });
    });
  });

  var noMedicines = [];
  var records = found.filter(function (one) {
    var kind = noMedicinesKind(one.resource, one.medications);
    if (kind && !noMedicines.some(function (said) { return said.kind === kind; })) noMedicines.push({ source: sourceName, kind: kind });
    return !kind;
  });

  var codes = records.reduce(function (all, one) { return all.concat(rxnormCodesOf(one.resource, one.medications)); }, []);
  var looked = await lookUp(Array.from(new Set(codes)), fetchFn);
  var items = [];
  var placeholders = 0;
  records.forEach(function (one) {
    var item = one.convert(one.resource, sourceName, one.medications, looked.types);
    if (isPlaceholderDrug(item)) placeholders += 1;
    else items.push(item);
  });

  var split = splitByStatus(groupByIngredient(dedupe(items), looked.ingredients));
  split.failed = failed;
  split.heldBack = leftOut;
  split.placeholders = placeholders;
  split.noMedicines = noMedicines;
  split.ingredientOf = looked.ingredients;
  return split;
}
