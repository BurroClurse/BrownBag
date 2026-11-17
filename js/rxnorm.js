// Looks up medicine names in RxNorm through the National Library of
// Medicine's free RxNav service. fetchFn is passed in so tests can answer
// without the network.

var BASE = "https://rxnav.nlm.nih.gov/REST/";
var PRODUCT_TYPES = ["SCD", "SBD"];
var MAX_RESULTS = 10;
var MAX_PARALLEL = 4;

export class RxNormError extends Error {
  constructor(message) {
    super(message || "Couldn't reach RxNorm.");
    this.name = "RxNormError";
  }
}

export async function searchDrugs(term, fetchFn = globalThis.fetch) {
  var trimmed = (term || "").trim();
  if (!trimmed) {
    return [];
  }
  var drugs = await getJSON(BASE + "drugs.json?name=" + encodeURIComponent(trimmed), fetchFn);
  var groups = (drugs.drugGroup && drugs.drugGroup.conceptGroup) || [];
  var found = [];
  groups.forEach(function (group) {
    if (PRODUCT_TYPES.indexOf(group.tty) !== -1) {
      found = found.concat(group.conceptProperties || []);
    }
  });
  if (!found.length) {
    var approximate = await getJSON(BASE + "approximateTerm.json?term=" + encodeURIComponent(trimmed) + "&maxEntries=8", fetchFn);
    found = (approximate.approximateGroup && approximate.approximateGroup.candidate) || [];
  }
  return uniqueByRxcui(found.filter(function (item) { return item.rxcui && item.name; })).slice(0, MAX_RESULTS);
}

export async function ingredientsFor(rxcuis, fetchFn = globalThis.fetch) {
  var map = new Map();
  var queue = Array.from(new Set(rxcuis));
  async function worker() {
    while (queue.length) {
      var rxcui = queue.shift();
      try {
        var related = await getJSON(BASE + "rxcui/" + encodeURIComponent(rxcui) + "/related.json?tty=IN", fetchFn);
        var groups = (related.relatedGroup && related.relatedGroup.conceptGroup) || [];
        var ingredient = groups
          .filter(function (group) { return group.tty === "IN"; })
          .map(function (group) { return (group.conceptProperties || [])[0]; })
          .filter(Boolean)[0];
        if (ingredient) {
          map.set(rxcui, { rxcui: ingredient.rxcui, name: ingredient.name });
        }
      } catch (error) {
        // Leave it out. Grouping falls back to the exact product.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker));
  return map;
}

async function getJSON(url, fetchFn) {
  var response;
  try {
    response = await fetchFn(url);
  } catch (error) {
    throw new RxNormError();
  }
  if (!response.ok) {
    throw new RxNormError();
  }
  return response.json();
}

function uniqueByRxcui(items) {
  var seen = new Set();
  return items
    .filter(function (item) {
      if (seen.has(item.rxcui)) {
        return false;
      }
      seen.add(item.rxcui);
      return true;
    })
    .map(function (item) {
      return { rxcui: String(item.rxcui), name: item.name };
    });
}
