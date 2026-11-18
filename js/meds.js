// Turns FHIR MedicationRequest and MedicationStatement records into one
// simple list item shape, then merges repeats so each medicine shows once.
// No DOM here, so Node's test runner can check it.

var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
// NDC is written two ways in the wild: the FHIR URI and the HL7 OID.
var NDC_SYSTEMS = ["http://hl7.org/fhir/sid/ndc", "urn:oid:2.16.840.1.113883.6.69"];

var CURRENT_REQUEST = ["active", "on-hold"];
var CURRENT_STATEMENT = ["active", "intended"];

var UNIT_WORDS = { h: "hour", d: "day", wk: "week", mo: "month", a: "year" };

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
    current: CURRENT_STATEMENT.indexOf(resource.status) !== -1
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

// Gives records that only carry an NDC the RxNorm code RxNav found for it
// (see rxcuisForNdcs), so dedupe can merge them with RxNorm-coded records.
// Run it before dedupe. Records with an rxcui or no match are returned as is.
export function applyNdcMap(items, rxcuiOfNdc) {
  return items.map(function (item) {
    var found = !item.rxcui && item.ndc ? rxcuiOfNdc.get(item.ndc) : null;
    if (!found) {
      return item;
    }
    var named = item.name !== "Unnamed medicine";
    return Object.assign({}, item, {
      key: "rx:" + found.rxcui,
      rxcui: found.rxcui,
      name: named || !found.name ? item.name : found.name
    });
  });
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
  return result.map(function (entry) {
    return Array.isArray(entry) ? mergeIngredientGroup(entry) : entry;
  });
}

export function doseChangeText(item) {
  var history = item.doseHistory || [];
  if (history.length < 2) {
    return null;
  }
  var first = strengthOf(history[0].name);
  var last = strengthOf(history[history.length - 1].name);
  if (!first || !last || first === last) {
    return null;
  }
  return "dose changed from " + first + " to " + last + " on " + history[history.length - 1].date;
}

function mergeIngredientGroup(members) {
  if (members.length === 1) {
    return members[0];
  }
  var ordered = members.slice().sort(function (a, b) {
    return (a.lastDate || "").localeCompare(b.lastDate || "");
  });
  var newest = Object.assign({}, ordered[ordered.length - 1]);
  newest.count = members.reduce(function (sum, item) { return sum + item.count; }, 0);
  newest.status = members.some(function (item) { return item.status === "current"; }) ? "current" : "older";
  newest.doseHistory = ordered.map(function (item) {
    return { name: item.name, date: item.lastDate };
  });
  return newest;
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
    key: rxcui ? "rx:" + rxcui : "text:" + (name ? name.toLowerCase() : "unnamed medicine"),
    rxcui: rxcui,
    ndc: parts.drug.ndc,
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
  if (!concept && resource.medicationReference && resource.medicationReference.reference) {
    var medication = medications.get(resource.medicationReference.reference);
    concept = medication && medication.code;
  }
  if (!concept) {
    return { name: null, rxcui: null, ndc: null };
  }
  var codings = Array.isArray(concept.coding) ? concept.coding : [];
  var rxnorm = codings.filter(function (coding) { return coding.system === RXNORM && coding.code; })[0];
  var ndc = codings.filter(function (coding) { return NDC_SYSTEMS.indexOf(coding.system) !== -1 && coding.code; })[0];
  return {
    name: concept.text || (rxnorm && rxnorm.display) || (codings[0] && codings[0].display) || null,
    rxcui: rxnorm ? String(rxnorm.code) : null,
    ndc: ndc ? String(ndc.code).trim() : null
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
