// The patient's allergies: the records' (FHIR AllergyIntolerance) and their
// own, joined into one card each, with the reaction and who says so. A
// failed read never turns into "no allergies". No DOM here, so Node's test
// runner can check it.

import { listDate } from "./offline.js";

var SNOMED = "http://snomed.info/sct";
var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
// Codes that mean "no code", so they never say two records are one allergy.
var NO_CODE = /data-absent-reason|NullFlavor/i;
var SEVERITIES = ["mild", "moderate", "severe"];
export var UNNAMED = "Unnamed allergy";
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

// "Allergic disposition": someone tends to have allergies, but not to what.
export var UNSPECIFIED = { system: SNOMED, code: "609328004" };
var UNSPECIFIED_NAME = "Allergic disposition";

export function isUnspecified(resource) {
  var coded = codesOf(resource.code).some(function (c) { return c.system === SNOMED && c.code === UNSPECIFIED.code; });
  return (coded || words(resource.code).toLowerCase() === UNSPECIFIED_NAME.toLowerCase()) && !(resource.reaction || []).length;
}

// The sentence both screens use: whose records, and who to ask.
export function unspecifiedSentence(count, listed, records, ask) {
  if (!count) return null;
  var what = count === 1 ? "an allergy entry that doesn't say what it's to" : count + " allergy entries that don't say what they're to";
  return records + (listed ? " also" : "") + " have " + what + ". " + ask;
}

export function unspecifiedText(count, listed) {
  return unspecifiedSentence(count, listed, "Your records", "Ask your care team.");
}

// The SNOMED code for a statement, or null.
export function noneCode(statement) {
  return Object.keys(NONE_CODES).filter(function (code) { return NONE_CODES[code] === statement; })[0] || null;
}

// What the add form offers, with "Other…" after. The codes are RxNorm
// ingredients, checked against RxNav on 2026-11-23; the others are words.
var RXCUI = { Amoxicillin: "723", Aspirin: "1191", Ibuprofen: "5640", Codeine: "2670", "Bee stings": "124427" };
function choices(category, labels) {
  return labels.map(function (label) {
    return Object.assign({ label: label, category: category }, RXCUI[label] ? { rxcui: RXCUI[label] } : {});
  });
}
// The category is FHIR's own (AllergyIntolerance.category).
export var ALLERGENS = choices("medication", ["Penicillin", "Amoxicillin", "Sulfa antibiotics", "Aspirin", "Ibuprofen", "Codeine", "Contrast dye"])
  .concat(choices("environment", ["Latex"]), choices("food", ["Peanuts", "Tree nuts", "Shellfish", "Eggs", "Milk"]), choices("environment", ["Bee stings"]));
// One thing each: a code for "nausea or vomiting" would say both happened.
export var REACTIONS = ["Hives", "Rash", "Itching", "Swelling of the face, lips or throat", "Trouble breathing", "Severe reaction (anaphylaxis)", "Nausea", "Vomiting", NOT_SURE]
  .map(function (label) { return { label: label }; });

export function allergenNamed(name) {
  return ALLERGENS.filter(function (choice) { return plainName(choice.label) === plainName(name); })[0] || null;
}

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

function worst(a, b) {
  return SEVERITIES.indexOf(b) > SEVERITIES.indexOf(a) ? b : a;
}

function bare(coding) {
  return { system: coding.system || null, code: coding.code };
}

function reactionsOf(resource) {
  var out = [];
  (resource.reaction || []).forEach(function (reaction) {
    var severity = SEVERITIES.indexOf(reaction.severity) === -1 ? null : reaction.severity;
    var found = (reaction.manifestation || []).filter(function (m) { return words(m) || codesOf(m).length; });
    // A reaction with no words is still a reaction.
    if (!found.length) found = [{ text: reaction.description || "Unnamed reaction" }];
    found.forEach(function (m) {
      var codes = codesOf(m).map(bare);
      out.push(Object.assign({ text: words(m) || "Unnamed reaction", severity: severity }, codes.length ? { codes: codes } : {}));
    });
  });
  return out;
}

// The values FHIR R4 allows, so what's shared is valid whatever came in.
// ("presumed" is a newer version's word for less than confirmed.)
var CLINICAL = ["active", "recurrence", "relapse"];
var VERIFICATION = { confirmed: "confirmed", unconfirmed: "unconfirmed", presumed: "unconfirmed" };
var TYPES = ["allergy", "intolerance"];
var CATEGORIES = ["food", "medication", "environment", "biologic"];
var CRITICALITIES = ["unable-to-assess", "low", "high"];

