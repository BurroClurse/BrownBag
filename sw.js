// Brown Bag's service worker: a small script the browser runs to keep the
// app's own files on the phone, so Brown Bag opens with no signal.
// It never keeps health data. Records (FHIR), the sign-in server and RxNav
// always go straight to the network and are never cached.

var CACHE = "brownbag-v84";
// On weak Wi-Fi, stop waiting after this long and use the phone's copy.
var NETWORK_WAIT_MS = 3000;

var APP_FILES = [
  "./",
  "./index.html",
  "./share.html",
  "./launch.html",
  "./privacy.html",
  "./manifest.webmanifest",
  "./css/brownbag.css",
  "./js/quiet.js",
  "./js/card.js",
  "./js/inside.js",
  "./js/sort.js",
  "./js/options.js",
  "./js/popup.js",
  "./js/backup-popups.js",
  "./js/edit.js",
  "./js/app.js",
  "./js/view.js",
  "./js/meds.js",
  "./js/rxnorm.js",
  "./js/share.js",
  "./js/share-view.js",
  "./js/share-list.js",
  "./js/ips.js",
  "./js/fhir-file.js",
  "./js/save-file.js",
  "./js/swipe.js",
  "./js/crumple.js",
  "./js/vault.js",
  "./js/lock.js",
  "./js/lock-screen.js",
  "./js/install.js",
  "./js/offline.js", "./js/signed-out.js",
  "./js/pass.js",
  "./js/idle.js",
  "./js/claims.js",
  "./js/add-choices.js",
  "./js/add-check.js",
  "./js/allergies.js",
  "./js/read.js",
  "./js/sources.js",
  "./js/connections.js",
  "./js/source-list.js",
  "./js/launch.js",
  "./js/test-patients.js",
  "./js/older.js",
  "./vendor/fhir-client-3.0.1.js",
  "./vendor/qrcode-generator-1.4.4.js",
  "./icons/logo-trimmed.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// "app": this site's own files (the two libraries in vendor/ included),
// network first so updates show, cache when offline. "network": everything
// else, untouched. "picture": the icons, which rarely change, from the phone first.
self.routeFor = function (url) {
  var parsed = new URL(url);
  // Only Brown Bag's own folder. Other sites published on the same address
  // (other repos on burroclurse.github.io) are left alone.
  var scope = self.registration ? self.registration.scope : self.location.origin + "/";
  if (parsed.href.indexOf(scope + "icons/") === 0) {
    return "picture";
  }
  if (parsed.href.indexOf(scope) === 0) {
    return "app";
  }
  return "network";
};

self.fetchWithin = function (request, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error("network too slow")); }, ms);
    // "no-cache": always check with GitHub when there's signal, instead of
    // a copy the browser may keep for 10 minutes.
    var url = typeof request === "string" ? request : request.url;
    fetch(url, { cache: "no-cache", credentials: "same-origin" }).then(function (response) {
      clearTimeout(timer);
      resolve(response);
    }, function (error) {
      clearTimeout(timer);
      reject(error);
    });
  });
};

// Network first. Slow or no network: the phone's copy. A file with no copy
// (new in this version) keeps waiting for the network: handing it the start
// page instead left Brown Bag stuck on "Loading".
self.answerFor = async function (request, ms) {
  // Stored without the query string, so a sign-in code in the address never
  // ends up in the cache.
  var parsed = new URL(request.url);
  var plain = parsed.origin + parsed.pathname;
  var asked = self.fetchWithin(request, ms);
  try {
    var response = await asked;
    if (response.ok) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) { cache.put(plain, copy); });
    }
    return response;
  } catch (error) {
    var saved = await caches.match(plain);
    if (!saved && request.mode === "navigate") {
      saved = await caches.match(new URL("./index.html", self.registration.scope).href);
    }
    return saved || fetch(request);
  }
};

// The phone's copy right away, and the newest kept for next time. keep holds the
// worker open until that's done.
self.pictureFor = async function (request, keep) {
  var parsed = new URL(request.url);
  var plain = parsed.origin + parsed.pathname;
  var saved = await caches.match(plain);
  if (!saved) return self.answerFor(request, NETWORK_WAIT_MS);
  keep(fetch(plain, { cache: "no-cache", credentials: "same-origin" }).then(function (response) {
    if (!response.ok) return;
    return caches.open(CACHE).then(function (cache) { return cache.put(plain, response.clone()); });
  }).catch(function () {}));
  return saved;
};

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(APP_FILES.map(function (url) { return new Request(url, { cache: "reload" }); }));
  }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (name) {
      return name.indexOf("brownbag-") === 0 && name !== CACHE;
    }).map(function (name) {
      return caches.delete(name);
    }));
  }).then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var route = self.routeFor(request.url);
  if (route === "picture") {
    event.respondWith(self.pictureFor(request, function (work) { event.waitUntil(work); }));
  } else if (route === "app") {
    event.respondWith(self.answerFor(request, NETWORK_WAIT_MS));
  }
});
