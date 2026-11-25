// Insurance pharmacy claims (FHIR ExplanationOfBenefit) into "fills", matched
// to the medicine list, so each medicine can say whether it was actually
// filled. The claims are their own source: a second insurer API (Medicare
// Blue Button 2.0) adds more fills the same way. No DOM here, so Node's
// test runner can check it.

import { heldBack } from "./read.js";
import { plainName } from "./reconcile.js";
import { formOf } from "./meds.js";

var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
var NDC = "http://hl7.org/fhir/sid/ndc";
var CLAIM_TYPE = "http://terminology.hl7.org/CodeSystem/claim-type";
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var RECENT_DAYS = 365;

function isPharmacy(eob) {
  var codings = (eob && eob.type && eob.type.coding) || [];
  return codings.some(function (c) { return c.system === CLAIM_TYPE && c.code === "pharmacy"; });
}

// A claim that was canceled, entered by mistake or never sent isn't a fill,
// and neither is asking the insurer ahead of time (a preauthorization).
var NOT_A_FILL = ["cancelled", "entered-in-error", "draft"];
function isRealClaim(eob) {
  return NOT_A_FILL.indexOf(eob.status) === -1 && (!eob.use || eob.use === "claim");
}

// CARIN writes the package as the drug's name: "Prozac, 100 CAPSULE in 1
// BOTTLE (0777-3105-02) (package)". The product is the part before it, so
// two package sizes are one medicine.
function productName(name) {
  var found = /^(.+?),\s*\d[\d.,]*\s+\S.*\bin\s+\d.*\(package\)\s*$/i.exec(name);
  return found ? found[1].trim() : name;
}

// One fill per item of each pharmacy claim. A claim marked NO_INSURANCE was
// still filled, paid another way. A fill coded only by NDC keeps it, for
// readClaims to look up.
export function fillsFromClaims(eobs) {
  var fills = [];
  (eobs || []).filter(isPharmacy).filter(isRealClaim).forEach(function (eob) {
    var insurer = eob.insurer && eob.insurer.display ? String(eob.insurer.display) : null;
    var cash = !insurer || /^no[_ ]insurance$/i.test(insurer);
    (eob.item || []).forEach(function (line) {
      var product = line.productOrService || {};
      var codings = product.coding || [];
      var rx = codings.filter(function (c) { return c.system === RXNORM && c.code; })[0];
      var ndc = codings.filter(function (c) { return c.system === NDC && c.code; })[0];
      var name = product.text || (rx && rx.display) || (codings[0] && codings[0].display) || null;
      var when = line.servicedDate || (line.servicedPeriod && line.servicedPeriod.start) || (eob.billablePeriod && eob.billablePeriod.start);
      if (!name && !rx) return;
      var fill = {
        rxcui: rx ? String(rx.code) : null,
        name: name ? productName(String(name)) : "",
        date: when ? String(when).slice(0, 10) : "",
        insurer: cash ? null : insurer,
        cash: cash,
        quantity: positive(line.quantity && line.quantity.value),
        daysSupply: daysSupplyOf(eob, line)
      };
      if (!rx && ndc) fill.ndc = String(ndc.code);
      fills.push(fill);
    });
  });
  return fills;
}

function positive(value) {
  return typeof value === "number" && isFinite(value) && value > 0 ? value : null;
}

// CARIN Blue Button's days supply (a supportingInfo coded "dayssupply";
// insurers write their own systems): the one the item points to, else the
// claim's only one, unless another item points to that.
function daysSupplyOf(eob, line) {
  var all = (eob.supportingInfo || []).filter(function (info) {
    return info && info.category && (info.category.coding || []).some(function (c) { return c && c.code === "dayssupply"; });
  });
  var pointsTo = function (one, info) { return (one.informationSequence || []).indexOf(info.sequence) !== -1; };
  var own = all.filter(function (info) { return pointsTo(line, info); })[0];
  var only = all.length === 1 && !(eob.item || []).some(function (other) { return other !== line && pointsTo(other, all[0]); }) ? all[0] : null;
  var found = own || only;
  return positive(found && found.valueQuantity && found.valueQuantity.value);
}

