// Turns FHIR MedicationRequest and MedicationStatement records into one
// simple list item shape, then merges repeats so each medicine shows once.
// No DOM here, so Node's test runner can check it.

var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";

var CURRENT_REQUEST = ["active", "on-hold"];
var CURRENT_STATEMENT = ["active", "intended"];

var UNIT_WORDS = { min: "minute", h: "hour", d: "day", wk: "week", mo: "month", a: "year" };

var unnamedCount = 0;

// Words a record uses when it doesn't really say which medicine it is.
var PLACEHOLDER = /^(medication|medications|medicine|medicines|drug|unknown|unnamed medicine|medication details not readable)$/i;

// A record with no real drug in it: no RxNorm code and only a placeholder
// word (or nothing) for a name. Seen in the SMART sandbox, where some
// statements are just { text: "Medication" }. There's nothing to show or
// stop, so the list leaves these out and says how many there were.
export function isPlaceholderDrug(item) {
  return !item.rxcui && PLACEHOLDER.test(String(item.name || "").trim());
}

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
    recordStatus: resource.status || null,
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
    recordStatus: resource.status || null,
    // "unknown" with no end date stays on the main list: hiding it under
    // Older would leave it off the QR code (real sandbox data has these).
    current: CURRENT_STATEMENT.indexOf(resource.status) !== -1 ||
      (resource.status === "unknown" && !period.end)
  });
}

// One dosage entry is split into its parts. Several are said in full, in the
// record's order: whether they're taken together or one after the other is the
// record's to say, so they're only numbered.
export function formatDosage(dosageInstruction) {
  var entries = (Array.isArray(dosageInstruction) ? dosageInstruction : []).filter(Boolean);
  if (entries.length > 1) {
    var lines = inOrder(entries).map(function (entry, index) {
      return "Direction " + (index + 1) + ": " + (entry.text || [readDose(entry), readRoute(entry), readFrequency(entry)].filter(Boolean).join(", ") || "See the record");
    });
    return { dose: null, route: null, frequency: lines.join("\n") };
  }
  var first = entries[0];
  if (!first) {
    return { dose: null, route: null, frequency: null };
  }
  return {
    dose: readDose(first),
    route: readRoute(first),
    frequency: first.text || readFrequency(first)
  };
}

function inOrder(entries) {
  var numbered = entries.every(function (entry) { return typeof entry.sequence === "number"; });
  return numbered ? entries.slice().sort(function (a, b) { return a.sequence - b.sequence; }) : entries;
}

// A record marked "entered in error" was a mistake in the chart. It is
// left out completely so it can't supply a name or a dose.
export function usableRecord(resource) {
  return Boolean(resource) && resource.status !== "entered-in-error";
}

// Repeats of one medicine become one line. The line shows the newest
// current record when there is one (a newer stopped record must not hide
// the dose the patient takes now), counts every record, and keeps the
// earliest start date for "since <year>".
export function dedupe(items) {
  var groups = new Map();
  items.forEach(function (item) {
    var group = groups.get(item.key);
    if (!group) {
      groups.set(item.key, Object.assign({}, item));
      return;
    }
    var preferItem = item.status === group.status ? isNewer(item, group) : item.status === "current";
    var shown = preferItem ? Object.assign({}, item) : group;
    shown.count = group.count + item.count;
    shown.status = group.status === "current" || item.status === "current" ? "current" : "older";
    shown.firstDate = earliest(group.firstDate, item.firstDate);
    shown.hold = joinHolds(group, item);
    groups.set(item.key, shown);
  });
  return Array.from(groups.values());
}

// Whether the records have it on hold: "all" of the current ones, "some", or
// null. A list saved before this has only the shown record's status.
export function holdText(item) {
  if (item.hold !== undefined) return item.hold;
  return item.recordStatus === "on-hold" ? "all" : null;
}

function joinHolds(a, b) {
  if (a.status !== "current") return holdText(b);
  if (b.status !== "current") return holdText(a);
  return holdText(a) === holdText(b) ? holdText(a) : "some";
}

