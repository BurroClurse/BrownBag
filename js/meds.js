// Turns FHIR MedicationRequest and MedicationStatement records into one
// simple list item shape, then merges repeats so each medicine shows once.
// No DOM here, so Node's test runner can check it.

var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";

var CURRENT_REQUEST = ["active", "on-hold"];
var CURRENT_STATEMENT = ["active", "intended"];

var UNIT_WORDS = { h: "hour", d: "day", wk: "week", mo: "month", a: "year" };

var unnamedCount = 0;

export function fromMedicationRequest(resource, sourceName, medications = new Map()) {
  var drug = readDrug(resource, medications);
  var dosage = formatDosage(resource.dosageInstruction);
  var validity = resource.dispenseRequest && resource.dispenseRequest.validityPeriod;
  return makeItem({
    drug: drug,
    dosage: dosage,
    start: resource.authoredOn || null,
    end: (validity && validity.end) || null,
    lastDate: resource.authoredOn || null,
    prescriber: (resource.requester && resource.requester.display) || null,
    sourceName: sourceName,
    current: CURRENT_REQUEST.indexOf(resource.status) !== -1
  });
}

export function fromMedicationStatement(resource, sourceName, medications = new Map()) {
  var drug = readDrug(resource, medications);
  var dosage = formatDosage(resource.dosage);
  var period = resource.effectivePeriod || {};
  var start = resource.effectiveDateTime || period.start || null;
  return makeItem({
    drug: drug,
    dosage: dosage,
    start: start,
    end: period.end || null,
    lastDate: start,
    prescriber: null,
    sourceName: sourceName,
    // "unknown" with no end date stays on the main list: hiding it under
    // Older would leave it off the QR code (real sandbox data has these).
    current: CURRENT_STATEMENT.indexOf(resource.status) !== -1 ||
      (resource.status === "unknown" && !period.end)
  });
}

// FHIR allows several dosage entries. The first one is the one people read.
export function formatDosage(dosageInstruction) {
  var first = Array.isArray(dosageInstruction) ? dosageInstruction[0] : null;
  if (!first) {
    return { dose: null, route: null, frequency: null };
  }
  return {
    dose: readDose(first),
    route: readRoute(first),
    frequency: first.text || readFrequency(first)
  };
}

export function dedupe(items) {
  var groups = new Map();
  items.forEach(function (item) {
    var group = groups.get(item.key);
    if (!group) {
      groups.set(item.key, Object.assign({}, item));
      return;
    }
    var newest = isNewer(item, group) ? Object.assign({}, item) : group;
    newest.count = group.count + item.count;
    newest.status = group.status === "current" || item.status === "current" ? "current" : "older";
    groups.set(item.key, newest);
  });
  return Array.from(groups.values());
}

export function splitByStatus(items) {
  var byName = function (a, b) {
    return a.name.localeCompare(b.name);
  };
  return {
    current: items.filter(function (item) { return item.status === "current"; }).sort(byName),
    older: items.filter(function (item) { return item.status !== "current"; }).sort(byName)
  };
}

// Merges different strengths of one medicine (lisinopril 10 mg and 20 mg)
// using the ingredient map from RxNav. Anything not in the map stays as is.
// Only products with exactly the same ingredients merge (the map's key holds
// all of them), and two current prescriptions never merge: both being
// active at once is something staff need to see.
export function groupByIngredient(items, ingredientOf) {
  var groups = new Map();
  var result = [];
  items.forEach(function (item) {
    var ingredient = item.rxcui ? ingredientOf.get(item.rxcui) : null;
    if (!ingredient) {
      result.push(item);
      return;
    }
    var members = groups.get(ingredient.rxcui);
    if (!members) {
      members = [];
      groups.set(ingredient.rxcui, members);
      result.push(members);
    }
    members.push(item);
  });
  return result.reduce(function (out, entry) {
    return out.concat(Array.isArray(entry) ? mergeIngredientGroup(entry) : [entry]);
  }, []);
}

export function doseChangeText(item) {
  var history = item.doseHistory || [];
  if (history.length < 2) {
    return null;
  }
  var first = strengthOf(history[0].name);
  var last = strengthOf(history[history.length - 1].name);
  // Same amount in a different form (0.4 MG tablet, 0.4 MG/ACTUAT spray) is not a dose change.
  if (!first || !last || parseFloat(first) === parseFloat(last)) {
    return null;
  }
  var date = String(history[history.length - 1].date || "").slice(0, 10);
  return "dose changed from " + first + " to " + last + " on " + date;
}

