// Reads records the list can live without (claims, allergies) with the
// sign-in's pass, outside the SMART library: when a server answers 401, the
// library throws its sign-in away, which would lose the medicines too.

export function recordReader(client, fetchFn) {
  var base = client.state.serverUrl.replace(/\/*$/, "");
  return async function (url) {
    var full = /^[a-z]+:/i.test(url) ? url : base + "/" + url;
    var rest = full.indexOf(base) === 0 ? full.slice(base.length) : null;
    // The pass goes to the health system only, whatever a "next" link says.
    if (rest === null || (rest !== "" && "/?".indexOf(rest[0]) === -1)) {
      throw new Error("Not this health system's address.");
    }
    var response = await (fetchFn || globalThis.fetch.bind(globalThis))(full, {
      headers: { Authorization: client.getAuthorizationHeader(), Accept: "application/fhir+json" }
    });
    if (!response.ok) {
      throw Object.assign(new Error("The health system answered " + response.status + "."), { status: response.status });
    }
    return response.json();
  };
}

// Whether an answer says the server left something out. Warnings and
// information are only remarks.
export function heldBack(resources) {
  return resources.some(function (r) {
    return Boolean(r) && r.resourceType === "OperationOutcome" && (r.issue || []).some(function (i) { return i.severity === "error" || i.severity === "fatal"; });
  });
}

// How long an extra read may still take: at most its own limit, and never so
// long that the medicines miss theirs (with time left to show them).
var TIME_TO_SHOW_MS = 1500;
export function waitLeft(elapsed, most, total) {
  return Math.max(0, Math.min(most, total - TIME_TO_SHOW_MS - elapsed));
}
