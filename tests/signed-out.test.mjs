import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mayOpenSaved, signedOutLine } from "../js/signed-out.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("signed out with a connection, the saved list isn't offered", () => {
  assert.equal(signedOutLine(true), null);
});

test("signed out with no signal, the line says the list can still be opened", () => {
  assert.equal(signedOutLine(false), "No connection. You can still open the list saved on this phone.");
});

test("signed out, a sign-in that failed doesn't open the saved list", () => {
  assert.equal(mayOpenSaved({ signedOut: true, asked: false, online: true }), false);
});

test("signed out, it opens with no signal, or once they tapped Open my saved list", () => {
  assert.equal(mayOpenSaved({ signedOut: true, asked: false, online: false }), true);
  // The signal can come back between the tap and the unlock.
  assert.equal(mayOpenSaved({ signedOut: true, asked: true, online: true }), true);
});

test("not signed out, the saved list opens as before", () => {
  assert.equal(mayOpenSaved({ signedOut: false, asked: false, online: true }), true);
  assert.equal(mayOpenSaved({ signedOut: false, asked: false, online: false }), true);
});

test("the screen follows the signal, and the file works with none", () => {
  const app = read("js/app.js");
  const body = app.slice(app.indexOf("function savedListAsked")).split("\n}\n")[0];
  for (const event of ["online", "offline"]) {
    assert.match(body, new RegExp('addEventListener\\("' + event + '"'));
    assert.match(body, new RegExp('removeEventListener\\("' + event + '"'));
  }
  assert.ok(read("sw.js").includes('"./js/signed-out.js"'));
});
