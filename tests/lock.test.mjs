import test from "node:test";
import assert from "node:assert/strict";
import { hasLock, setupLock, unlock, LockError, LOCK_KEY, eraseBrownBag } from "../js/lock.js";
import { encryptJSON, decryptJSON } from "../js/vault.js";

function memoryStorage() {
  var map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null
  };
}

function domError(name) {
  var error = new Error(name);
  error.name = name;
  return error;
}

// A stand-in for navigator.credentials. The PRF output depends only on the
// salt, the way a real passkey's does, so unlock gets the same key back.
function fakePasskey({ prfOnCreate = true, prfSupported = true, createError = null, getError = null } = {}) {
  var calls = { create: 0, get: 0 };
  function prfFor(salt) {
    var out = new Uint8Array(32);
    var bytes = new Uint8Array(salt);
    for (var i = 0; i < 32; i += 1) out[i] = (bytes[i % bytes.length] * 7 + i) % 256;
    return out.buffer;
  }
  return {
    calls,
    async create(options) {
      calls.create += 1;
      if (createError) throw domError(createError);
      var salt = options.publicKey.extensions.prf.eval.first;
      return {
        rawId: new Uint8Array([1, 2, 3, 4]).buffer,
        getClientExtensionResults: () => (prfSupported
          ? { prf: prfOnCreate ? { enabled: true, results: { first: prfFor(salt) } } : { enabled: true } }
          : { prf: { enabled: false } })
      };
    },
    async get(options) {
      calls.get += 1;
      if (getError) throw domError(getError);
      var salt = options.publicKey.extensions.prf.eval.first;
      return {
        rawId: new Uint8Array([1, 2, 3, 4]).buffer,
        getClientExtensionResults: () => ({ prf: { results: { first: prfFor(salt) } } })
      };
    }
  };
}

async function sameKey(a, b) {
  return (await decryptJSON(b, await encryptJSON(a, "hello"))) === "hello";
}

test("no lock is set up at first", () => {
  assert.equal(hasLock(memoryStorage()), false);
});

test("PIN set-up then unlock with the same PIN gives the same key", async () => {
  var storage = memoryStorage();
  var made = await setupLock({ pin: "246810", storage });
  assert.equal(hasLock(storage), true);
  assert.equal(JSON.parse(storage.getItem(LOCK_KEY)).method, "pin");
  var opened = await unlock({ pin: "246810", storage });
  assert.ok(await sameKey(made, opened));
});

test("a wrong PIN throws wrong-pin", async () => {
  var storage = memoryStorage();
  await setupLock({ pin: "246810", storage });
  await assert.rejects(unlock({ pin: "111111", storage }), (error) => error instanceof LockError && error.code === "wrong-pin");
});

test("a PIN that is not 6 digits throws bad-pin", async () => {
  await assert.rejects(setupLock({ pin: "12ab", storage: memoryStorage() }), (error) => error instanceof LockError && error.code === "bad-pin");
});

test("passkey set-up then unlock gives the same key", async () => {
  var storage = memoryStorage();
  var credentials = fakePasskey();
  var made = await setupLock({ storage, credentials, hostname: "localhost" });
  var saved = JSON.parse(storage.getItem(LOCK_KEY));
  assert.equal(saved.method, "passkey");
  assert.ok(saved.credentialId && saved.salt && saved.check);
  var opened = await unlock({ storage, credentials, hostname: "localhost" });
  assert.ok(await sameKey(made, opened));
});

test("passkey set-up asks again when create gives no PRF output", async () => {
  var credentials = fakePasskey({ prfOnCreate: false });
  await setupLock({ storage: memoryStorage(), credentials, hostname: "localhost" });
  assert.equal(credentials.calls.get, 1);
});

test("a passkey without PRF support throws needs-pin and saves nothing", async () => {
  var storage = memoryStorage();
  await assert.rejects(
    setupLock({ storage, credentials: fakePasskey({ prfSupported: false }), hostname: "localhost" }),
    (error) => error instanceof LockError && error.code === "needs-pin"
  );
  assert.equal(hasLock(storage), false);
});

test("an address the browser refuses for passkeys throws needs-pin", async () => {
  await assert.rejects(
    setupLock({ storage: memoryStorage(), credentials: fakePasskey({ createError: "SecurityError" }), hostname: "192.168.0.224" }),
    (error) => error instanceof LockError && error.code === "needs-pin"
  );
});

test("no passkey support at all throws needs-pin", async () => {
  await assert.rejects(
    setupLock({ storage: memoryStorage(), credentials: null, hostname: "localhost" }),
    (error) => error instanceof LockError && error.code === "needs-pin"
  );
});

test("cancelling Face ID throws cancelled", async () => {
  var storage = memoryStorage();
  await setupLock({ storage, credentials: fakePasskey(), hostname: "localhost" });
  await assert.rejects(
    unlock({ storage, credentials: fakePasskey({ getError: "NotAllowedError" }), hostname: "localhost" }),
    (error) => error instanceof LockError && error.code === "cancelled"
  );
});

test("unlock with no lock set up throws no-lock", async () => {
  await assert.rejects(unlock({ pin: "246810", storage: memoryStorage() }), (error) => error instanceof LockError && error.code === "no-lock");
});

test("tapping Save PIN twice sets up one lock, not two", async () => {
  var storage = memoryStorage();
  var [first, second] = await Promise.all([setupLock({ pin: "246810", storage }), setupLock({ pin: "246810", storage })]);
  var opened = await unlock({ pin: "246810", storage });
  assert.ok(await sameKey(first, opened));
  assert.ok(await sameKey(second, opened));
});

test("unlock can use lock settings from a backup without saving them first", async () => {
  var source = memoryStorage();
  var made = await setupLock({ pin: "246810", storage: source });
  var record = source.getItem(LOCK_KEY);
  var empty = memoryStorage();
  var opened = await unlock({ pin: "246810", storage: empty, record });
  assert.ok(await sameKey(made, opened));
  assert.equal(hasLock(empty), false);
});

test("start over erases Brown Bag's saved data and nothing else", () => {
  var storage = memoryStorage();
  storage.setItem(LOCK_KEY, "x");
  storage.setItem("brownbag:data:p1", "y");
  storage.setItem("brownbag:records:last", "z");
  storage.setItem("other-app", "keep");
  eraseBrownBag(storage);
  assert.equal(hasLock(storage), false);
  assert.equal(storage.getItem("brownbag:data:p1"), null);
  assert.equal(storage.getItem("brownbag:records:last"), null);
  assert.equal(storage.getItem("other-app"), "keep");
});
