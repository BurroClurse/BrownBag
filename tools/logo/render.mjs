// Renders tools/logo/logo.html to the PNGs the app uses, with headless
// Chrome. Run from the repo root:  node tools/logo/render.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PAGE = pathToFileURL(path.join(HERE, "logo.html")).href;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9340;
const OUTPUTS = [
  { mode: "logo", size: 1024, file: "icons/logo.png" },
  { mode: "icon", size: 512, file: "icons/icon-512.png" },
  { mode: "icon", size: 192, file: "icons/icon-192.png" },
  { mode: "icon", size: 180, file: "icons/apple-touch-icon.png" }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + mkdtempSync(path.join(tmpdir(), "bb-logo-")), "about:blank"], { stdio: "ignore" });

let ws, nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  let url;
  for (let i = 0; i < 50 && !url; i++) {
    try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
    if (!url) await sleep(200);
  }
  ws = new WebSocket(url);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
  });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 1024, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const out of OUTPUTS) {
    await send("Page.navigate", { url: PAGE + "?mode=" + out.mode });
    await sleep(500);
    // Wait for the web font, so the name is never drawn in a stand-in font.
    await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => document.fonts.check('700 100px Fredoka'))", awaitPromise: true, returnByValue: true });
    await sleep(300);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1024, height: 1024, scale: out.size / 1024 } });
    writeFileSync(path.join(ROOT, out.file), Buffer.from(shot.data, "base64"));
    console.log("wrote " + out.file + " (" + out.size + "px)");
  }
} finally {
  chrome.kill();
  process.exit(0);
}
