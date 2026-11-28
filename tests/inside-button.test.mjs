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
