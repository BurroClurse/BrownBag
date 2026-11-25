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
// types, a Map, gets each code's term type ({ tty }, and remappedTo when
// RxNorm retired the code for exactly one current one), from the same
// lookup: one more request per code, asked alongside, with the same time
// limit. A code whose history didn't load has no type.
export async function ingredientsFor(rxcuis, fetchFn = globalThis.fetch, { timeoutMs = TIMEOUT_MS, none = null, types = null } = {}) {
  var map = new Map();
  var queue = Array.from(new Set(rxcuis));
  async function worker() {
    while (queue.length) {
      var rxcui = queue.shift();
      var code = encodeURIComponent(rxcui);
      var answers = await Promise.allSettled([
        getJSON(BASE + "rxcui/" + code + "/related.json?tty=IN+PIN", fetchFn, timeoutMs),
        types ? getJSON(BASE + "rxcui/" + code + "/historystatus.json", fetchFn, timeoutMs) : Promise.resolve(null)
      ]);
      var type = answers[1].status === "fulfilled" ? typeFrom(answers[1].value) : null;
      if (type && types) types.set(rxcui, type);
      // Leave a failed one out. Grouping falls back to the exact product.
      var related = answers[0].status === "fulfilled" ? answers[0].value : null;
      if (!related || typeof related !== "object") continue;
      var groups = (related.relatedGroup && related.relatedGroup.conceptGroup) || [];
      // Every ingredient, so a combination pill (acetaminophen with
      // oxycodone) never matches a plain one (acetaminophen alone).
      var ingredients = conceptsOf(groups, "IN");
      if (ingredients.length) {
        var found = joinConcepts(ingredients);
        // The salt (metoprolol succinate, not tartrate). An ingredient's own
        // code lists every salt there is, so it has none.
        var salts = conceptsOf(groups, "PIN");
        var isIngredient = (type && INGREDIENT_TYPES.indexOf(type.tty) !== -1) || found.rxcui === String(rxcui);
        if (salts.length && !isIngredient) found.salt = joinConcepts(salts);
        map.set(rxcui, found);
      } else if (none) {
        none.add(rxcui);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker));
  return map;
}

var INGREDIENT_TYPES = ["IN", "PIN", "MIN", "BN"];

function conceptsOf(groups, tty) {
  return groups
    .filter(function (group) { return group && group.tty === tty; })
    .reduce(function (all, group) { return all.concat(group.conceptProperties || []); }, [])
    .filter(function (concept) { return concept && concept.rxcui; })
    .sort(function (a, b) { return Number(a.rxcui) - Number(b.rxcui); });
}

function joinConcepts(concepts) {
  return {
    rxcui: concepts.map(function (concept) { return concept.rxcui; }).join("+"),
    name: concepts.map(function (concept) { return concept.name; }).join(" / ")
  };
}

// RxNav's history status as { tty, remappedTo }. A code remapped to more
// than one current code can't say which, so it keeps its own.
function typeFrom(answer) {
  var history = answer && answer.rxcuiStatusHistory;
  var tty = history && history.attributes && history.attributes.tty;
  if (!tty) return null;
  var out = { tty: String(tty) };
  var status = history.metaData && history.metaData.status;
  var remapped = ((history.derivedConcepts && history.derivedConcepts.remappedConcept) || []).filter(function (concept) {
    return concept && concept.remappedRxCui && concept.remappedActive === "YES";
  });
  if (status === "Remapped" && remapped.length === 1) out.remappedTo = String(remapped[0].remappedRxCui);
  return out;
}

// The RxNorm code an NDC stood for on the fill's date, from RxNav's own
// NDC history; RxNav's current code when the date doesn't settle it. Null
// when RxNav doesn't know it or can't be reached.
export async function rxcuiForNdc(ndc, date, fetchFn = globalThis.fetch, { timeoutMs = TIMEOUT_MS } = {}) {
  var answer;
  try {
    answer = await getJSON(BASE + "ndcstatus.json?ndc=" + encodeURIComponent(String(ndc || "")), fetchFn, timeoutMs);
  } catch (error) {
    return null;
  }
  var status = answer && answer.ndcStatus;
  if (!status || status.status === "UNKNOWN") return null;
  var month = /^(\d{4})-(\d{2})/.exec(String(date || ""));
  var when = month ? month[1] + month[2] : null;
  var then = (status.ndcHistory || []).filter(function (row) {
    return when && row && row.activeRxcui && String(row.startDate || "") <= when && (!row.endDate || when <= String(row.endDate));
  });
  var codes = Array.from(new Set(then.map(function (row) { return String(row.activeRxcui); })));
  if (codes.length === 1) return codes[0];
  return status.rxcui ? String(status.rxcui) : null;
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
