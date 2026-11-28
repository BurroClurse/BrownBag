// Made-up patients that come with the SMART sandbox, so they are there after its
// nightly reset. The sandbox's own sign-in page lists only its first ten, and
// anyone can add to it. Checked on the sandbox 2026-11-24; birth dates as the
// sandbox has them, 2026-11-26. No DOM here.

import { PATIENTS } from "./sandbox-patients.js";

export const GROUPS = [
  { title: "Insurance fills", patients: [
    { id: "e89af71d-4aa4-2237-e71d-6fa8e4b5af09", name: "Chantell Bartell", born: "1974-05-08", about: "Fills, an allergy, and an allergy entry with no name" },
    { id: "2a89ee40-606f-4df2-9e77-80aeb1304f4f", name: "Bret Hayes", born: "1963-07-16", about: "Many medicines and many fills" },
    { id: "c86c400e-ff88-a1e3-2e23-caa4d8311f47", name: "Herschel Greenfelder", born: "1948-06-22", about: "Several medicines, fills and an allergy" }
  ] },
  { title: "Many medicines", patients: [
    { id: "12edb5a0-ec71-45b7-aff6-0fef1c382881", name: "Delbert Jaskolski", born: "1951-09-13", about: "Current medicines and a long history" },
    { id: "f46d1649-8a02-4de8-8cff-f76fae267d3a", name: "Trey Berge", born: "1913-01-13", about: "Mostly current medicines" },
    { id: "9bf59715-246f-4ce2-85a6-58c1757f8d21", name: "Margery Gibson", born: "1948-11-08", about: "Current medicines and a long history" },
    { id: "ba18818d-faef-44cd-9744-b12d8973d402", name: "Adalberto Hartmann", born: "1949-11-29", about: "Mostly current medicines" },
    { id: "77155e2b-5d21-4b47-86f0-4004183d68b2", name: "Gayla Ferry", born: "1937-06-03", about: "Only current medicines" },
    { id: "1b1cbdc7-7187-49f2-8607-c9325cffb004", name: "Stanford Windler", born: "1941-08-06", about: "Mostly current medicines" },
    { id: "835a3b08-e3b6-49c4-a23f-1fac8dc7a7a7", name: "Kirsten Witting", born: "1948-06-14", about: "Mostly current medicines" }
  ] },
  { title: "Older prescriptions", patients: [
    { id: "7217c081-64cf-4e6c-b023-05c2e2dcf50c", name: "Thanh Mosciski", born: "1953-04-23", about: "Many older prescriptions" },
    { id: "e7de504a-311d-49be-b2bc-566a328bcc72", name: "Loria Jenkins", born: "1937-07-15", about: "A few current medicines, many older" }
  ] },
  { title: "Many allergies", patients: [
    { id: "76d2fa2d-66a6-4823-8dab-52cd70822844", name: "Reyna Ziemann", born: "1974-02-28", about: "Allergies and current medicines" },
    { id: "768615e2-a243-499a-893c-f5d37d33353b", name: "Gil Sanford", born: "2000-11-24", about: "Allergies and a few medicines" },
    { id: "802e150c-c3f3-4a2d-954f-9b7a92be59bc", name: "Jacqueline Wyman", born: "1995-03-10", about: "Allergies and a few medicines" },
    { id: "4551370c-c3eb-4164-a2ff-b528f73a4e0f", name: "Octavio Dickens", born: "1997-03-03", about: "Allergies and a few medicines" }
  ] },
  { title: "Children", patients: [
    { id: "272539c2-e516-4f16-8f47-573923bf9924", name: "Jorge Brekke", born: "2012-11-11", about: "Allergies and a few medicines" },
    { id: "6daf3d7c-1620-4d79-9396-990469306470", name: "Daisey Johns", born: "2015-04-04", about: "Allergies and a few medicines" },
    { id: "8a6f7e61-55dc-4dc3-bf12-b3531b690b05", name: "Versie Botsford", born: "2018-05-22", about: "Allergies and a few medicines" }
  ] },
  { title: "Nothing listed", patients: [
    { id: "2807decf-744b-4abe-94ce-08c33ea905df", name: "Trevor Turcotte", born: "1960-12-23", about: "No medicines and no allergies" }
  ] }
];

// The sandbox's own sign-in page, with nobody chosen.
export var OWN_LIST = "list";

// The 20 above, and Browse all patients' saved list (design 2026-11-28).
export function knownPatient(id) {
  return GROUPS.some(function (group) {
    return group.patients.some(function (patient) { return patient.id === id; });
  }) || PATIENTS.some(function (patient) { return patient.id === id; });
}

// A patient other people added to the sandbox can't be on a saved list (it
// deletes them every night), so Added by other people's choices are checked
// by shape: a FHIR id, and nothing that isn't one.
var FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;
var NOT_IDS = ["__proto__", "constructor", "prototype"];

export function addedId(id) {
  return typeof id === "string" && FHIR_ID.test(id) && NOT_IDS.indexOf(id) === -1;
}

// The sandbox reads the "/sim/..." part of its address: a patient standalone
// launch (the 3), the patient, and whether to skip its sign-in page. Its
// approval page always shows.
export function sandboxServer(id, added) {
  if (id !== OWN_LIST && !knownPatient(id) && !(added && addedId(id))) throw new Error("Not on the list");
  var one = id !== OWN_LIST;
  var options = [3, one ? id : "", "", "AUTO", one ? 1 : 0, 0, 0, "", "", "", "", "", "", "", 0, 1, ""];
  return "https://launch.smarthealthit.org/v/r4/sim/" +
    btoa(JSON.stringify(options)).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_") + "/fhir";
}
