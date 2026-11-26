// Birth dates read like the app's other dates: "Born May 8, 1974" (Tyler,
// 2026-11-26), on the staff page, See what's inside and the test-patient
// picker. If these fail, a birth date can read as "1974-05-08", or a day off
// on a phone west of UTC.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { bornText } from "../js/card.js";
import { buildShareBundle, groupShareBundle } from "../js/share.js";
import { drawShareList } from "../js/share-list.js";
import { drawInside } from "../js/inside.js";
import { GROUPS } from "../js/test-patients.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

class Node {
  constructor(tag) { this.tag = tag; this.kids = []; this.own = ""; }
  set textContent(text) { this.own = text; this.kids = []; }
  get textContent() { return this.own + this.kids.map((kid) => kid.textContent).join(""); }
  set innerHTML(text) { if (!text.startsWith("<svg")) throw new Error("raw HTML"); }
  appendChild(kid) { this.kids.push(kid); return kid; }
  setAttribute() {}
  get classList() { return { add() {} }; }
}
globalThis.document = { createElement: (tag) => new Node(tag), createTextNode: (text) => Object.assign(new Node("#text"), { own: text }) };
const all = (node, tag) => node.kids.flatMap((kid) => (kid.tag === tag ? [kid] : []).concat(all(kid, tag)));

test("a whole birth date reads with the month's name", () => {
  assert.equal(bornText("1974-05-08"), "Born May 8, 1974");
  assert.equal(bornText("1950-03-14"), "Born Mar 14, 1950");
  assert.equal(bornText("2000-11-24"), "Born Nov 24, 2000");
  // A date and time: only the date as written.
  assert.equal(bornText("1974-05-08T00:00:00Z"), "Born May 8, 1974");
  assert.equal(bornText("1974-05-08T23:30:00-10:00"), "Born May 8, 1974");
});

test("a year and month, or a year, reads only as exact as it is", () => {
  assert.equal(bornText("1974-05"), "Born May 1974");
  assert.equal(bornText("1974"), "Born 1974");
});

test("an odd birth date shows as written, and none shows nothing", () => {
  for (const odd of ["unknown", "1974-13-01", "1974-02-30", "1975-02-29", "1974-04-31", "08/05/1974", "1974-05-08 garbage"]) assert.equal(bornText(odd), "Born " + odd, odd);
  // A leap day that's real.
  assert.equal(bornText("1976-02-29"), "Born Feb 29, 1976");
  for (const none of ["", null, undefined]) assert.equal(bornText(none), "", String(none));
});

test("west of UTC it's still the day written", () => {
  for (const zone of ["Pacific/Honolulu", "America/Los_Angeles", "Pacific/Pago_Pago"]) {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", 'import { bornText } from "./js/card.js"; console.log([bornText("1974-05-08"), bornText("1974-05-08T00:00:00Z"), bornText("1974-01")].join("|"))'], { cwd: new URL("..", import.meta.url), env: Object.assign({}, process.env, { TZ: zone }), encoding: "utf8" }).trim();
    assert.equal(out, "Born May 8, 1974|Born May 8, 1974|Born Jan 1974", zone);
  }
});

const LIST = { patient: { name: "Chantell Bartell", birthDate: "1974-05-08" }, current: [], additions: [], stopped: [] };
const groups = (list) => groupShareBundle(JSON.parse(JSON.stringify(buildShareBundle(list, new Date("2026-11-26T12:00:00Z")))));

test("the staff page and See what's inside say it the same way", () => {
  for (const draw of [(root) => drawShareList(root, groups(LIST), 1), (root) => drawInside(root, groups(LIST))]) {
    const root = new Node("main");
    draw(root);
    const lines = all(root, "p").map((p) => p.textContent);
    assert.ok(lines.includes("Born May 8, 1974"), JSON.stringify(lines));
    assert.ok(!root.textContent.includes("1974-05-08"));
  }
  const odd = new Node("main");
  drawShareList(odd, groups(Object.assign({}, LIST, { patient: { name: "A", birthDate: "" } })), 1);
  assert.ok(!odd.textContent.includes("Born"));
  for (const file of ["js/share-list.js", "js/inside.js"]) assert.match(read(file), /bornText\(/, file);
});

test("the test-patient picker gives each whole birth date", () => {
  const people = GROUPS.flatMap((group) => group.patients);
  for (const p of people) assert.match(p.born, /^\d{4}-\d{2}-\d{2}$/, p.name);
  // As the sandbox has them (checked 2026-11-26).
  assert.equal(people.find((p) => p.name === "Chantell Bartell").born, "1974-05-08");
  assert.match(read("js/launch.js"), /bornText\(patient\.born\) \+ "\. "/);
});
