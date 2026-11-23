// The patient's allergies: the records' (FHIR AllergyIntolerance) and their
// own, joined into one card each, with the reaction and who says so. A
// failed read never turns into "no allergies". No DOM here, so Node's test
// runner can check it.

import { listDate } from "./offline.js";

var SNOMED = "http://snomed.info/sct";
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var NOT_NOW = ["inactive", "resolved"];
var NOT_REAL = ["entered-in-error", "refuted"];
var UNCONFIRMED = ["unconfirmed", "presumed"];
export var NOT_SURE = "Not sure";

// Codes that say the patient has none, so they're statements, not allergies.
var NONE_CODES = {
  "716186003": "No known allergy",
  "409137002": "No known drug allergy",
  "429625007": "No known food allergy",
  "428607008": "No known environmental allergy"
};

// The SNOMED code for a statement, or null.
export function noneCode(statement) {
  return Object.keys(NONE_CODES).filter(function (code) { return NONE_CODES[code] === statement; })[0] || null;
}

// What the add form offers, with "Other…" after. The codes are RxNorm
// ingredients, checked against RxNav on 2026-11-23; the others are words.
var RXCUI = { Amoxicillin: "723", Aspirin: "1191", Ibuprofen: "5640", Codeine: "2670" };
export var ALLERGENS = ["Penicillin", "Amoxicillin", "Sulfa antibiotics", "Aspirin", "Ibuprofen", "Codeine", "Contrast dye", "Latex", "Peanuts", "Tree nuts", "Shellfish", "Eggs", "Milk", "Bee stings"]
  .map(function (label) { return RXCUI[label] ? { label: label, rxcui: RXCUI[label] } : { label: label }; });
export var REACTIONS = ["Hives or rash", "Itching", "Swelling of the face, lips or throat", "Trouble breathing", "Severe reaction (anaphylaxis)", "Nausea or vomiting", NOT_SURE]
  .map(function (label) { return { label: label }; });

// SNOMED names end in what kind of thing they are: "Mold (organism)".
function withoutKind(text) {
  return String(text || "").replace(/\s*\((?:organism|substance|disorder|finding|product|physical object|situation)\)\s*$/i, "").trim();
}

function plainName(name) {
  return withoutKind(name).toLowerCase().replace(/\s+/g, " ");
}

function codesOf(concept) {
  return ((concept && concept.coding) || []).filter(function (c) { return c && c.code; });
}

function words(concept) {
  var shown = codesOf(concept).concat((concept && concept.coding) || []).filter(function (c) { return c && c.display; })[0];
  return withoutKind((concept && concept.text) || (shown && shown.display) || "");
}

function hasStatus(concept, list) {
  return codesOf(concept).some(function (c) { return list.indexOf(c.code) !== -1; });
}

export function statementOf(resource, name) {
  var none = codesOf(resource.code).filter(function (c) { return c.system === SNOMED && NONE_CODES[c.code]; })[0];
  if (none) return NONE_CODES[none.code];
  if (/^no known allerg(y|ies)$/i.test(name)) return "No known allergy";
  return /^no known (drug|medication|food|environmental) allerg(y|ies)$/i.test(name) ? name : null;
}

function reactionsOf(resource) {
  var out = [];
  (resource.reaction || []).forEach(function (reaction) {
    var texts = (reaction.manifestation || []).map(words).filter(Boolean);
    if (!texts.length && reaction.description) texts = [reaction.description];
    texts.forEach(function (text) { out.push({ text: text, severity: reaction.severity || null }); });
  });
  return out;
}

function itemFrom(resource, sourceName, index) {
  var name = words(resource.code);
  var code = codesOf(resource.code)[0];
  var keys = codesOf(resource.code).map(function (c) { return "alg:" + (c.system || "") + "|" + c.code; });
  if (name) keys.push("alg:name:" + plainName(name));
  if (!keys.length) keys.push("alg:id:" + (resource.id || "none-" + index));
  return {
    key: keys[0],
    otherKeys: keys.slice(1),
    name: name || "Unnamed allergy",
    code: code ? { system: code.system || null, code: code.code } : null,
    reactions: reactionsOf(resource),
    intolerance: resource.type === "intolerance",
    unconfirmed: hasStatus(resource.verificationStatus, UNCONFIRMED),
    highRisk: resource.criticality === "high",
    source: sourceName
  };
}

