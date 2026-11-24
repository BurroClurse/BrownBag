// After Sign out: when the list saved on this phone can be opened. With a
// connection, they sign in. With none, signing in can't work, so the list is
// still there, behind the lock.

// Set by Sign out, until someone signs in again.
export var SIGNED_OUT_KEY = "brownbag:signed-out";

// After a sign-in that couldn't start: hospital Wi-Fi often says it's connected
// before its own sign-in page is done. Not signed out, the list opens anyway.
export function offerSaved({ signedOut, saved }) {
  return Boolean(signedOut && saved);
}

// The address that button uses. The lock still comes first.
export function wantsSaved(search) {
  return new URLSearchParams(search).get("open") === "saved";
}

export function signedOutLine(online) {
  return online ? null : "No connection. You can still open the list saved on this phone.";
}

// asked: they tapped Open my saved list. The signal can come back before the
// unlock is done, and that mustn't take the list away again.
export function mayOpenSaved({ signedOut, asked, online }) {
  return !signedOut || asked || !online;
}
