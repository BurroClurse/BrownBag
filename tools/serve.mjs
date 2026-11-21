// Serves the app over https on this Mac so a phone on the same Wi-Fi can
// open it. Encryption, passkeys and the camera only run on secure pages.
// Certificates come from mkcert and live in .certs/ (never committed).
//
// Run: node tools/serve.mjs

import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

var PORT = 8443;
var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
var CERTS = path.join(ROOT, ".certs");

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

var options = {
  cert: fs.readFileSync(path.join(CERTS, "cert.pem")),
  key: fs.readFileSync(path.join(CERTS, "key.pem"))
};

https.createServer(options, function (request, response) {
  var urlPath = decodeURIComponent(new URL(request.url, "https://localhost").pathname);
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
});
