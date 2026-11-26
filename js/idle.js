// When Brown Bag locks itself (the developer, 2026-11-21): after 5 minutes with no
// tap, or after 5 minutes away from it (another app, or the screen off).
// Locking forgets the key, so Face ID or the PIN is needed again. The
// connection to the health records stays (see js/pass.js).

export var LOCK_AFTER_MS = 5 * 60 * 1000;

export function shouldLock({ now, lastActive, hiddenAt }) {
  if (hiddenAt !== null && hiddenAt !== undefined && now - hiddenAt >= LOCK_AFTER_MS) {
    return true;
  }
  return now - lastActive >= LOCK_AFTER_MS;
}
