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
  return lookupEach(rxcuis, async function (rxcui) {
    var related = await getJSON(BASE + "rxcui/" + encodeURIComponent(rxcui) + "/related.json?tty=IN", fetchFn);
    var groups = (related.relatedGroup && related.relatedGroup.conceptGroup) || [];
    var ingredient = groups
      .filter(function (group) { return group.tty === "IN"; })
      .map(function (group) { return (group.conceptProperties || [])[0]; })
      .filter(Boolean)[0];
    return ingredient ? { rxcui: ingredient.rxcui, name: ingredient.name } : null;
  });
}

// Maps NDC codes (the package numbers pharmacies and claims use) to RxNorm
// products. ndcstatus.json is used rather than rxcui.json?idtype=NDC because
// it still answers for NDCs that are no longer sold, which old records carry.
// NDCs RxNav doesn't know, including unhyphenated 10-digit ones, are left out.
export async function rxcuisForNdcs(ndcs, fetchFn = globalThis.fetch) {
  return lookupEach(ndcs, async function (ndc) {
    var answer = await getJSON(BASE + "ndcstatus.json?ndc=" + encodeURIComponent(ndc), fetchFn);
    var status = answer.ndcStatus || {};
    var rxcui = status.rxcui || newestHistoryRxcui(status.ndcHistory);
    return rxcui ? { rxcui: String(rxcui), name: status.conceptName || null } : null;
  });
}

function newestHistoryRxcui(history) {
  var withRxcui = (history || []).filter(function (entry) { return entry.activeRxcui; });
  withRxcui.sort(function (a, b) { return (a.endDate || "").localeCompare(b.endDate || ""); });
  return withRxcui.length ? withRxcui[withRxcui.length - 1].activeRxcui : null;
}

// Runs lookup once per distinct, non-blank id, at most MAX_PARALLEL at a
// time. Ids whose lookup fails or finds nothing are left out of the map, so
// callers fall back to what the record already says.
async function lookupEach(ids, lookup) {
  var map = new Map();
  var queue = Array.from(new Set(ids)).filter(Boolean);
  async function worker() {
    while (queue.length) {
      var id = queue.shift();
      try {
        var found = await lookup(id);
        if (found) {
          map.set(id, found);
        }
      } catch (error) {
        // Leave it out.
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
