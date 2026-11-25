// Turns FHIR MedicationRequest and MedicationStatement records into one
// simple list item shape, then merges repeats so each medicine shows once.
// No DOM here, so Node's test runner can check it.

var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
var NDC = "http://hl7.org/fhir/sid/ndc";

var CURRENT_REQUEST = ["active", "on-hold"];
var CURRENT_STATEMENT = ["active", "intended"];

var UNIT_WORDS = { s: "second", min: "minute", h: "hour", d: "day", wk: "week", mo: "month", a: "year" };

var unnamedCount = 0;

// Words a record uses when it doesn't really say which medicine it is.
var PLACEHOLDER = /^(medication|medications|medicine|medicines|drug|unknown|unknown medication|unnamed medicine|medication details not readable|med|rx|none|no current medications)$/i;

// IPS writes "no medicines" as a code where the medicine goes. It isn't one,
// and "no information" isn't "none" either, so each is said as itself.
var ABSENT_UNKNOWN = "http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips";
var NO_MEDICINES = { "no-medication-info": "no-info", "no-known-medications": "none-known" };

// RxNorm term types. A product (SCD, SBD, GPCK, BPCK) is what the patient
// takes. Every other type fits many products, so a record coded only that
// way never joins another by code: ingredients and brand names, dose-form
// groups ("metoprolol Oral Product" is tartrate and succinate alike), and any
// type not listed here. A strength without a form (SCDC, "bupropion
// hydrochloride 150 MG", SR and XL alike) counts only when the record's own
// words name the form, and then that form has to agree too.
var PRODUCT_TYPES = ["SCD", "SBD", "GPCK", "BPCK"];
var PART_RANK = 10;
var INGREDIENT_RANK = 100;

// A record with no real drug in it: no RxNorm code and only a placeholder
// word (or nothing) for a name. Seen in the SMART sandbox, where some
// statements are just { text: "Medication" }. There's nothing to show or
// stop, so the list leaves these out and says how many there were. A record
// with any RxNorm code names a medicine, so it always shows.
export function isPlaceholderDrug(item) {
  return !item.rxcui && !item.ingredientOnly && PLACEHOLDER.test(String(item.name || "").trim());
}

// medications: the Medication records a reference can point to
// (medicationsFrom). types: RxNorm term types from RxNav (ingredientsFor),
// to pick the record's most specific code; without them, its names say.
export function fromMedicationRequest(resource, sourceName, medications = new Map(), types = null) {
  var drug = readDrug(resource, medications, types);
  var dosage = formatDosage(resource.dosageInstruction);
  var validity = resource.dispenseRequest && resource.dispenseRequest.validityPeriod;
  var hospital = isHospitalOrder(resource);
  return makeItem({
    kind: "request",
    resource: resource,
    hospital: hospital,
    drug: drug,
    dosage: dosage,
    start: resource.authoredOn || null,
    end: (validity && validity.end) || null,
    lastDate: resource.authoredOn || null,
    prescriber: (resource.requester && resource.requester.display) || null,
    sourceName: sourceName,
    recordStatus: resource.status || null,
    prn: allAsNeeded(resource.dosageInstruction),
    // A hospital order is for the stay, so it never counts as current.
    current: CURRENT_REQUEST.indexOf(resource.status) !== -1 && !hospital,
    coded: { codes: drug.codes, dosage: codedDosage(resource.dosageInstruction) }
  });
}

export function fromMedicationStatement(resource, sourceName, medications = new Map(), types = null) {
  var drug = readDrug(resource, medications, types);
  var dosage = formatDosage(resource.dosage);
  var period = resource.effectivePeriod || {};
  var start = resource.effectiveDateTime || period.start || null;
  return makeItem({
    kind: "statement",
    resource: resource,
    hospital: false,
    drug: drug,
    dosage: dosage,
    start: start,
    end: period.end || null,
    lastDate: start,
    prescriber: null,
    sourceName: sourceName,
    recordStatus: resource.status || null,
    prn: allAsNeeded(resource.dosage),
    // "unknown" with no end date stays on the main list: hiding it under
    // Older would leave it off the QR code (real sandbox data has these).
    current: CURRENT_STATEMENT.indexOf(resource.status) !== -1 ||
      (resource.status === "unknown" && !period.end),
    coded: { codes: drug.codes, dosage: codedDosage(resource.dosage) }
  });
}

var CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/medicationrequest-category";

function isHospitalOrder(resource) {
  return (Array.isArray(resource.category) ? resource.category : []).some(function (concept) {
    return Boolean(concept) && (Array.isArray(concept.coding) ? concept.coding : []).some(function (coding) {
      return Boolean(coding) && coding.system === CATEGORY_SYSTEM && coding.code === "inpatient";
    });
  });
}

// What the record's status says, whatever list the item landed on:
// "current", "not-current" or "unknown". A statement's "unknown" is current
// until it has an end date.
export function statusWord(item) {
  var status = item.recordStatus;
  if (item.kind === "statement") {
    if (status === "active" || status === "intended") return "current";
    if (["completed", "stopped", "not-taken"].indexOf(status) !== -1) return "not-current";
    if (status === "unknown") return item.end ? "unknown" : "current";
    return "unknown";
  }
  if (CURRENT_REQUEST.indexOf(status) !== -1) return "current";
  return ["completed", "stopped", "cancelled"].indexOf(status) !== -1 ? "not-current" : "unknown";
}

// One dosage entry is split into its parts. Several are said in full, in the
// record's order: whether they're taken together or one after the other is the
// record's to say, so they're only numbered.
export function formatDosage(dosageInstruction) {
  var entries = (Array.isArray(dosageInstruction) ? dosageInstruction : []).filter(Boolean);
  if (entries.length > 1) {
    var lines = inOrder(entries).map(function (entry, index) {
      return "Direction " + (index + 1) + ": " + (entry.text ? readFrequency(entry) : [readDose(entry), readRoute(entry), readFrequency(entry)].filter(Boolean).join(", ") || "See the record");
    });
    return { dose: null, route: null, frequency: lines.join("\n") };
  }
  var first = entries[0];
  if (!first) {
    return { dose: null, route: null, frequency: null };
  }
  var dose = readDose(first);
  return {
    // The record's own words already say it, or say something else (Epic
    // codes "mg/kg" beside "Take 100 mg"): then its words are the dose.
    dose: first.text && (dose === UNCLEAR_DOSE || wordsDisagree(first.text, first.doseAndRate)) ? null : dose,
    route: readRoute(first),
    frequency: readFrequency(first)
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
    shown.prn = joinAsNeeded(group, item, shown.prn);
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

// As needed only when all the current ones are: one taken every day counts.
function joinAsNeeded(a, b, shown) {
  if (a.status === "current" && b.status === "current") return Boolean(a.prn && b.prn);
  if (a.status === "current") return a.prn;
  return b.status === "current" ? b.prn : shown;
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
    // Release type and salt are part of the form, and a name that doesn't
    // say its form can't be the same one.
    var form = formOf(item.name);
    if (!ingredient || !form) {
      result.push(item);
      return;
    }
    var group = ingredient.rxcui + "|" + (ingredient.salt ? ingredient.salt.rxcui : "") + "|" + form;
    var members = groups.get(group);
    if (!members) {
      members = [];
      groups.set(group, members);
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

// Strength as written in RxNorm names, such as "10 MG", "0.5 MG/ML" or the
// patch "0.1 MG/24HR", and as people write it: ".5 mg", "1,000 mg", "88 ug",
// "1000 IU", "100u/ml". One pattern, so the strength and the form after it
// are cut at the same place.
var NUMBER = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|\\.\\d+";
var UNIT = "MCG|MG|UG|\u00b5G|\u03bcG|\\?G|MUG|MICROGRAMS?|GRAMS?|GM|G|UNITS?|UNT|UT|IU|IE|\\[IU\\]|U|MEQ|ML|%";
var STRENGTH = "(?:" + NUMBER + ")\\s*(?:" + UNIT + ")(?![A-Z])(?:\\/(?:\\d+(?:\\.\\d+)?\\s*)?(?:ML|HR|ACTUAT(?:ION)?S?))?";
// RxNorm's own unit for each other spelling (\u00b5 is the micro sign, \u03bc
// the Greek letter; records use both).
var UNIT_NAMES = {
  ug: "MCG", "\u00b5g": "MCG", "\u03bcg": "MCG", "?g": "MCG", mug: "MCG", microgram: "MCG", micrograms: "MCG",
  gm: "G", gram: "G", grams: "G",
  unit: "UNT", units: "UNT", ut: "UNT", iu: "UNT", ie: "UNT", "[iu]": "UNT", u: "UNT"
};
// "250-250-65 MG" is three strengths, one per ingredient.
var COMBINED = new RegExp("(" + NUMBER + ")((?:\\s*-\\s*(?:" + NUMBER + "))+)\\s*(" + UNIT + ")(?![A-Z])", "gi");

function expandCombined(text) {
  return String(text || "").replace(COMBINED, function (all, first, rest, unit) {
    return [first].concat(rest.split("-").slice(1)).map(function (number) { return number.trim() + " " + unit; }).join(" / ");
  });
}

// One spelling for each: "0.5 MG", "1000 MG", "88 MCG", "100 UNT/ML".
function strengthWords(text) {
  var found = new RegExp("^(" + NUMBER + ")(\\s*)(" + UNIT + ")(.*)$", "i").exec(text);
  var number = found[1].replace(/,/g, "");
  if (number.charAt(0) === ".") number = "0" + number;
  var unit = own(UNIT_NAMES, found[3].toLowerCase()) || found[3].toUpperCase();
  return number + found[2] + unit + found[4].toUpperCase().replace(/ACTUAT(?:ION)?S?$/, "ACTUAT");
}

export function strengthOf(name) {
  return strengthsOf(name)[0] || null;
}

// Every strength in the name, in order: a combination has one per
// ingredient ("12.5 MG", "20 MG").
export function strengthsOf(name) {
  return Array.from(expandCombined(name).matchAll(new RegExp(STRENGTH, "gi"))).map(function (match) {
    return strengthWords(match[0]);
  });
}

// Release type, its time ("12 HR"), and salt, wherever the name says them:
// Epic writes "metoprolol succinate XL (TOPROL-XL) 25 MG tablet". They only
// narrow a form. Sodium, potassium, calcium and magnesium are left out: they
// are often the medicine itself (potassium chloride).
var FORM_WORDS = new RegExp("\\b(?:\\d+\\s*HR|XL|XR|ER|SR|CR|DR|LA|ODT|EXTENDED[\\s-]+RELEASE|DELAYED[\\s-]+RELEASE|" +
  "TARTRATE|SUCCINATE|HYDROCHLORIDE|HCL|HYDROBROMIDE|BITARTRATE|DISODIUM|MALEATE|MESYLATE|" +
  "BESYLATE|FUMARATE|CITRATE|SULFATE|BISULFATE|PHOSPHATE|ACETATE|HYCLATE|PROPIONATE|DIPROPIONATE|FUROATE|VALERATE|XINAFOATE|" +
  "TROMETHAMINE|TOSYLATE|PAMOATE|LACTATE|GLUCONATE|BROMIDE|NITRATE|MONOHYDRATE|DIHYDRATE|ANHYDROUS)\\b", "gi");

// Words that say what the medicine is to take or use: a form needs one.
var DOSE_FORMS = "\\b(?:TABLETS?|TABS?|CAPLETS?|CAPSULES?|CAPS?|SOLUTION|SOLN|SUSPENSION|SUSP|EMULSION|INJECTION|INJECTABLE|INJ|" +
  "SYRINGE|AUTO-?INJECTOR|PEN|CARTRIDGE|VIAL|INHALER|INHALATION|INHALANT|NEBULI[SZ]ER|AEROSOL|SPRAY|POWDER|GRANULES|CREAM|" +
  "OINTMENT|OINT|GEL|LOTION|FOAM|SHAMPOO|PASTE|PATCH|TRANSDERMAL|FILM|STRIP|LOZENGE|TROCHE|GUM|SUPPOSITORY|ENEMA|DROPS?|" +
  "ELIXIR|SYRUP|LIQUID|TINCTURE|IMPLANT|RING|INSERT|PELLET|WAFER|PAD|KIT|PACK|OPHTHALMIC|OTIC|NASAL|TOPICAL|RECTAL|VAGINAL|" +
  "ORAL|SUBLINGUAL|BUCCAL|CHEWABLE|DISINTEGRATING|MOUTHWASH|RINSE|IRRIGATION)\\b";

function saysDoseForm(text) {
  return new RegExp(DOSE_FORMS, "i").test(String(text || ""));
}

// The form, as the name says it: its dose-form words ("oral tablet",
// "ophthalmic solution"), led by any release and salt words. They're the
// words after the last strength, or, with no strength, from the first
// dose-form word on (Epic's "azaTHIOprine (IMURAN) tablet"). A brand in
// brackets is left off. Null when the name says no dose form: release and
// salt words alone never make one.
export function formOf(name) {
  var parts = atLastStrength(name);
  var lead = parts.before;
  var tail = parts.after;
  if (!parts.found) {
    var at = new RegExp(DOSE_FORMS, "i").exec(lead);
    tail = at ? lead.slice(at.index) : "";
    lead = at ? lead.slice(0, at.index) : lead;
  }
  if (!saysDoseForm(tail)) return null;
  // A strength's own "/24HR" isn't a release time.
  var before = lead.replace(new RegExp(STRENGTH, "gi"), " ");
  var said = [];
  Array.from(before.matchAll(FORM_WORDS)).forEach(function (match) {
    var word = match[0].toLowerCase().replace(/[\s-]+/g, " ").replace(/^(\d+) ?hr$/, "$1 hr");
    if (said.indexOf(word) === -1) said.push(word);
  });
  return said.concat([tail.trim().toLowerCase().replace(/\s+/g, " ")]).join(" ");
}

// The name cut at its last strength: what's before it, and the words after.
function atLastStrength(name) {
  var text = expandCombined(String(name || "").replace(/\s*\[[^\]]*\]/g, ""));
  var all = Array.from(text.matchAll(new RegExp(STRENGTH, "gi")));
  var last = all[all.length - 1];
  if (!last) return { before: text, after: "", found: false };
  return { before: text.slice(0, last.index), after: text.slice(last.index + last[0].length).trim(), found: true };
}

function isNewer(a, b) {
  return (a.lastDate || "") > (b.lastDate || "");
}

function makeItem(parts) {
  var name = parts.drug.name ? parts.drug.name.trim() : "";
  var rxcui = parts.drug.rxcui;
  var item = {
    // Medicines with no name and no code can't be told apart, so each keeps
    // its own line instead of merging into one "Unnamed medicine".
    // A strength-only code (SCDC) is one medicine only in one form.
    key: rxcui ? "rx:" + rxcui + (parts.drug.partCode ? "|" + formOf(name) : "") : (name ? "text:" + name.toLowerCase() + doseKey(parts) : "unnamed:" + (unnamedCount += 1)),
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
    kind: parts.kind,
    hospital: parts.hospital,
    recordRef: parts.resource.id ? parts.kind === "request" ? "MedicationRequest/" + parts.resource.id : "MedicationStatement/" + parts.resource.id : null,
    updated: (parts.resource.meta && parts.resource.meta.lastUpdated) || null,
    asserted: (parts.kind === "statement" && parts.resource.dateAsserted) || null,
    stoppedOn: (parts.kind === "statement" && parts.end) || null,
    origin: "records",
    prn: parts.prn,
    // What the record says in codes, for the QR code. Never shown.
    fhir: parts.coded,
    lastDate: parts.lastDate,
    firstDate: parts.start,
    count: 1
  };
  if (parts.drug.ingredientOnly) item.ingredientOnly = true;
  if (parts.drug.partCode) item.partCode = true;
  return item;
}

// Cerner codes lisinopril 5 mg and 40 mg both as plain "lisinopril", with
// the strength only in the dose. Coded only by ingredient, a record's codes
// and dose are part of its key, so two strengths in one source stay two
// lines, and two codes never become one.
function doseKey(parts) {
  if (!parts.drug.ingredientOnly) return "";
  var said = [parts.drug.rxnorm.join("+"), parts.dosage.dose, parts.dosage.frequency].filter(Boolean);
  return said.length ? "|" + said.join("|").toLowerCase() : "";
}

function readDrug(resource, medications, types) {
  var reference = resource.medicationReference;
  var concept = conceptOf(resource, medications);
  if (!concept) {
    // Servers often put the name on the reference itself.
    return { name: (reference && reference.display) || null, rxcui: null, codes: [] };
  }
  var codings = (Array.isArray(concept.coding) ? concept.coding : []).filter(Boolean);
  var rxnorm = codings.filter(function (coding) { return coding.system === RXNORM && coding.code; });
  var text = concept.text && !PLACEHOLDER.test(concept.text.trim()) ? concept.text : null;
  var chosen = pickCode(rxnorm, types, text);
  var rank = chosen ? rankOf(chosen, types, text) : null;
  var ingredientOnly = Boolean(chosen) && rank >= INGREDIENT_RANK;
  var rxcui = chosen && !ingredientOnly ? currentCode(String(chosen.code), types) : null;
  var named = (chosen && chosen.display) || (rxnorm[0] && rxnorm[0].display);
  // A coded medicine always has a name, so it's never taken for a placeholder.
  var unnamed = chosen ? "Unnamed medicine (RxNorm " + (rxcui || chosen.code) + ")" : null;
  var drug = {
    // A placeholder text like "Medication" gives way to the coded name.
    name: text || named || (codings[0] && codings[0].display) || unnamed || concept.text || null,
    rxcui: rxcui,
    codes: shareable(codings, rxcui)
  };
  if (rank === PART_RANK) drug.partCode = true;
  if (ingredientOnly) {
    drug.ingredientOnly = true;
    drug.rxnorm = rxnorm.map(function (coding) { return String(coding.code); }).sort();
  }
  return drug;
}

// The code the record is: the one the prescriber picked, else its most
// specific product (Epic lists the ingredients' codes first). text is the
// record's own words.
function pickCode(rxnorm, types, text) {
  var picked = rxnorm.filter(function (coding) { return coding.userSelected === true && rankOf(coding, types, text) < INGREDIENT_RANK; })[0];
  if (picked) return picked;
  return rxnorm.slice().sort(function (a, b) { return rankOf(a, types, text) - rankOf(b, types, text); })[0] || null;
}

// Lower is more specific. With no term type from RxNav, a code counts only
// when its name reads as a product: a strength and a dose form after it.
// Any other is taken as ingredient-level, a code with no name too: Epic
// puts the ingredient's code first, often with no name.
function rankOf(coding, types, text) {
  var type = types && types.get(String(coding.code));
  var tty = type && type.tty;
  if (tty) {
    if (PRODUCT_TYPES.indexOf(tty) !== -1) return PRODUCT_TYPES.indexOf(tty);
    return tty === "SCDC" && formOf(text) ? PART_RANK : INGREDIENT_RANK;
  }
  return isProductName(coding.display) ? PRODUCT_TYPES.length : INGREDIENT_RANK;
}

// A strength and a dose form after it: "lisinopril 10 MG Oral Tablet".
export function isProductName(name) {
  var parts = atLastStrength(String(name || "").trim());
  return parts.found && saysDoseForm(parts.after);
}

// A code RxNorm retired for one current code is matched as that code.
function currentCode(code, types) {
  var type = types && types.get(code);
  return (type && type.remappedTo) || code;
}

// What the record says the medicine is: its own code, or the Medication it
// points to.
function conceptOf(resource, medications) {
  if (resource.medicationCodeableConcept) return resource.medicationCodeableConcept;
  var medication = medicationFor(resource, medications);
  return (medication && medication.code) || null;
}

// The Medication a reference points to, as long as the answer has it:
// contained in the record ("#med1"), a document's "urn:uuid:..." or an
// address, or "Medication/123" (absolute or relative).
function medicationFor(resource, medications) {
  var reference = resource.medicationReference && resource.medicationReference.reference;
  if (!reference) return null;
  reference = String(reference);
  if (reference.charAt(0) === "#") {
    return (Array.isArray(resource.contained) ? resource.contained : []).filter(function (one) {
      return Boolean(one) && one.resourceType === "Medication" && "#" + one.id === reference;
    })[0] || null;
  }
  var map = medications || new Map();
  if (map.has(reference)) return map.get(reference);
  var relative = /(?:^|\/)(Medication\/[^\/?#]+)(?:\/_history\/[^\/?#]+)?$/.exec(reference);
  return (relative && map.get(relative[1])) || null;
}

// Every Medication in an answer, by its fullUrl and by "Medication/<id>".
// entries are Bundle entries, or bare resources.
export function medicationsFrom(entries) {
  var map = new Map();
  (entries || []).forEach(function (entry) {
    var resource = entry && entry.resourceType ? entry : entry && entry.resource;
    if (!resource || resource.resourceType !== "Medication") return;
    if (entry.fullUrl) map.set(String(entry.fullUrl), resource);
    if (resource.id) map.set("Medication/" + resource.id, resource);
  });
  return map;
}

// The record's RxNorm codes, for looking their term types up, likeliest
// product first: the one the prescriber picked, then names that read as a
// product, then the rest from the last (Epic lists ingredients first).
export function rxnormCodesOf(resource, medications) {
  var concept = conceptOf(resource, medications);
  var rxnorm = (concept && Array.isArray(concept.coding) ? concept.coding : []).filter(function (coding) {
    return Boolean(coding) && coding.system === RXNORM && coding.code;
  });
  var score = function (coding) { return coding.userSelected === true ? 0 : isProductName(coding.display) ? 1 : 2; };
  return rxnorm.map(function (coding, index) { return { coding: coding, index: index }; }).sort(function (a, b) {
    return score(a.coding) - score(b.coding) || b.index - a.index;
  }).map(function (one) { return String(one.coding.code); }).filter(function (code, i, all) { return all.indexOf(code) === i; });
}

// "no-info" or "none-known" for an IPS "no medicines" entry, else null.
export function noMedicinesKind(resource, medications) {
  var concept = conceptOf(resource, medications);
  var found = (concept && Array.isArray(concept.coding) ? concept.coding : []).filter(function (coding) {
    return Boolean(coding) && coding.system === ABSENT_UNKNOWN && own(NO_MEDICINES, coding.code);
  })[0];
  return found ? NO_MEDICINES[found.code] : null;
}

// RxNorm first, then NDC. Other systems stay out: some are licensed, and some
// only say there is no code. A record coded only by ingredient keeps no
// RxNorm code, so it can't join by one later either.
function shareable(codings, rxcui) {
  var ndc = codings.filter(function (coding) { return coding.system === NDC && coding.code; });
  return (rxcui ? [{ system: RXNORM, code: rxcui }] : []).concat(ndc).slice(0, 3).map(function (coding) {
    return { system: coding.system, code: String(coding.code) };
  });
}

var DOSAGE_PARTS = ["text", "sequence", "route", "asNeededBoolean", "doseAndRate", "timing"];
var CODED_REPEAT = ["frequency", "period", "periodUnit", "when"];
var PERIOD_UNITS = ["s", "min", "h", "d", "wk", "mo", "a"];

// A record's directions in codes, all or nothing: part of a direction can mean
// something else. Null when any of it can't go.
function codedDosage(dosageInstruction) {
  var entries = (Array.isArray(dosageInstruction) ? dosageInstruction : []).filter(Boolean);
  if (entries.length !== 1 || !onlyKeys(entries[0], DOSAGE_PARTS)) return null;
  var dosage = entries[0];
  var out = {};
  if (dosage.timing) {
    if (!onlyKeys(dosage.timing, ["repeat", "code"])) return null;
    if (dosage.timing.repeat) {
      out.repeat = codedRepeat(dosage.timing.repeat);
      if (!out.repeat) return null;
      // A code that says something else is the record's whole schedule.
      var code = codeWords(dosage.timing.code);
      if (dosage.timing.code && !(code && sameSchedule(code, repeatWords(out.repeat) || ""))) return null;
    }
  }
  if (dosage.doseAndRate) {
    var rates = dosage.doseAndRate;
    if (!Array.isArray(rates) || rates.length !== 1 || !rates[0] || !onlyKeys(rates[0], ["type", "doseQuantity"])) return null;
    if (rates[0].doseQuantity) {
      out.quantity = codedQuantity(rates[0].doseQuantity);
      if (!out.quantity) return null;
    }
  }
  if (dosage.asNeededBoolean === true) out.asNeeded = true;
  return Object.keys(out).length ? out : null;
}

function codedRepeat(repeat) {
  if (!onlyKeys(repeat, CODED_REPEAT)) return null;
  var timed = repeat.frequency !== undefined || repeat.period !== undefined || repeat.periodUnit !== undefined;
  if (timed && !(Number.isInteger(repeat.frequency) && repeat.frequency > 0 && isPositive(repeat.period) && PERIOD_UNITS.indexOf(repeat.periodUnit) !== -1)) return null;
  var when = repeat.when || [];
  if (!Array.isArray(when) || !when.every(function (code) { return own(WHEN_WORDS, code); }) || (!timed && !when.length)) return null;
  return Object.assign(timed ? { frequency: repeat.frequency, period: repeat.period, periodUnit: repeat.periodUnit } : {}, when.length ? { when: when.slice() } : {});
}

function codedQuantity(quantity) {
  if (!onlyKeys(quantity, ["value", "unit", "system", "code"]) || !isPositive(quantity.value)) return null;
  var words = ["unit", "system", "code"].filter(function (key) { return quantity[key] !== undefined; });
  if (!words.every(function (key) { return typeof quantity[key] === "string" && quantity[key]; })) return null;
  // FHIR: a code needs its system.
  if (quantity.code && !quantity.system) return null;
  return Object.assign({}, quantity);
}

function isPositive(value) {
  return typeof value === "number" && isFinite(value) && value > 0;
}

function onlyKeys(object, keys) {
  return Boolean(object) && typeof object === "object" && Object.keys(object).every(function (key) { return keys.indexOf(key) !== -1; });
}

var UNCLEAR_DOSE = "See the record for how much";

// The words give the coded amount with another unit: "Take 100 mg" beside
// 100 "mg/kg".
function wordsDisagree(text, rates) {
  return (Array.isArray(rates) ? rates : []).some(function (rate) {
    var quantity = rate && rate.doseQuantity;
    var unit = quantity && String(quantity.unit || quantity.code || "").replace(/\s+/g, "").toLowerCase();
    if (!unit || typeof quantity.value !== "number") return false;
    var said = new RegExp("(?:^|[^\\d.])" + String(quantity.value).replace(".", "\\.") + "(?:\\.0+)?\\s*([a-z\u00b5\u03bc\\[\\]{}/]+)", "i").exec(String(text));
    return Boolean(said) && said[1].toLowerCase() !== unit;
  });
}

function readDose(dosage) {
  var rates = (Array.isArray(dosage.doseAndRate) ? dosage.doseAndRate : []).filter(Boolean);
  if (!rates.length) return null;
  // Ordered and calculated are two ways of saying one dose.
  var ordered = rates.filter(function (rate) { return rate.type && ((rate.type.coding && rate.type.coding[0] && rate.type.coding[0].code) || rate.type.text) === "ordered"; });
  var all = (ordered.length === 1 ? ordered : rates).map(rateWords);
  if (all.every(function (words) { return words === null; })) return null;
  return all.every(function (words) { return words === all[0]; }) ? all[0] : UNCLEAR_DOSE;
}

function rateWords(rate) {
  var words = null;
  var quantity = rate.doseQuantity;
  if (quantity && quantity.value !== undefined) {
    words = amountWords(quantity);
  } else if (rate.doseRange) {
    var low = rate.doseRange.low;
    var high = rate.doseRange.high;
    var whole = low && high && low.value !== undefined && high.value !== undefined;
    words = whole ? low.value + " to " + amountWords(high) : UNCLEAR_DOSE;
  }
  if (!rate.rateQuantity && !rate.rateRatio && !rate.rateRange) return words;
  return words ? words + ", see the record for the rate" : UNCLEAR_DOSE;
}

function amountWords(quantity) {
  return ((quantity.comparator || "") + quantity.value + " " + (quantity.unit || quantity.code || "")).trim();
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

// How to take it, in words: the record's own, or its schedule; then anything
// beside it that isn't said yet. A schedule with any part that can't be put in
// words sends the reader to the record: half a schedule reads as the whole.
function readFrequency(dosage) {
  var said = dosage.text ? [dosage.text] : scheduleParts(dosage);
  var line = said.join(", ");
  var also = dosage.text ? besideText(dosage) : [];
  [dosage.patientInstruction].concat((dosage.additionalInstruction || []).map(conceptWords)).forEach(function (extra) {
    if (extra) also.push(String(extra));
  });
  also.forEach(function (extra) {
    if (plain(line).indexOf(plain(extra)) === -1) line = line ? line + "; " + extra : extra;
  });
  return line || null;
}

function scheduleParts(dosage) {
  if (dosage.modifierExtension) return [UNCLEAR];
  return [readTiming(dosage.timing), asNeededWords(dosage), hasMost(dosage) ? MOST : null].filter(Boolean);
}

// Said in codes but not in the record's words.
function besideText(dosage) {
  var out = [];
  var needed = asNeededWords(dosage);
  if (needed && !/\b(as needed|as required|if needed|when needed|prn)\b/i.test(dosage.text)) out.push(needed);
  if (hasMost(dosage) && !/\b(max|maximum|no more than|not? exceed|up to)\b/i.test(dosage.text)) out.push(MOST);
  if (dosage.modifierExtension) out.push("see the record for more");
  return out;
}

var MOST = "see the record for the most to take";
function hasMost(dosage) {
  return Boolean(dosage.maxDosePerPeriod || dosage.maxDosePerAdministration || dosage.maxDosePerLifetime);
}

function asNeededWords(dosage) {
  if (dosage.asNeededCodeableConcept) {
    var why = conceptWords(dosage.asNeededCodeableConcept);
    return "as needed" + (why ? " for " + why : "");
  }
  return dosage.asNeededBoolean ? "as needed" : null;
}

// Every direction says as needed, in the field for it. Words alone don't count:
// they can say the opposite.
function allAsNeeded(dosageInstruction) {
  var entries = (Array.isArray(dosageInstruction) ? dosageInstruction : []).filter(Boolean);
  return entries.length > 0 && entries.every(function (entry) { return Boolean(asNeededWords(entry)); });
}

function conceptWords(concept) {
  return (concept && (concept.text || (concept.coding && concept.coding[0] && concept.coding[0].display))) || null;
}

function plain(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// The schedule's own words (Timing.code) and its numbers. FHIR takes the code as
// the whole schedule, so both are said when they differ.
function readTiming(timing) {
  if (!timing || !Object.keys(timing).length) return null;
  if (timing.modifierExtension) return UNCLEAR;
  var code = codeWords(timing.code);
  var numbers = timing.repeat && !timing.event ? repeatWords(timing.repeat) : null;
  if (numbers) return !code || sameSchedule(code, numbers) ? numbers : code + "; " + numbers;
  if (!code) return UNCLEAR;
  return timing.repeat || timing.event ? code + ", see the record for the rest" : code;
}

function sameSchedule(a, b) {
  var count = function (text) { return plain(text).replace(/\btwice\b/g, "2 times"); };
  return count(a) === count(b);
}

function codeWords(code) {
  if (!code) return null;
  var coding = (code.coding && code.coding[0]) || {};
  return code.text || own(CODE_WORDS, coding.code) || coding.display || null;
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
