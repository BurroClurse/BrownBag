// Insurance pharmacy claims (FHIR ExplanationOfBenefit) into "fills", matched
// to the medicine list, so each medicine can say whether it was actually
// filled. The claims are their own source: a second insurer API (Medicare
// Blue Button 2.0) adds more fills the same way. No DOM here, so Node's
// test runner can check it.

var RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
var CLAIM_TYPE = "http://terminology.hl7.org/CodeSystem/claim-type";
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var RECENT_DAYS = 365;

function isPharmacy(eob) {
  var codings = (eob && eob.type && eob.type.coding) || [];
  return codings.some(function (c) { return c.system === CLAIM_TYPE && c.code === "pharmacy"; });
}

// One fill per item of each pharmacy claim. A claim marked NO_INSURANCE was
// still filled, paid another way.
export function fillsFromClaims(eobs) {
  var fills = [];
  (eobs || []).filter(isPharmacy).forEach(function (eob) {
    var insurer = eob.insurer && eob.insurer.display ? String(eob.insurer.display) : null;
    var cash = !insurer || /^no[_ ]insurance$/i.test(insurer);
    (eob.item || []).forEach(function (line) {
      var product = line.productOrService || {};
      var codings = product.coding || [];
      var rx = codings.filter(function (c) { return c.system === RXNORM && c.code; })[0];
      var name = product.text || (rx && rx.display) || (codings[0] && codings[0].display) || null;
      var when = line.servicedDate || (line.servicedPeriod && line.servicedPeriod.start) || (eob.billablePeriod && eob.billablePeriod.start);
      if (!name && !rx) return;
      fills.push({
        rxcui: rx ? String(rx.code) : null,
        name: name || "",
        date: when ? String(when).slice(0, 10) : "",
        insurer: cash ? null : insurer,
        cash: cash
      });
    });
  });
  return fills;
}

function emptyFills() {
  return { count: 0, last: null, insurers: [], cash: false };
}

function addFill(fills, fill) {
  fills.count += 1;
  if (fill.date && (!fills.last || fill.date > fills.last)) fills.last = fill.date;
  if (fill.insurer && fills.insurers.indexOf(fill.insurer) === -1) fills.insurers.push(fill.insurer);
  if (fill.cash) fills.cash = true;
}

function recent(date, now) {
  if (!date) return false;
  return now.getTime() - Date.parse(date + "T00:00:00Z") <= RECENT_DAYS * 24 * 60 * 60 * 1000;
}

function latestStart(items) {
  return items.slice().sort(function (a, b) { return String(b.start || "").localeCompare(String(a.start || "")); })[0];
}

function ingredientKey(ingredientOf, rxcui) {
  var found = rxcui && ingredientOf && ingredientOf.get(rxcui);
  return found ? found.rxcui : null;
}

// Gives each medicine its fills (same RxNorm code, else the same ingredients;
// if that fits several, the one started most recently). A prescription the
// record calls completed, filled within a year, moves to the current list.
// Fills that match nothing become their own items.
export function attachFills(split, fills, ingredientOf, now) {
  var current = split.current.map(function (i) { return Object.assign({}, i, { fills: emptyFills() }); });
  var older = split.older.map(function (i) { return Object.assign({}, i, { fills: emptyFills() }); });
  var all = current.concat(older);
  var unmatched = new Map();
  (fills || []).forEach(function (fill) {
    var exact = all.filter(function (i) { return fill.rxcui && i.rxcui === fill.rxcui; });
    var key = ingredientKey(ingredientOf, fill.rxcui);
    var byIngredient = key ? all.filter(function (i) { return ingredientKey(ingredientOf, i.rxcui) === key; }) : [];
    var target = exact.length ? latestStart(exact) : (byIngredient.length ? latestStart(byIngredient) : null);
    if (target) {
      addFill(target.fills, fill);
      return;
    }
    var groupKey = fill.rxcui || fill.name.toLowerCase();
    if (!unmatched.has(groupKey)) unmatched.set(groupKey, { first: fill, fills: emptyFills() });
    addFill(unmatched.get(groupKey).fills, fill);
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
  unmatched.forEach(function (group, groupKey) {
    var entry = {
      key: "fill:" + groupKey,
      origin: "claims",
      name: group.first.name,
      rxcui: group.first.rxcui,
      fills: group.fills,
      source: claimsLabel(group.fills),
      status: recent(group.fills.last, now) ? "current" : "older"
    };
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
export async function readClaims(request, patientId, lookup, ms) {
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
      ((bundle && bundle.entry) || []).forEach(function (entry) {
        if (entry && entry.resource && entry.resource.resourceType === "ExplanationOfBenefit") eobs.push(entry.resource);
      });
      var next = ((bundle && bundle.link) || []).filter(function (l) { return l.relation === "next" && l.url; })[0];
      url = next ? next.url : null;
    }
    var fills = fillsFromClaims(eobs);
    if (!fills.length) return { status: "none" };
    var codes = Array.from(new Set(fills.map(function (f) { return f.rxcui; }).filter(Boolean)));
    var ingredientOf = codes.length ? await lookup(codes) : new Map();
    return { status: "loaded", fills: fills, ingredientOf: ingredientOf };
  })().catch(function (error) {
    var status = error && (error.status || (error.response && error.response.status));
    return { status: status === 401 || status === 403 ? "refused" : "failed" };
  });
  return Promise.race([work, late]).finally(function () { clearTimeout(timer); });
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

function longDate(date) {
  var parts = String(date).split("-").map(Number);
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

export function fillLine(fills) {
  if (!fills) return null;
  if (!fills.count) return "No fill found in your claims";
  return fills.count === 1
    ? "Filled once · " + longDate(fills.last) + " · " + claimsLabel(fills)
    : "Filled " + fills.count + " times · last " + longDate(fills.last) + " · " + claimsLabel(fills);
}

export function completedLine(date) {
  return "Marked completed in your records, but filled " + longDate(date);
}

export function fillNote(fills) {
  if (!fills || !fills.count) return "No fill found in claims";
  return "Last filled " + fills.last + " (" + claimsLabel(fills) + "), " + fills.count + (fills.count === 1 ? " fill" : " fills");
}