function earliest(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
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

// The strength it changed from and to, or null.
export function doseChange(item) {
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
  return { from: first, to: last, date: String(history[history.length - 1].date || "").slice(0, 10) };
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
  shown.firstDate = members.reduce(function (first, item) { return earliest(first, item.firstDate); }, null);
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
    recordStatus: parts.recordStatus,
    origin: "records",
    lastDate: parts.lastDate,
    firstDate: parts.start,
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
    // A placeholder text like "Medication" gives way to the coded name.
    name: (concept.text && !PLACEHOLDER.test(concept.text.trim()) ? concept.text : null) ||
      (rxnorm && rxnorm.display) || (codings[0] && codings[0].display) || concept.text || null,
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

var UNCLEAR = "See the record for how often";
var WHEN_WORDS = {
  MORN: "in the morning", AFT: "in the afternoon", EVE: "in the evening", NIGHT: "at night", HS: "at bedtime", WAKE: "on waking", PHS: "after sleep",
  C: "with meals", CM: "with breakfast", CD: "with lunch", CV: "with dinner",
  AC: "before meals", ACM: "before breakfast", ACD: "before lunch", ACV: "before dinner",
  PC: "after meals", PCM: "after breakfast", PCD: "after lunch", PCV: "after dinner"
};
var DAY_WORDS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
var CODE_WORDS = { QD: "once a day", BID: "twice a day", TID: "3 times a day", QID: "4 times a day", QOD: "every other day", AM: "every morning", PM: "every afternoon", Q4H: "every 4 hours", Q6H: "every 6 hours" };
var REPEAT_PARTS = ["frequency", "frequencyMax", "period", "periodMax", "periodUnit", "when", "dayOfWeek", "timeOfDay", "boundsPeriod"];

// How often, in words. A schedule with any part that can't be put in words
// sends the reader to the record: half a schedule reads as the whole.
function readFrequency(dosage) {
  if (dosage.modifierExtension) return UNCLEAR;
  var parts = [];
  var schedule = readTiming(dosage.timing);
  if (schedule) parts.push(schedule);
  var reason = dosage.asNeededCodeableConcept;
  if (reason) {
    var why = reason.text || (reason.coding && reason.coding[0] && reason.coding[0].display);
    parts.push("as needed" + (why ? " for " + why : ""));
  } else if (dosage.asNeededBoolean) {
    parts.push("as needed");
  }
  if (dosage.maxDosePerPeriod || dosage.maxDosePerAdministration || dosage.maxDosePerLifetime) {
    parts.push("see the record for the most to take");
  }
  return parts.length ? parts.join(", ") : null;
}

function readTiming(timing) {
  if (!timing || !Object.keys(timing).length) return null;
  if (timing.modifierExtension) return UNCLEAR;
  var words = timing.repeat && !timing.event ? repeatWords(timing.repeat) : null;
  return words || codeWords(timing.code) || UNCLEAR;
}

function codeWords(code) {
  if (!code) return null;
  var coding = (code.coding && code.coding[0]) || {};
  return code.text || CODE_WORDS[coding.code] || coding.display || null;
}

function repeatWords(repeat) {
  var known = Object.keys(repeat).every(function (key) { return REPEAT_PARTS.indexOf(key) !== -1; });
  // A start date alone isn't a limit. An end is.
  if (!known || (repeat.boundsPeriod && repeat.boundsPeriod.end)) return null;
  var parts = [];
  if (repeat.frequency || repeat.period || repeat.periodUnit) {
    var unit = UNIT_WORDS[repeat.periodUnit];
    if (!repeat.frequency || !repeat.period || !unit) return null;
    var times = repeat.frequencyMax ? repeat.frequency + " to " + repeat.frequencyMax + " times" : repeat.frequency === 1 ? "once" : repeat.frequency + " times";
    var every = repeat.periodMax ? "every " + repeat.period + " to " + repeat.periodMax + " " + unit + "s"
      : repeat.period === 1 ? (unit === "hour" ? "an " : "a ") + unit : "every " + repeat.period + " " + unit + "s";
    parts.push(times + " " + every);
  } else if (repeat.frequencyMax || repeat.periodMax) {
    return null;
  }
  var ok = addWords(parts, repeat.when, "", function (code) { return own(WHEN_WORDS, code); }) &&
    addWords(parts, repeat.dayOfWeek, "on ", function (code) { return own(DAY_WORDS, code); }) &&
    addWords(parts, repeat.timeOfDay, "at ", clockWords);
  return ok && parts.length ? parts.join(", ") : null;
}

// False when one of them has no words.
function addWords(parts, values, before, wordFor) {
  if (!values || !values.length) return true;
  var all = values.map(wordFor);
  if (!all.every(Boolean)) return false;
  parts.push(before + all.join(" and "));
  return true;
}

function own(map, key) {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

function clockWords(time) {
  var found = /^([01]\d|2[0-3]):([0-5]\d)(:\d\d(\.\d+)?)?$/.exec(String(time));
  if (!found) return null;
  var hour = Number(found[1]);
  return (hour % 12 || 12) + ":" + found[2] + (hour < 12 ? " AM" : " PM");
}
