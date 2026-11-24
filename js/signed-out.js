// After Sign out: when the list saved on this phone can be opened. With a
// connection, they sign in. With none, signing in can't work, so the list is
// still there, behind the lock.

export function signedOutLine(online) {
  return online ? null : "No connection. You can still open the list saved on this phone.";
}

// asked: they tapped Open my saved list. The signal can come back before the
// unlock is done, and that mustn't take the list away again.
export function mayOpenSaved({ signedOut, asked, online }) {
  return !signedOut || asked || !online;
}
