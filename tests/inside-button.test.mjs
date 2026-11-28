// See what's inside on the QR screen (the developer, 2026-11-28): an outlined
// button with a list icon, evenly spaced between the title and the code.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const css = read("css/brownbag.css");
const rule = (name) => (css.split(name + " {")[1] || "").split("}")[0];

test("an outlined button with a list icon, teal on white, bold", () => {
  const app = read("js/app.js");
  const qr = app.slice(app.indexOf("async function buildQr")).split("\n}\n")[0];
  assert.match(qr, /inside\.appendChild\(listIcon\(\)\);/);
  assert.match(qr, /add\(inside, "span", "See what's inside", "inside-main"\);/);
  assert.match(app.slice(app.indexOf("function listIcon")).split("\n}\n")[0], /"aria-hidden", "true"/);
  const button = rule(".qr-overlay button.inside-link");
  assert.match(button, /background: #FFFFFF/);
  assert.match(button, /border: 2px solid #164F5A/);
  assert.match(button, /font-weight: 700/);
  assert.match(button, /min-height: 48px/);
});

test("opening keeps the icon and changes only the words", () => {
  const app = read("js/app.js");
  const open = app.slice(app.indexOf("async function openInside")).split("\n}\n")[0];
  assert.match(open, /opener\.querySelector\("\.inside-main"\) \|\| opener/);
  assert.match(open, /line\.textContent = "Opening…";/);
});

test("the space above and below See what's inside is the same", () => {
  assert.match(css, /\.qr-overlay h2 \{[^}]*margin: 0 0 var\(--inside-gap\)/);
  assert.match(css, /\.qr-overlay \.help-row\.inside-row \{[^}]*margin: 0 0 var\(--inside-gap\)/);
});

// The developer, 2026-11-28: on the QR screen, each "?" opens its explanation
// in a popup over the code, only as big as what it says, with Back to QR code
// at the top and the bottom; elsewhere the "?" still open in place.
test("the QR screen's two \"?\" open a popup over the code, with Back to QR code twice", () => {
  const app = read("js/app.js");
  const qr = app.slice(app.indexOf("async function buildQr")).split("\n}\n")[0];
  assert.doesNotMatch(qr, /helpBubble\(/);
  assert.match(qr, /qrHelp\(insideRow, "What's in this code\?"/);
  assert.match(qr, /qrHelp\(sayRow, "Why tell them the code\?"/);
  const open = app.slice(app.indexOf("function openQrHelp")).split("\n}\n")[0];
  assert.match(open, /openPopup\(document\.body, heading, opener/);
  assert.equal((open.match(/"Back to QR code"/g) || []).length, 2);
  assert.match(open, /history\.pushState\(\{ bb: "qr-help" \}, ""\)/);
  assert.match(open, /history\.state && history\.state\.bb === "qr-help"/);
  assert.doesNotMatch(open, /inside-overlay/);
  // The phone's Back closes the popup and leaves the code open; Forward to its
  // step after it closed comes straight back.
  assert.match(app, /if \(step === "inside" \|\| step === "qr-help"\) history\.back\(\);/);
  // Elsewhere the "?" still open in place.
  assert.match(app, /function helpBubble\(/);
  // As big as its content, scrolling inside when the screen is shorter.
  assert.match((read("css/brownbag.css").split(".popup {")[1] || "").split("}")[0], /max-height: 94dvh;[\s\S]*overflow-y: auto;/);
});
