// Looks up medicine names in RxNorm through the National Library of
// Medicine's free RxNav service. fetchFn is passed in so tests can answer
// without the network.

var BASE = "https://rxnav.nlm.nih.gov/REST/";
var PRODUCT_TYPES = ["SCD", "SBD"];
var MAX_RESULTS = 10;
var MAX_PARALLEL = 4;
// Weak Wi-Fi can leave a request hanging. Give up and carry on without it.
var TIMEOUT_MS = 8000;

export class RxNormError extends Error {
  constructor(message) {
    super(message || "Couldn't reach RxNorm.");
    this.name = "RxNormError";
  }
}

export async function searchDrugs(term, fetchFn = globalThis.fetch, { timeoutMs = TIMEOUT_MS } = {}) {
  var trimmed = (term || "").trim();
  if (!trimmed) {
    return [];
  }
  var drugs = await getJSON(BASE + "drugs.json?name=" + encodeURIComponent(trimmed), fetchFn, timeoutMs);
  var groups = (drugs.drugGroup && drugs.drugGroup.conceptGroup) || [];
  var found = [];
  groups.forEach(function (group) {
    if (PRODUCT_TYPES.indexOf(group.tty) !== -1) {
      found = found.concat(group.conceptProperties || []);
    }
  });
  if (!found.length) {
    var approximate = await getJSON(BASE + "approximateTerm.json?term=" + encodeURIComponent(trimmed) + "&maxEntries=8", fetchFn, timeoutMs);
    found = (approximate.approximateGroup && approximate.approximateGroup.candidate) || [];
  }
  var word = trimmed.toLowerCase();
  var ranked = found
    .filter(function (item) { return item.rxcui && item.name; })
    .sort(function (a, b) { return compareRank(rank(a, word), rank(b, word)); });
  return uniqueByRxcui(ranked).slice(0, MAX_RESULTS);
}

// none, a Set, collects the codes RxNav answered about but has no ingredient
// for, so they needn't be asked again. A failed lookup isn't one of them.
export async function ingredientsFor(rxcuis, fetchFn = globalThis.fetch, { timeoutMs = TIMEOUT_MS, none = null } = {}) {
  var map = new Map();
  var queue = Array.from(new Set(rxcuis));
  async function worker() {
    while (queue.length) {
      var rxcui = queue.shift();
      try {
        var related = await getJSON(BASE + "rxcui/" + encodeURIComponent(rxcui) + "/related.json?tty=IN", fetchFn, timeoutMs);
        var groups = (related.relatedGroup && related.relatedGroup.conceptGroup) || [];
        // Every ingredient, so a combination pill (acetaminophen with
        // oxycodone) never matches a plain one (acetaminophen alone).
        var ingredients = groups
          .filter(function (group) { return group.tty === "IN"; })
          .reduce(function (all, group) { return all.concat(group.conceptProperties || []); }, [])
          .filter(function (concept) { return concept && concept.rxcui; })
          .sort(function (a, b) { return Number(a.rxcui) - Number(b.rxcui); });
        if (ingredients.length) {
          map.set(rxcui, {
            rxcui: ingredients.map(function (concept) { return concept.rxcui; }).join("+"),
            name: ingredients.map(function (concept) { return concept.name; }).join(" / ")
          });
        } else if (none) {
          none.add(rxcui);
        }
      } catch (error) {
        // Leave it out. Grouping falls back to the exact product.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker));
  return map;
}

// Most useful first: one medicine before combinations, names that start with
// what was typed, the generic before brands, then the shorter name.
function rank(item, word) {
  var name = item.name.toLowerCase();
  return [
    name.indexOf(" / ") !== -1 ? 1 : 0,
    name.indexOf(word) === 0 ? 0 : 1,
    item.tty === "SCD" ? 0 : 1,
    name.length
  ];
}

function compareRank(a, b) {
  for (var i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

async function getJSON(url, fetchFn, timeoutMs) {
  var response;
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
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
