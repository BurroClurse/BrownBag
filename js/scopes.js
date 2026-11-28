// The permissions Brown Bag asks for at sign-in (design 2026-11-28): SMART v2
// scopes (".rs", read and search) when the server's configuration lists
// "permission-v2", else the v1 scopes (".read") older servers know. The same
// permissions either way, all read-only. No DOM here.

var START = "launch/patient openid fhirUser offline_access";
var KINDS = ["Patient", "MedicationRequest", "MedicationStatement", "Medication", "Practitioner", "ExplanationOfBenefit", "AllergyIntolerance"];

function scopes(ending) {
  return START + " " + KINDS.map(function (kind) { return "patient/" + kind + ending; }).join(" ");
}

export var SCOPES_V1 = scopes(".read");
export var SCOPES_V2 = scopes(".rs");

export function scopesFor(config) {
  var capabilities = config && Array.isArray(config.capabilities) ? config.capabilities : [];
  return capabilities.indexOf("permission-v2") !== -1 ? SCOPES_V2 : SCOPES_V1;
}

export function smartConfigUrl(server) {
  return String(server).replace(/\/*$/, "") + "/.well-known/smart-configuration";
}