function allKeys(item) {
  return [item.key].concat(item.otherKeys || []);
}

function join(into, item) {
  allKeys(item).forEach(function (key) {
    if (allKeys(into).indexOf(key) === -1) into.otherKeys.push(key);
  });
  item.reactions.forEach(function (reaction) {
    var same = into.reactions.filter(function (r) { return r.text.toLowerCase() === reaction.text.toLowerCase(); })[0];
    if (!same) into.reactions.push(reaction);
    else if (!same.severity) same.severity = reaction.severity;
  });
  into.intolerance = into.intolerance && item.intolerance;
  into.unconfirmed = into.unconfirmed && item.unconfirmed;
  into.highRisk = into.highRisk || item.highRisk;
  if (into.name === "Unnamed allergy") into.name = item.name;
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

export function fromAllergyRecords(resources, sourceName) {
  var items = [];
  var statements = [];
  (resources || []).forEach(function (resource, index) {
    if (!resource || resource.resourceType !== "AllergyIntolerance") return;
    if (hasStatus(resource.verificationStatus, NOT_REAL) || hasStatus(resource.clinicalStatus, NOT_NOW)) return;
    var statement = statementOf(resource, words(resource.code));
    if (statement) {
      if (statements.indexOf(statement) === -1) statements.push(statement);
      return;
    }
    var item = itemFrom(resource, sourceName, index);
    // One record can link two allergies already read (the code of one, the
    // name of the other); then all of them are one.
    var same = items.filter(function (other) {
      return allKeys(other).some(function (key) { return allKeys(item).indexOf(key) !== -1; });
    });
    if (!same.length) {
      items.push(item);
      return;
    }
    join(same[0], item);
    same.slice(1).forEach(function (other) {
      join(same[0], other);
      items.splice(items.indexOf(other), 1);
    });
  });
  return { items: items.sort(byName), statements: statements };
}

// Every page, inside ms, like the claims. "refused" means this sign-in can't
// read allergies (an older pass). Anything that isn't a Bundle is a failure,
// so an odd answer never reads as an empty list.
export async function readAllergies(request, patientId, sourceName, ms) {
  var deadline = Date.now() + ms;
  var timer;
  var nothing = function (status) { return { status: status, items: [], statements: [] }; };
  var late = new Promise(function (resolve) {
    timer = setTimeout(function () { resolve(nothing("failed")); }, ms);
  });
  var work = (async function () {
    var found = [];
    var url = "AllergyIntolerance?patient=" + encodeURIComponent(patientId);
    while (url) {
      if (Date.now() >= deadline) return nothing("failed");
      var bundle = await request(url);
      if (!bundle || bundle.resourceType !== "Bundle") return nothing("failed");
      (bundle.entry || []).forEach(function (entry) { if (entry && entry.resource) found.push(entry.resource); });
      var next = (bundle.link || []).filter(function (l) { return l.relation === "next" && l.url; })[0];
      url = next ? next.url : null;
    }
    return Object.assign({ status: "loaded" }, fromAllergyRecords(found, sourceName));
  })().catch(function (error) {
    var status = error && (error.status || (error.response && error.response.status));
    return nothing(status === 401 || status === 403 ? "refused" : "failed");
  });
  return Promise.race([work, late]).finally(function () { clearTimeout(timer); });
}

// What to show: the new ones when they loaded, else the saved ones with
// their date. result is null when nothing was asked for (opening a saved
// list); no saved copy then means it was made before Brown Bag had allergies.
export function keepAllergies(result, saved) {
  if (result && result.status === "loaded") {
    return { status: "loaded", items: result.items, statements: result.statements, savedAt: null };
  }
  return {
    status: result ? result.status : (saved ? "loaded" : "not-loaded"),
    items: saved ? saved.items : [],
    statements: saved ? saved.statements : [],
    savedAt: saved ? saved.savedAt : null
  };
}

export function sameAllergen(name, cards) {
  var plain = plainName(name);
  return (cards || []).filter(function (card) { return plain && plainName(card.name) === plain; })[0] || null;
}

// One card per allergy: the record's, with the patient's reaction on it, or
// the patient's own.
export function arrangeAllergies(allergies, data) {
  var reactions = (data && data.allergyReactions) || {};
  var cards = allergies.items.map(function (item) {
    var mineKey = allKeys(item).filter(function (key) { return Object.prototype.hasOwnProperty.call(reactions, key); })[0] || null;
    return Object.assign({}, item, {
      origin: "records",
      mineKey: mineKey,
      mine: mineKey ? { id: null, reaction: reactions[mineKey].reaction, addedAt: reactions[mineKey].addedAt } : null
    });
  });
  ((data && data.allergies) || []).forEach(function (own) {
    var mine = { id: own.id, reaction: own.reaction, addedAt: own.addedAt };
    var card = sameAllergen(own.name, cards);
    if (card) {
      card.mine = mine;
      return;
    }
    cards.push({
      key: "own:" + own.id, otherKeys: [], name: own.name.trim(), code: null, rxcui: own.rxcui || null, reactions: [],
      intolerance: false, unconfirmed: false, highRisk: false, source: null, origin: "added", mineKey: null, mine: mine
    });
  });
  var none = (data && data.noKnownAllergies) || null;
  return {
    cards: cards.sort(byName),
    statements: allergies.statements,
    saidNone: cards.length ? null : none,
    canSayNone: !cards.length && !none && (allergies.status === "loaded" || Boolean(allergies.savedAt)),
    count: cards.length
  };
}

export function reactionWords(reaction) {
  return reaction.text + (reaction.severity ? " (" + reaction.severity + ")" : "");
}

export function reactionLine(card) {
  var parts = card.reactions.map(reactionWords);
  var byMe = card.origin === "added" ? "" : " (added by me)";
  if (card.mine && card.mine.reaction === NOT_SURE) {
    if (!parts.length) return "Reaction not known" + byMe;
  } else if (card.mine) {
    parts.push(card.mine.reaction + byMe);
  }
  return parts.length ? "Reaction: " + parts.join(" · ") : "Reaction not in your records";
}

export function longDate(date) {
  var parts = String(date).slice(0, 10).split("-").map(Number);
  return MONTHS[parts[1] - 1] + " " + parts[2] + ", " + parts[0];
}

export function detailLines(card) {
  return [
    card.highRisk ? "Marked high risk" : null,
    card.intolerance ? "Intolerance" : null,
    card.unconfirmed ? "Not confirmed" : null,
    card.origin === "added" ? "Added by me · " + longDate(card.mine.addedAt) : card.source
  ].filter(Boolean);
}

// The lines at the top of the section when the records' allergies aren't
// fresh. Nothing here ever says "none".
export function allergyNotes(allergies, now) {
  var from = allergies.savedAt ? "These are from " + listDate(allergies.savedAt, now) + "." : null;
  if (allergies.status === "refused") {
    return [{ text: from ? "Sign in again to update your allergies. " + from : "Sign in again to add your allergies.", signIn: true }];
  }
  if (allergies.status === "failed") {
    return [{ text: from ? "Your allergies couldn't be updated. " + from : "Your allergies couldn't be loaded.", signIn: false }];
  }
  if (allergies.status === "not-loaded") {
    return [{ text: "Your allergies haven't been loaded yet.", signIn: false }];
  }
  return from ? [{ text: from, signIn: false }] : [];
}

export function allergyDraftStarted(draft) {
  return Boolean(draft && (draft.allergen.choice || draft.reaction.choice));
}

// reactionTo: the allergy from the records whose reaction was being added.
export function unsavedAllergyText(draft, reactionTo) {
  var name = draft.allergen.choice === "other" ? draft.allergen.other.trim() : draft.allergen.choice;
  var what = reactionTo ? "The reaction to " + reactionTo : (name || "The allergy you were adding");
  return what + " isn't saved yet. Open My medicines to finish adding it.";
}
