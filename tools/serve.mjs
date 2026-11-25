// Serves the app over https on this Mac so a phone on the same Wi-Fi can
// open it. Encryption, passkeys and the camera only run on secure pages.
// Certificates come from mkcert and live in .certs/ (never committed).
//
// Run: node tools/serve.mjs
//
// To try two sources on a phone, start it with the demo clinic:
//   BROWN_BAG_DEMO=two-clinics node tools/serve.mjs
// The app then adds Valley Clinic's test records as a second source, given
// the signed-in patient's name and birth date. A test patient made for it
// (node tools/reconcile-patients.mjs) gets its own file from
// tests/fixtures/reconcile/clinics/; anyone else gets
// tests/fixtures/reconcile/demo-clinic.json. Add ?demo=someone-else to the
// page address to see it kept out as someone else's. Without the variable,
// the list is the sandbox's alone.

import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

var PORT = 8443;
var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
var CERTS = path.join(ROOT, ".certs");
var DEMO_FILE = path.join(ROOT, "tests", "fixtures", "reconcile", "demo-clinic.json");
var CLINICS = path.join(ROOT, "tests", "fixtures", "reconcile", "clinics");
// One part of the address, never a path: no dots, no slashes.
var DEMO_PATH = /^\/_home\/demo-source\/([A-Za-z0-9-]+)\.json$/;

var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

// The demo clinic's address for one patient, answered here before any file
// is looked up, since no _home folder exists: that patient's clinic file,
// else Loria's. Null for every other address.
export function demoAnswer(urlPath, env) {
  if (urlPath.indexOf("/_home/") !== 0) return null;
  var found = DEMO_PATH.exec(urlPath);
  if (!found || env.BROWN_BAG_DEMO !== "two-clinics") return { status: 404 };
  var own = path.join(CLINICS, found[1] + ".json");
  return { status: 200, file: fs.existsSync(own) ? own : DEMO_FILE };
}

function send(response, filePath) {
  fs.readFile(filePath, function (error, data) {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

function serve() {
  var options = {
    cert: fs.readFileSync(path.join(CERTS, "cert.pem")),
    key: fs.readFileSync(path.join(CERTS, "key.pem"))
  };

  https.createServer(options, function (request, response) {
    var urlPath = decodeURIComponent(new URL(request.url, "https://localhost").pathname);
    var demo = demoAnswer(urlPath, process.env);
    if (demo) {
      if (demo.status === 200) send(response, demo.file);
      else response.writeHead(404).end("Not found");
      return;
    }
    if (urlPath.endsWith("/")) {
      urlPath += "index.html";
    }
    var filePath = path.join(ROOT, urlPath);
    var relative = path.relative(ROOT, filePath);
    // Refuse anything outside the repo, and the certificates themselves.
    if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep)[0].startsWith(".")) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    send(response, filePath);
  }).listen(PORT, "0.0.0.0", function () {
    console.log("Brown Bag is running at:");
    console.log("  https://localhost:" + PORT + "/");
    Object.values(os.networkInterfaces()).flat().forEach(function (net) {
      if (net && net.family === "IPv4" && !net.internal) {
        console.log("  https://" + net.address + ":" + PORT + "/   (phone, PIN lock only)");
      }
    });
    // Passkeys (Face ID, fingerprint) refuse number addresses, so the phone
    // uses the Mac's network name to test them. The certificate includes it.
    var name = os.hostname().replace(/\.local$/, "") + ".local";
    console.log("  https://" + name + ":" + PORT + "/   (phone, Face ID works here)");
    if (process.env.BROWN_BAG_DEMO === "two-clinics") console.log("  With the demo clinic's test records as a second source.");
  });
}

// Tests import demoAnswer without starting a server.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  serve();
}
