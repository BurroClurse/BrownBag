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

var PRODUCT_TYPES = ["SCD", "SBD", "GPCK", "BPCK"];
var MAX_PARALLEL = 4;

// Each record's codes (lists, likeliest product first), each code looked up
// once whichever records share it: ingredients and term types. A record
// stops at its first product, so Epic's ingredient codes are seldom asked.
// Then the current codes any retired ones became.
async function lookUp(lists, fetchFn) {
  var types = new Map();
  var ingredients = new Map();
  var asked = new Map();
  var running = 0;
  var waiting = [];
  function slot() {
    if (running < MAX_PARALLEL) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise(function (resolve) { waiting.push(resolve); });
  }
  function free() {
    var next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
  function ask(code) {
    if (!asked.has(code)) {
      asked.set(code, slot().then(function () {
        return ingredientsFor([code], fetchFn, { types: types });
      }).then(function (found) {
        found.forEach(function (value, key) { ingredients.set(key, value); });
      }).finally(free));
    }
    return asked.get(code);
  }
  await Promise.all(lists.map(async function (codes) {
    for (var i = 0; i < codes.length; i += 1) {
      await ask(codes[i]);
      var type = types.get(codes[i]);
      if (type && PRODUCT_TYPES.indexOf(type.tty) !== -1) return;
    }
  }));
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

  var looked = await lookUp(records.map(function (one) { return rxnormCodesOf(one.resource, one.medications); }), fetchFn);
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
  // A source that lists a medicine has said something about them, so "no
  // information" or "none known" from it would contradict itself.
  split.noMedicines = items.length ? [] : noMedicines;
  split.ingredientOf = looked.ingredients;
  return split;
}