function emptyFills() {
  return { count: 0, last: null, insurers: [], cash: false, sizedOn: null, suggests: null };
}

function addFill(fills, fill) {
  fills.count += 1;
  if (fill.date && (!fills.last || fill.date > fills.last)) fills.last = fill.date;
  if (fill.insurer && fills.insurers.indexOf(fill.insurer) === -1) fills.insurers.push(fill.insurer);
  if (fill.cash) fills.cash = true;
  // Only the newest fill that says both: an older one's count may be out of
  // date, so a newest that makes no sense gives no hint at all.
  if (fill.quantity && fill.daysSupply && (fills.sizedOn === null || fill.date > fills.sizedOn)) {
    fills.sizedOn = fill.date;
    fills.suggests = suggests(fill.quantity, fill.daysSupply);
  }
}

// To the nearest half, and only when it could be a day's doses: one inhaler
// for 90 days, or 400 grams of cream, isn't a count of doses.
function suggests(quantity, days) {
  var perDay = Math.round(quantity / days * 2) / 2;
  return perDay >= 0.5 && perDay <= 12 ? { perDay: perDay, quantity: quantity, days: days } : null;
}

// The date can be a day, a month or just a year; all three parse as UTC.
function recent(date, now) {
  if (!date) return false;
  return now.getTime() - Date.parse(date) <= RECENT_DAYS * 24 * 60 * 60 * 1000;
}

function latestStart(items) {
  return items.slice().sort(function (a, b) { return String(b.start || "").localeCompare(String(a.start || "")); })[0];
}

function currentFirst(items) {
  var current = items.filter(function (i) { return i.status === "current"; });
  return current.length ? current : items;
}

function ingredientKey(ingredientOf, rxcui) {
  var found = rxcui && ingredientOf && ingredientOf.get(rxcui);
  return found ? found.rxcui : null;
}

function saltKey(ingredientOf, rxcui) {
  var found = rxcui && ingredientOf && ingredientOf.get(rxcui);
  return found ? (found.salt ? found.salt.rxcui : found.rxcui) : null;
}

// Another form or salt is another medicine: a metoprolol succinate fill
// isn't the tartrate prescription, and eye drops aren't the tablets. A
// form the names don't say can't be the same one.
function sameForm(fill, item, ingredientOf) {
  var form = formOf(fill.name);
  return form !== null && form === formOf(item.name) && saltKey(ingredientOf, fill.rxcui) === saltKey(ingredientOf, item.rxcui);
}

// Fills of one drug together: the same code or the same plain name. A fill
// can link two groups (the code of one, the name of the other), which then
// become one.
function groupSameDrug(fills) {
  var groups = [];
  fills.forEach(function (fill) {
    var name = plainName(fill.name);
    var same = groups.filter(function (g) { return (fill.rxcui && g.codes.has(fill.rxcui)) || (name && g.names.has(name)); });
    var joined = { codes: new Set(), names: new Set(), list: [] };
    same.forEach(function (g) {
      g.codes.forEach(function (c) { joined.codes.add(c); });
      g.names.forEach(function (n) { joined.names.add(n); });
      joined.list = joined.list.concat(g.list);
    });
    if (fill.rxcui) joined.codes.add(fill.rxcui);
    if (name) joined.names.add(name);
    joined.list.push(fill);
    groups = groups.filter(function (g) { return same.indexOf(g) === -1; }).concat([joined]);
  });
  return groups.map(function (g) { return g.list; });
}

