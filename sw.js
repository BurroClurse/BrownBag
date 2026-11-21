// Brown Bag's service worker: a small script the browser runs to keep the
// app's own files on the phone, so Brown Bag opens with no signal.
// It never keeps health data. Records (FHIR), the sign-in server and RxNav
// always go straight to the network and are never cached.

var CACHE = "brownbag-v7";
// On weak Wi-Fi, stop waiting after this long and use the phone's copy.
var NETWORK_WAIT_MS = 3000;

var APP_FILES = [
  "./",
  "./index.html",
  "./share.html",
  "./manifest.webmanifest",
  "./css/brownbag.css",
  "./js/app.js",
  "./js/view.js",
  "./js/meds.js",
  "./js/rxnorm.js",
  "./js/share.js",
  "./js/share-view.js",
  "./js/vault.js",
  "./js/lock.js",
  "./js/lock-screen.js",
  "./js/install.js",
  "./js/offline.js",
  "./js/pass.js",
  "./js/idle.js",
  "./js/claims.js",
  "./icons/logo-trimmed.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// Exact versions only, matching the script tags (and their integrity hashes).
var LIBRARIES = [
  "https://cdn.jsdelivr.net/npm/fhirclient@3.0.1/bundle/fhir-client.js",
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"
];

// "app": this site's own files, network first so updates show, cache when
// offline. "library": the two pinned scripts, cache first. "network":
// everything else, untouched.
self.routeFor = function (url) {
  var parsed = new URL(url);
  if (LIBRARIES.indexOf(parsed.origin + parsed.pathname) !== -1) {
    return "library";
  }
  // Only Brown Bag's own folder. Other sites published on the same address
  // (other repos on burroclurse.github.io) are left alone.
  var scope = self.registration ? self.registration.scope : self.location.origin + "/";
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

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(APP_FILES.map(function (url) { return new Request(url, { cache: "reload" }); })).then(function () {
      return Promise.all(LIBRARIES.map(function (url) {
        return fetch(url, { mode: "cors" }).then(function (response) {
          if (response.ok) return cache.put(url, response);
        });
      }));
    });
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
  if (route === "library") {
    event.respondWith(caches.match(request.url).then(function (hit) {
      return hit || fetch(request);
    }));
  } else if (route === "app") {
    // Stored without the query string, so a sign-in code in the address
    // never ends up in the cache.
    var parsed = new URL(request.url);
    var plain = parsed.origin + parsed.pathname;
    event.respondWith(self.fetchWithin(request, NETWORK_WAIT_MS).then(function (response) {
      if (response.ok) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(plain, copy); });
      }
      return response;
    }).catch(function () {
      return caches.match(plain).then(function (hit) {
        return hit || caches.match(new URL("./index.html", self.location.href).href);
      });
    }));
  }
});