function oneOf(value, allowed) {
  return allowed.indexOf(value) === -1 ? null : value;
}

function fhirOf(resource) {
  var verification = codesOf(resource.verificationStatus)[0];
  var date = /^\d{4}(-\d\d(-\d\d)?)?/.exec(resource.recordedDate || "");
  return {
    verification: (verification && VERIFICATION[verification.code]) || null,
    type: oneOf(resource.type, TYPES),
    category: (resource.category || []).filter(function (c) { return CATEGORIES.indexOf(c) !== -1; }),
    criticality: oneOf(resource.criticality, CRITICALITIES),
    recordedDate: date ? date[0] : null
  };
}

function joinFhir(a, b) {
  return {
    verification: a.verification === "confirmed" || b.verification === "confirmed" ? "confirmed" : a.verification || b.verification,
    type: a.type === b.type ? a.type : null,
    category: a.category.concat(b.category.filter(function (c) { return a.category.indexOf(c) === -1; })),
    criticality: CRITICALITIES.indexOf(b.criticality) > CRITICALITIES.indexOf(a.criticality) ? b.criticality : a.criticality,
    recordedDate: [a.recordedDate, b.recordedDate].filter(Boolean).sort()[0] || null
  };
}

function itemFrom(resource, sourceName) {
  var name = words(resource.code);
  var codes = codesOf(resource.code).filter(function (c) { return !NO_CODE.test(c.system || ""); });
  var keys = codes.map(function (c) { return "alg:" + (c.system || "") + "|" + c.code; });
  if (name) keys.push("alg:name:" + plainName(name));
  // Nothing to tell it by: its id, else what it does say.
  if (!keys.length) keys.push("alg:id:" + (resource.id || JSON.stringify([resource.recordedDate, resource.category, resource.type, resource.criticality, resource.onsetDateTime, reactionsOf(resource)])));
  return {
    key: keys[0],
    otherKeys: keys.slice(1),
    name: name || UNNAMED,
    codes: codes.map(bare),
    // Only current ones get here; with no status it's taken as active.
    clinical: oneOf((codesOf(resource.clinicalStatus)[0] || {}).code, CLINICAL) || "active",
    reactions: reactionsOf(resource),
    intolerance: resource.type === "intolerance",
    unconfirmed: hasStatus(resource.verificationStatus, UNCONFIRMED),
    highRisk: resource.criticality === "high",
    fhir: fhirOf(resource),
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
  item.codes.forEach(function (code) {
    var known = into.codes.some(function (c) { return c.system === code.system && c.code === code.code; });
    if (!known) into.codes.push(code);
  });
  item.reactions.forEach(function (reaction) {
    var same = into.reactions.filter(function (r) { return r.text.toLowerCase() === reaction.text.toLowerCase(); })[0];
    if (!same) into.reactions.push(reaction);
    else {
      same.severity = worst(same.severity, reaction.severity);
      if (!same.codes && reaction.codes) same.codes = reaction.codes;
    }
  });
  into.intolerance = into.intolerance && item.intolerance;
  into.unconfirmed = into.unconfirmed && item.unconfirmed;
  into.highRisk = into.highRisk || item.highRisk;
  into.fhir = joinFhir(into.fhir, item.fhir);
  if (into.name === UNNAMED) into.name = item.name;
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

// The same name is the same allergy. The same code is too, unless the names
// differ: codes like "Allergy to drug" cover many, and losing one of two
// names would hide an allergy.
function sameAllergy(a, b) {
  if (a.name !== UNNAMED && b.name !== UNNAMED) return plainName(a.name) === plainName(b.name);
  return allKeys(a).some(function (key) { return allKeys(b).indexOf(key) !== -1; });
}

export function fromAllergyRecords(resources, sourceName) {
  var items = [];
  var statements = [];
  var unspecified = 0;
  (resources || []).forEach(function (resource) {
    if (!resource || resource.resourceType !== "AllergyIntolerance") return;
    if (hasStatus(resource.verificationStatus, NOT_REAL) || hasStatus(resource.clinicalStatus, NOT_NOW)) return;
    var statement = statementOf(resource, words(resource.code));
    if (statement) {
      if (statements.indexOf(statement) === -1) statements.push(statement);
      return;
    }
    if (isUnspecified(resource)) {
      unspecified += 1;
      return;
    }
    var item = itemFrom(resource, sourceName);
    // One record can link two already read (a nameless one by its code, a
    // named one by its name); then all of them are one.
    var same = items.filter(function (other) { return sameAllergy(other, item); });
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
  items.sort(byName);
  // A code shared by two different allergies can't be the key of both.
  var taken = {};
  items.forEach(function (item) {
    var free = allKeys(item).filter(function (key) { return !taken[key]; })[0] || item.key + "#" + items.indexOf(item);
    item.otherKeys = allKeys(item).filter(function (key) { return key !== free; });
    item.key = free;
    taken[free] = true;
  });
  return { items: items, statements: statements, unspecified: unspecified };
}

// Every page, inside ms, like the claims. "refused" means this sign-in can't
// read allergies (an older pass). Anything that isn't a Bundle is a failure,
// so an odd answer never reads as an empty list.
export async function readAllergies(request, patientId, sourceName, ms) {
  var deadline = Date.now() + ms;
  var timer;
  var nothing = function (status) { return { status: status, items: [], statements: [], unspecified: 0 }; };
  var late = new Promise(function (resolve) {
    timer = setTimeout(function () { resolve(nothing("failed")); }, ms);
  });
  var work = (async function () {
    var found = [];
    var said = null;
    var url = "AllergyIntolerance?patient=" + encodeURIComponent(patientId);
    while (url) {
      if (Date.now() >= deadline) return nothing("failed");
      var bundle = await request(url);
      if (!bundle || bundle.resourceType !== "Bundle") return nothing("failed");
      (bundle.entry || []).forEach(function (entry) { if (entry && entry.resource) found.push(entry.resource); });
      if (typeof bundle.total === "number") said = bundle.total;
      var next = (bundle.link || []).filter(function (l) { return l.relation === "next" && l.url; })[0];
      url = next ? next.url : null;
    }
    // The server left something out, or says there are some and sent none.
    var withheld = found.some(function (r) {
      return r.resourceType === "OperationOutcome" && (r.issue || []).some(function (i) { return i.severity === "error" || i.severity === "fatal"; });
    });
    var read = found.some(function (r) { return r.resourceType === "AllergyIntolerance"; });
    if (withheld || (said > 0 && !read)) return nothing("failed");
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
export function keepAllergies(result, saved, now) {
  if (result && result.status === "loaded") {
    return { status: "loaded", items: result.items, statements: result.statements, unspecified: result.unspecified || 0, savedAt: null, updatedAt: (now || new Date()).toISOString() };
  }
  return {
    status: result ? result.status : (saved ? "loaded" : "not-loaded"),
    items: saved ? saved.items : [],
    statements: saved ? saved.statements : [],
    unspecified: (saved && saved.unspecified) || 0,
    savedAt: saved ? saved.savedAt : null
  };
}

export function sameAllergen(name, cards) {
  var plain = plainName(name);
  return (cards || []).filter(function (card) { return plain && plainName(card.name) === plain; })[0] || null;
}

// What the patient said about one card: from their own entries (ids) and
// from reactions added to a record (keys). Several keep every reaction.
function addMine(card, entry, reaction, addedAt) {
  var mine = card.mine || { ids: [], keys: [], reactions: [], reaction: NOT_SURE, addedAt: addedAt };
  if (entry.id) mine.ids.push(entry.id);
  else mine.keys.push(entry.key);
  if (reaction !== NOT_SURE && mine.reactions.indexOf(reaction) === -1) mine.reactions.push(reaction);
  mine.reaction = mine.reactions.length ? mine.reactions.join(" · ") : NOT_SURE;
  card.mine = mine;
}

// The card a saved reaction belongs to. Its name decides; its code only when
// no name matches and one card alone has that code (records get recoded).
function cardFor(saved, key, cards) {
  var byItsName = saved.name ? sameAllergen(saved.name, cards) : null;
  if (byItsName) return byItsName;
  var keys = [key].concat(saved.keys || []);
  var has = cards.filter(function (card) { return allKeys(card).some(function (k) { return keys.indexOf(k) !== -1; }); });
  return has.length === 1 ? has[0] : null;
}

// One card per allergy: the record's, with the patient's reaction on it, or
// the patient's own.
export function arrangeAllergies(allergies, data) {
  var reactions = (data && data.allergyReactions) || {};
  var cards = allergies.items.map(function (item) { return Object.assign({}, item, { origin: "records", mine: null }); });
  Object.keys(reactions).forEach(function (key) {
    var card = cardFor(reactions[key], key, cards);
    if (card) addMine(card, { key: key }, reactions[key].reaction, reactions[key].addedAt);
  });
  ((data && data.allergies) || []).forEach(function (own) {
    var byCode = own.rxcui && cards.filter(function (card) { return allKeys(card).indexOf("alg:" + RXNORM + "|" + own.rxcui) !== -1; });
    var card = sameAllergen(own.name, cards) || (byCode && byCode.length === 1 ? byCode[0] : null);
    if (!card) {
      card = {
        key: "own:" + own.id, otherKeys: [], name: own.name.trim(), codes: [], clinical: "active", rxcui: own.rxcui || (allergenNamed(own.name) || {}).rxcui || null, reactions: [],
        intolerance: false, unconfirmed: false, highRisk: false, source: null, origin: "added", mine: null
      };
      cards.push(card);
    }
    addMine(card, { id: own.id }, own.reaction, own.addedAt);
  });
  var none = (data && data.noKnownAllergies) || null;
  return {
    cards: cards.sort(byName),
    statements: allergies.statements,
    unspecified: allergies.unspecified || 0,
    saidNone: cards.length ? null : none,
    canSayNone: !cards.length && !none && (allergies.status === "loaded" || Boolean(allergies.savedAt)),
    count: cards.length
  };
}

// The patient's reaction to a card from the records (new or changed). One
// entry is left. When they had added the allergy themselves, that entry
// stays theirs, so it's still there if the record goes away.
export function setMyReaction(data, card, reaction, date) {
  var own = removeMine(data, card).own[0];
  if (own) {
    data.allergies.push(Object.assign({}, own, { reaction: reaction }));
    return;
  }
  data.allergyReactions[card.key] = { name: card.name === UNNAMED ? null : card.name, keys: allKeys(card), reaction: reaction, addedAt: date };
}

// Takes off everything the patient said about a card. Returns it for Undo.
export function removeMine(data, card) {
  var removed = { own: [], reactions: {} };
  if (!card.mine) return removed;
  removed.own = data.allergies.filter(function (a) { return card.mine.ids.indexOf(a.id) !== -1; });
  data.allergies = data.allergies.filter(function (a) { return card.mine.ids.indexOf(a.id) === -1; });
  card.mine.keys.forEach(function (key) {
    removed.reactions[key] = data.allergyReactions[key];
    delete data.allergyReactions[key];
  });
  return removed;
}

export function putBack(data, removed) {
  data.allergies = data.allergies.concat(removed.own);
  Object.assign(data.allergyReactions, removed.reactions);
}

// Typed words that mean "I have none", which has its own button.
export function saysNone(text) {
  return /^(none|nothing|n\/a|nka|nkda|no|no (known )?((drug|food|medication|medicine|environmental) )?allerg(y|ies))$/i.test(String(text || "").trim());
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

// Forms as the patient left them, by form: "new", or the key of the allergy
// whose reaction was being added. Empty ones, and ones for an allergy that's
// no longer there, are dropped.
export function keepDrafts(drafts, cards) {
  var out = {};
  Object.keys(drafts || {}).forEach(function (which) {
    var there = which === "new" || cards.some(function (card) { return card.key === which; });
    if (there && allergyDraftStarted(drafts[which])) out[which] = drafts[which];
  });
  return out;
}

// The form to open again: the one that was open, else any started one.
export function startedDraft(drafts, open) {
  if (open && allergyDraftStarted(drafts[open])) return open;
  return Object.keys(drafts || {}).filter(function (which) { return allergyDraftStarted(drafts[which]); })[0] || null;
}

// reactionTo: the allergy from the records whose reaction was being added.
export function unsavedAllergyText(draft, reactionTo) {
  var name = draft.allergen.choice === "other" ? draft.allergen.other.trim() : draft.allergen.choice;
  var what = reactionTo ? "The reaction to " + reactionTo : (name || "The allergy you were adding");
  return what + " isn't saved yet. Open My medicines to finish adding it.";
}

// Whether the allergies box carries its warning symbol: there is one, or
// they didn't load, so nobody can say there isn't.
export function showsSymbol(count, unspecified, status) {
  return count > 0 || unspecified > 0 || status !== "loaded";
}