// One card for a drug no record lists. It shows the newest fill's name. Its
// key comes from the oldest fill, so it stays the same as new fills come in;
// the other keys are kept so a Not taking or As needed mark under one of them holds.
function fillOnlyItem(group) {
  var fills = emptyFills();
  group.forEach(function (fill) { addFill(fills, fill); });
  var keyOf = function (fill) { return "fill:" + (fill.rxcui || fill.name.toLowerCase()); };
  var oldest = group.slice().sort(function (a, b) {
    return (a.date || "9999").localeCompare(b.date || "9999") || keyOf(a).localeCompare(keyOf(b));
  })[0];
  var newestFirst = group.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  var shown = newestFirst.filter(function (f) { return f.rxcui && f.name; })[0] || newestFirst.filter(function (f) { return f.name; })[0] || newestFirst[0];
  var keys = new Set(group.map(keyOf));
  keys.delete(keyOf(oldest));
  return {
    key: keyOf(oldest),
    otherKeys: Array.from(keys),
    origin: "claims",
    name: shown.name,
    rxcui: shown.rxcui,
    fills: fills,
    source: claimsLabel(fills)
  };
}

// Gives each medicine its fills (same RxNorm code, else the same ingredients,
// form and salt; if that fits several, a current one first, then the one
// started most recently). A prescription the record calls finished
// (completed, stopped), filled within a year, moves to the current list.
// Fills that match nothing become their own items.
export function attachFills(split, fills, ingredientOf, now) {
  var current = split.current.map(function (i) { return Object.assign({}, i, { fills: emptyFills() }); });
  var older = split.older.map(function (i) { return Object.assign({}, i, { fills: emptyFills() }); });
  var all = current.concat(older);
  var unmatched = [];
  (fills || []).forEach(function (fill) {
    var exact = all.filter(function (i) { return fill.rxcui && i.rxcui === fill.rxcui && (!i.partCode || sameForm(fill, i, ingredientOf)); });
    var key = ingredientKey(ingredientOf, fill.rxcui);
    var byIngredient = key ? all.filter(function (i) { return ingredientKey(ingredientOf, i.rxcui) === key && sameForm(fill, i, ingredientOf); }) : [];
    var target = exact.length ? latestStart(exact) : (byIngredient.length ? latestStart(currentFirst(byIngredient)) : null);
    if (target) {
      addFill(target.fills, fill);
      return;
    }
    unmatched.push(fill);
  });
  var stillOlder = [];
  older.forEach(function (i) {
    var written = String(i.lastDate || i.start || "").slice(0, 10);
    if (i.fills.count && recent(i.fills.last, now) && i.fills.last > written) {
      current.push(Object.assign(i, { status: "current", completedButFilled: i.fills.last }));
    } else {
      stillOlder.push(i);
    }
  });
  groupSameDrug(unmatched).forEach(function (group) {
    var entry = fillOnlyItem(group);
    entry.status = recent(entry.fills.last, now) ? "current" : "older";
    (entry.status === "current" ? current : stillOlder).push(entry);
  });
  var byName = function (a, b) { return a.name.localeCompare(b.name); };
  return Object.assign({}, split, { current: current.sort(byName), older: stillOlder.sort(byName), claims: "loaded" });
}

// Reads every page of a patient's claims, one page at a time, and looks up
// the ingredients of each fill's drug, all inside ms. When time is up it
// asks for no more pages and says "failed". Never throws: "refused" means
// this sign-in can't read claims (an older pass), "none" means no pharmacy
// claims. request(url) returns one FHIR Bundle; lookup is ingredientsFor.
// ndcLookup(ndc, date) is rxcuiForNdc, for fills coded only by NDC.
export async function readClaims(request, patientId, lookup, ms, ndcLookup) {
  var deadline = Date.now() + ms;
  var timer;
  var late = new Promise(function (resolve) {
    timer = setTimeout(function () { resolve({ status: "failed" }); }, ms);
  });
  var work = (async function () {
    var eobs = [];
    var url = "ExplanationOfBenefit?patient=" + encodeURIComponent(patientId);
    while (url) {
      if (Date.now() >= deadline) return { status: "failed" };
      var bundle = await request(url);
      if (Date.now() >= deadline) return { status: "failed" };
      // An odd answer, or one that left something out, is never "no claims".
      if (!bundle || bundle.resourceType !== "Bundle") return { status: "failed" };
      if (heldBack((bundle.entry || []).map(function (entry) { return entry && entry.resource; }))) return { status: "failed" };
      (bundle.entry || []).forEach(function (entry) {
        if (entry && entry.resource && entry.resource.resourceType === "ExplanationOfBenefit") eobs.push(entry.resource);
      });
      var next = (bundle.link || []).filter(function (l) { return l.relation === "next" && l.url; })[0];
      url = next ? next.url : null;
    }
    var fills = fillsFromClaims(eobs);
    if (!fills.length) return { status: "none" };
    if (ndcLookup) await withNdcCodes(fills, ndcLookup);
    if (Date.now() >= deadline) return { status: "failed" };
    var codes = Array.from(new Set(fills.map(function (f) { return f.rxcui; }).filter(Boolean)));
    var ingredientOf = codes.length ? await lookup(codes) : new Map();
    return { status: "loaded", fills: fills, ingredientOf: ingredientOf };
  })().catch(function (error) {
    var status = error && (error.status || (error.response && error.response.status));
    return { status: status === 401 || status === 403 ? "refused" : "failed" };
  });
  return Promise.race([work, late]).finally(function () { clearTimeout(timer); });
}

