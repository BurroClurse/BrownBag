// The code crumples into a paper ball and drops into the bag. If this broke, the
// patient would see a torn or stuck picture over home, or digits flashing by.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CRUMPLE_MS, bagMouth, dotsFor, makeMesh, meshAt, pathAt } from "../js/crumple.js";

const SIZE = { width: 393, height: 852 };
const MESH = makeMesh(SIZE.width, SIZE.height);
const far = (points) => Math.max(...points.map((p) => Math.hypot(p.x, p.y)));

test("it starts as the whole flat page", () => {
  const points = meshAt(MESH, 0);
  points.forEach((p, i) => assert.deepEqual([p.x, p.y], [MESH.points[i].u - SIZE.width / 2, MESH.points[i].v - SIZE.height / 2]));
  for (const [u, v] of [[0, 0], [393, 0], [0, 852], [393, 852]]) assert.ok(MESH.points.some((p) => p.u === u && p.v === v));
});

test("it ends as a ball, about as wide as it is tall", () => {
  const points = meshAt(MESH, 1);
  assert.ok(far(points) <= MESH.ball * 1.15);
  const span = (k) => Math.max(...points.map((p) => p[k])) - Math.min(...points.map((p) => p[k]));
  assert.ok(Math.abs(span("x") / span("y") - 1) < 0.25);
  assert.ok(far(meshAt(MESH, 0.5)) < far(meshAt(MESH, 0.2)));
});

test("it's crumpled, not only shrunk: the corners fold in unevenly, the same way each time", () => {
  const ratio = meshAt(MESH, 0.5).map((p, i) => Math.hypot(p.x, p.y) / Math.max(1, Math.hypot(MESH.points[i].u - 196.5, MESH.points[i].v - 426)));
  assert.ok(Math.max(...ratio) - Math.min(...ratio) > 0.1);
  assert.deepEqual(meshAt(makeMesh(393, 852), 0.5), meshAt(MESH, 0.5));
});

test("every fold has three corners, and together they cover the page", () => {
  const area = MESH.triangles.reduce((sum, t) => { const [a, b, c] = t.at.map((i) => MESH.points[i]); return sum + Math.abs((b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v)) / 2; }, 0);
  assert.ok(Math.abs(area - 393 * 852) < 1);
});

test("it goes from where the finger left it, up over the bag's mouth, then down into it", () => {
  const from = { x: 0, y: 300 }, mouth = { x: 180, y: 200 };
  assert.deepEqual(pathAt(0, from, mouth, 80), { x: 0, y: 300, scale: 1, turn: 0 });
  const end = pathAt(1, from, mouth, 80);
  assert.equal(end.x, 180);
  assert.ok(end.y > mouth.y + 80 * end.scale, "wholly below the mouth's edge");
  assert.ok(Array.from({ length: 21 }, (_, i) => pathAt(i / 20, from, mouth, 80).y).some((y) => y < mouth.y - 20), "above it first");
  // Never tossed far above the bag: home's bag is near the top of the screen.
  for (let i = 0; i <= 20; i += 1) assert.ok(pathAt(i / 20, from, mouth, 80).y > mouth.y - 90);
});

test("the mouth is the top of the bag in the picture, even with space around it", () => {
  assert.deepEqual(bagMouth({ left: 0, top: 100, width: 800, height: 744 }, 800 / 744), { x: 368, y: 110, half: 208 });
  // The picture keeps its shape inside a wider box.
  const wide = bagMouth({ left: 0, top: 0, width: 1600, height: 744 }, 800 / 744);
  assert.equal(wide.x, 768);
});

test("the digits aren't drawn, Reduce Motion still fades, and it can't get stuck", () => {
  const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  assert.match(read("js/crumple.js"), /code-reveal/);
  const app = read("js/app.js");
  const close = app.slice(app.indexOf("function closeQr")).split("\n}\n")[0];
  assert.match(close, /prefers-reduced-motion/);
  assert.match(close, /setTimeout\(finish/);
  assert.ok(CRUMPLE_MS <= 1200);
  assert.ok(read("sw.js").includes('"./js/crumple.js"'));
});

// Drawn sharply from the start, a slow phone showed 5 frames in the whole second.
test("it starts plain, and is drawn sharply only once the phone shows it's fast", () => {
  assert.equal(dotsFor([], 2), 1);
  assert.equal(dotsFor([16, 17, 16], 2), 1);
  assert.equal(dotsFor([16, 17, 16, 17], 2), 2);
  assert.equal(dotsFor([40, 16, 16, 16, 16], 2), 1);
  assert.equal(dotsFor([16, 17, 16, 17, 60], 2), 1);
  assert.equal(dotsFor([16, 17, 16, 17, 60, 16, 16, 16, 16], 2), 1);
  assert.equal(dotsFor([8, 8, 8, 8], 1), 1);
});

// From the developer's video: the iPhone's status bar strip stayed white until the ball
// was in the bag, because the white code screen was only made invisible.
test("the code screen is off the page while the ball falls", () => {
  const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
  assert.match(read("js/crumple.js"), /overlay\.style\.display = "none"/);
  const app = read("js/app.js");
  const close = app.slice(app.indexOf("function closeQr")).split("\n}\n")[0];
  // If it can't be drawn, the code screen comes back to fade out.
  assert.match(close, /overlay\.style\.display = ""/);
});
