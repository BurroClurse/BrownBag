import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mayOpenSaved, offerSaved, signedOutLine, wantsSaved } from "../js/signed-out.js";

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

// Hospital Wi-Fi often says it's connected before its own sign-in page is done.
test("a sign-in that couldn't start offers the saved list, only when signed out with one", () => {
  assert.equal(offerSaved({ signedOut: true, saved: true }), true);
  assert.equal(offerSaved({ signedOut: true, saved: false }), false);
  // Not signed out: Back opens the list anyway.
  assert.equal(offerSaved({ signedOut: false, saved: true }), false);
});

test("it opens by an address only the button uses, behind the lock", () => {
  assert.equal(wantsSaved("?open=saved"), true);
  for (const other of ["", "?open=other", "?code=1&state=2"]) assert.equal(wantsSaved(other), false);
  const launch = read("js/launch.js");
  const failed = launch.slice(launch.indexOf("function showFailed")).split("\n}\n")[0];
  assert.match(failed, /offerSaved\(/);
  assert.match(failed, /"\.\/\?open=saved"/);
  const app = read("js/app.js");
  const start = app.slice(app.indexOf("async function start()")).split("\n}\n")[0];
  // The lock always comes before the list.
  assert.ok(start.indexOf("wantsSaved(") < start.indexOf("showLockScreen("));
  assert.ok(start.indexOf("showLockScreen(") < start.indexOf("signInUnavailable("));
});