function mergeIngredientGroup(members) {
  var current = members.filter(function (item) { return item.status === "current"; });
  if (members.length === 1 || current.length > 1) {
    return members;
  }
  var ordered = members.slice().sort(function (a, b) {
    return (a.lastDate || "").localeCompare(b.lastDate || "");
  });
  var newest = ordered[ordered.length - 1];
  // Show the current prescription when there is one, even if a stopped
  // one is newer.
  var shownFrom = current.length ? current[0] : newest;
  var shown = Object.assign({}, shownFrom);
  shown.count = members.reduce(function (sum, item) { return sum + item.count; }, 0);
  shown.status = current.length ? "current" : "older";
  // A dose history only makes sense when it ends with the one shown.
  if (shownFrom === newest) {
    shown.doseHistory = ordered.map(function (item) {
      return { name: item.name, date: item.lastDate };
    });
  }
  return [shown];
}

// Strength as written in RxNorm names, such as "10 MG" or "0.5 MG/ML".
function strengthOf(name) {
  var match = /(\d+(?:\.\d+)?\s*(?:MG|MCG|G|UNT|MEQ|ML|%)(?:\/(?:ML|HR|ACTUAT))?)/i.exec(name || "");
  return match ? match[1].toUpperCase() : null;
}

function isNewer(a, b) {
  return (a.lastDate || "") > (b.lastDate || "");
}

function makeItem(parts) {
  var name = parts.drug.name ? parts.drug.name.trim() : "";
  var rxcui = parts.drug.rxcui;
  return {
    // Medicines with no name and no code can't be told apart, so each keeps
    // its own line instead of merging into one "Unnamed medicine".
    key: rxcui ? "rx:" + rxcui : (name ? "text:" + name.toLowerCase() : "unnamed:" + (unnamedCount += 1)),
    rxcui: rxcui,
    name: name || "Unnamed medicine",
    dose: parts.dosage.dose,
    route: parts.dosage.route,
    frequency: parts.dosage.frequency,
    start: parts.start,
    end: parts.end,
    prescriber: parts.prescriber,
    source: parts.sourceName,
    status: parts.current ? "current" : "older",
    origin: "records",
    lastDate: parts.lastDate,
    count: 1
  };
}

function readDrug(resource, medications) {
  var concept = resource.medicationCodeableConcept;
  var reference = resource.medicationReference;
  if (!concept && reference && reference.reference) {
    var medication = medications.get(reference.reference);
    concept = medication && medication.code;
  }
  if (!concept) {
    // Servers often put the name on the reference itself.
    return { name: (reference && reference.display) || null, rxcui: null };
  }
  var codings = Array.isArray(concept.coding) ? concept.coding : [];
  var rxnorm = codings.filter(function (coding) { return coding.system === RXNORM && coding.code; })[0];
  return {
    name: concept.text || (rxnorm && rxnorm.display) || (codings[0] && codings[0].display) || null,
    rxcui: rxnorm ? String(rxnorm.code) : null
  };
}

function readDose(dosage) {
  var rate = Array.isArray(dosage.doseAndRate) ? dosage.doseAndRate[0] : null;
  var quantity = rate && rate.doseQuantity;
  if (!quantity || quantity.value === undefined) {
    return null;
  }
  return (quantity.value + " " + (quantity.unit || "")).trim();
}

function readRoute(dosage) {
  var route = dosage.route;
  if (!route) {
    return null;
  }
  var coding = Array.isArray(route.coding) ? route.coding[0] : null;
  return route.text || (coding && coding.display) || null;
}

function readFrequency(dosage) {
  var repeat = dosage.timing && dosage.timing.repeat;
  var parts = [];
  if (repeat && repeat.frequency && repeat.period && UNIT_WORDS[repeat.periodUnit]) {
    var times = repeat.frequency === 1 ? "once" : repeat.frequency + " times";
    var unit = UNIT_WORDS[repeat.periodUnit];
    var article = unit === "hour" ? "an " : "a ";
    var every = repeat.period === 1 ? article + unit : "every " + repeat.period + " " + unit + "s";
    parts.push(times + " " + every);
  }
  if (dosage.asNeededBoolean) {
    parts.push("as needed");
  }
  return parts.length ? parts.join(", ") : null;
}