// An NDC-only fill gets the RxNorm code RxNav says it had on the fill's
// date, never a guess from a list of several. One lookup per NDC and month.
async function withNdcCodes(fills, ndcLookup) {
  var asked = new Map();
  await Promise.all(fills.filter(function (fill) { return fill.ndc && !fill.rxcui; }).map(async function (fill) {
    var key = fill.ndc + " " + fill.date.slice(0, 7);
    if (!asked.has(key)) asked.set(key, Promise.resolve(ndcLookup(fill.ndc, fill.date)).catch(function () { return null; }));
    var rxcui = await asked.get(key);
    if (rxcui) fill.rxcui = String(rxcui);
  }));
}

// Puts what readClaims found onto the medicine list. The medicines stay as
// they are when the claims didn't load.
export function mergeClaims(split, result, now) {
  if (!result || result.status !== "loaded") {
    return Object.assign({}, split, { claims: (result && result.status) || "failed" });
  }
  var ingredientOf = new Map(split.ingredientOf || []);
  (result.ingredientOf || new Map()).forEach(function (value, code) {
    if (!ingredientOf.has(code)) ingredientOf.set(code, value);
  });
  return attachFills(split, result.fills, ingredientOf, now);
}

// Claims can give a day, a month ("2026-09") or only a year.
function longDate(date) {
  var parts = String(date).split("-").map(Number);
  if (parts.length < 2) return String(date);
  if (parts.length < 3) return MONTHS[parts[1] - 1] + " " + parts[0];
  return MONTHS[parts[1] - 1] + " " + parts[2] + ", " + parts[0];
}

function listOf(names) {
  if (names.length < 2) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

export function claimsLabel(fills) {
  var insurers = (fills && fills.insurers) || [];
  if (!insurers.length) return "paid without insurance";
  return listOf(insurers) + " claims" + (fills.cash ? ", some paid without insurance" : "");
}

// What the record calls a prescription that was filled anyway. Lists saved
// before Brown Bag kept the status just say "Not current".
export var STATUS_WORDS = { completed: "completed", stopped: "stopped", cancelled: "canceled", "not-taken": "not taken" };

export function completedLine(date, status) {
  var word = STATUS_WORDS[status];
  return (word ? "Marked " + word + " in your records" : "Not current in your records") + ", but filled " + longDate(date);
}

export function completedNote(date, status) {
  var word = STATUS_WORDS[status];
  return (word ? "Record marked " + word : "Not current in the record") + ", but filled " + date;
}

// For staff only: how much the newest fill was for. It only suggests, so it
// never shows on My medicines.
export function suggestNote(fills) {
  var hint = fills && fills.suggests;
  if (!hint) return null;
  return "Fill suggests about " + hint.perDay + " a day (" + hint.quantity + " for " + hint.days + " days)";
}

export function fillNote(fills) {
  if (!fills || !fills.count) return "No fill found in claims";
  var when = fills.last ? "Last filled " + fills.last : "Filled, " + (fills.count === 1 ? "date" : "dates") + " not given";
  return when + " (" + claimsLabel(fills) + "), " + fills.count + (fills.count === 1 ? " fill" : " fills");
}
