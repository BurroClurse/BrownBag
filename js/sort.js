// The order of My medicines, and the short name on home. No page here, so
// Node's tests can check it.

export var SORTS = [
  { id: "name", text: "A to Z" },
  { id: "newest", text: "Newest first" },
  { id: "prescriber", text: "Prescribed by" }
];
var SORT_KEY = "brownbag:sort";

function known(how) {
  return SORTS.some(function (sort) { return sort.id === how; }) ? how : "name";
}

export function savedSort(storage) {
  try {
    return known(storage.getItem(SORT_KEY));
  } catch (error) {
    return "name";
  }
}

export function saveSort(storage, how) {
  try {
    storage.setItem(SORT_KEY, known(how));
  } catch (error) {
    // Not remembered this time.
  }
}

// Each part of the list sorted on its own: new arrays, the same entries, so
// each keeps its question or answer. The cards to check follow the order
// they show in.
export function sortArranged(arranged, additions, how) {
  var order = ORDERS[known(how)];
  var sorted = function (list) { return list.slice().sort(order); };
  var current = sorted(arranged.current);
  var older = sorted(arranged.older);
  return {
    arranged: {
      current: current,
      stopped: sorted(arranged.stopped),
      older: older,
      toCheck: current.concat(older).filter(function (entry) { return entry.question; })
    },
    additions: sorted(additions)
  };
}

var ORDERS = {
  name: byName,
  newest: function (a, b) { return lastIfEmpty(dateOf(a), dateOf(b), -1) || byName(a, b); },
  prescriber: function (a, b) { return lastIfEmpty(prescriberOf(a), prescriberOf(b), 1) || byName(a, b); }
};

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

function lastIfEmpty(a, b, direction) {
  if (!a || !b) return (a ? 0 : 1) - (b ? 0 : 1);
  return a.localeCompare(b) * direction;
}

// The date its card shows: added, prescribed or started, or the last fill for
// one only insurance knows about.
function dateOf(entry) {
  return String(entry.addedAt || entry.start || (entry.origin === "claims" && entry.fills && entry.fills.last) || "").slice(0, 10);
}

function prescriberOf(entry) {
  return String(entry.prescriber || "").replace(/^(dr|mr|mrs|ms)\.?\s+/i, "");
}

// "Avery B.": enough to tell whose list it is, without showing the full name
// to whoever is nearby (Tyler, 2026-11-23). Staff still get the full name.
export function shortName(full) {
  var text = String(full || "").trim();
  if (!text || text === "Name not recorded") return "Name not recorded";
  // After a comma: more names ("Brownbag, Avery"), or only letters after a name.
  var sides = text.split(",").map(function (side) { return words(side); });
  var rest = [].concat.apply([], sides.slice(1));
  var first = rest.length ? rest[0] : sides[0][0];
  var last = rest.length || sides[0].length > 1 ? sides[0][sides[0].length - 1] : null;
  if (!first) return text.split(/\s+/)[0];
  return last ? first + " " + Array.from(last)[0] + "." : first;
}

function words(text) {
  return text.trim().split(/\s+/).filter(function (word) {
    return word && !/^(mr|mrs|ms|miss|mx|dr|prof|jr|sr|ii|iii|iv|md|do|rn|phd)\.?$/i.test(word);
  });
}
