// Closing the QR code crumples it, like a sheet of paper, into a ball that drops
// into the bag. A picture of the code screen is drawn in folds on a canvas over
// home. Only crumpleInto touches the page.

export var CRUMPLE_MS = 1000;
// The part of that spent crumpling; the rest is the drop.
var CRUMPLING = 0.55;
var COLUMNS = 6;
var ROWS = 10;

// The same numbers each time, so it never looks broken by chance.
function numbers() {
  var seed = 7;
  return function () {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function ease(t) {
  return t * t * (3 - 2 * t);
}

// The page as a grid of points, each with its place in the ball, and the folds
// between them.
export function makeMesh(width, height) {
  var next = numbers();
  var ball = Math.min(width, height) * 0.17;
  var points = [];
  var triangles = [];
  for (var row = 0; row <= ROWS; row += 1) {
    for (var col = 0; col <= COLUMNS; col += 1) {
      var inside = col > 0 && col < COLUMNS && row > 0 && row < ROWS;
      var u = (col + (inside ? (next() - 0.5) * 0.7 : 0)) * width / COLUMNS;
      var v = (row + (inside ? (next() - 0.5) * 0.7 : 0)) * height / ROWS;
      var nx = u / width * 2 - 1;
      var ny = v / height * 2 - 1;
      // A square fitted to a circle; the edge a little uneven, like paper.
      var bx = nx * Math.sqrt(1 - ny * ny / 2);
      var by = ny * Math.sqrt(1 - nx * nx / 2);
      var uneven = inside ? 0.55 + next() * 0.75 : 0.88 + next() * 0.24;
      points.push({ u: u, v: v, bx: bx * ball * uneven, by: by * ball * uneven, wait: next() * 0.35, jitter: (next() - 0.5) * width * 0.22, jitterY: (next() - 0.5) * width * 0.22 });
    }
  }
  for (row = 0; row < ROWS; row += 1) {
    for (col = 0; col < COLUMNS; col += 1) {
      var a = row * (COLUMNS + 1) + col;
      var b = a + 1;
      var c = a + COLUMNS + 1;
      var d = c + 1;
      (next() < 0.5 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]]).forEach(function (at) {
        triangles.push({ at: at, shade: next() });
      });
    }
  }
  return { width: width, height: height, ball: ball, points: points, triangles: triangles };
}

// Where every point is, measured from the middle. t: 0 flat, 1 a ball.
export function meshAt(mesh, t) {
  return mesh.points.map(function (p) {
    var mine = ease(Math.max(0, Math.min(1, (t - p.wait * 0.5) / (1 - p.wait * 0.5))));
    var fold = Math.sin(Math.PI * mine);
    var x = p.u - mesh.width / 2;
    var y = p.v - mesh.height / 2;
    return {
      x: mine === 0 ? x : mine === 1 ? p.bx : x + (p.bx - x) * mine + p.jitter * fold,
      y: mine === 0 ? y : mine === 1 ? p.by : y + (p.by - y) * mine + p.jitterY * fold
    };
  });
}

// The ball's way into the bag: up over its mouth, then straight down into it.
var SMALL = 0.5;
export function pathAt(t, from, mouth, ball) {
  if (t === 0) return { x: from.x, y: from.y, scale: 1, turn: 0 };
  var over = { x: mouth.x, y: mouth.y - ball * 0.75 };
  var rise = Math.min(1, t / 0.6);
  var drop = Math.max(0, (t - 0.6) / 0.4);
  var scale = 1 - (1 - SMALL) * ease(rise);
  var eased = ease(rise);
  return {
    x: from.x + (over.x - from.x) * eased,
    y: from.y + (over.y - from.y) * eased - Math.sin(Math.PI * rise) * ball * 0.2 + drop * drop * ball * 1.4,
    scale: scale,
    turn: 1.6 * eased
  };
}

// How finely it's drawn: plain, and sharp after four quick frames, unless any
// frame was slow. frames: how long each took; most: the screen's own sharpness.
export function dotsFor(frames, most) {
  return frames.length >= 4 && frames.every(function (ms) { return ms < 30; }) ? most : 1;
}

// The bag's open top in the logo picture: its middle and half its width.
export function bagMouth(box, shape) {
  var width = Math.min(box.width, box.height * shape);
  var height = width / shape;
  var left = box.left + (box.width - width) / 2;
  var top = box.top + (box.height - height) / 2;
  return { x: Math.round(left + width * 0.46), y: Math.round(top + height * 0.013), half: Math.round(width * 0.26) };
}

// A picture of the code screen as it is now. The 6 digits are left out.
function picture(overlay, width, height) {
  var sheet = document.createElement("canvas");
  sheet.width = Math.round(width);
  sheet.height = Math.round(height);
  var pen = sheet.getContext("2d");
  var base = overlay.getBoundingClientRect();
  pen.fillStyle = "#FFFFFF";
  pen.fillRect(0, 0, width, height);
  var qr = overlay.querySelector(".qr canvas");
  if (qr) {
    var box = qr.getBoundingClientRect();
    pen.drawImage(qr, box.left - base.left, box.top - base.top, box.width, box.height);
  }
  overlay.querySelectorAll("h2, .qr-say, button:not(.code-reveal)").forEach(function (part) {
    var at = part.getBoundingClientRect();
    var style = getComputedStyle(part);
    if (!at.width) return;
    var solid = style.backgroundColor;
    if (solid !== "rgba(0, 0, 0, 0)" && solid !== "transparent") {
      pen.fillStyle = solid;
      var corner = /%/.test(style.borderRadius) ? at.height / 2 : Math.min(parseFloat(style.borderRadius) || 0, at.height / 2);
      pen.beginPath();
      if (pen.roundRect) pen.roundRect(at.left - base.left, at.top - base.top, at.width, at.height, corner);
      else pen.rect(at.left - base.left, at.top - base.top, at.width, at.height);
      pen.fill();
    }
    pen.fillStyle = style.color;
    pen.font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    lines(part).forEach(function (line) { pen.fillText(line.text, line.x - base.left, line.y - base.top); });
  });
  return sheet;
}

// The words of an element, a line each, where they are on the screen.
function lines(part) {
  var out = [];
  var node = part.firstChild;
  if (!node || node.nodeType !== 3) return out;
  var range = document.createRange();
  var words = /\S+/g;
  var found;
  while ((found = words.exec(node.data))) {
    range.setStart(node, found.index);
    range.setEnd(node, found.index + found[0].length);
    var box = range.getBoundingClientRect();
    var last = out[out.length - 1];
    if (last && Math.abs(last.top - box.top) < 4) {
      last.text += " " + found[0];
      last.right = box.right;
    } else {
      out.push({ text: found[0], top: box.top, left: box.left, right: box.right, bottom: box.bottom });
    }
  }
  return out.map(function (l) { return { text: l.text, x: (l.left + l.right) / 2, y: (l.top + l.bottom) / 2 }; });
}

// One fold: that part of the picture, pulled to its new corners, then shaded.
function drawFold(pen, sheet, mesh, points, triangle, t) {
  var p = triangle.at.map(function (i) { return mesh.points[i]; });
  var q = triangle.at.map(function (i) { return points[i]; });
  var det = (p[1].u - p[0].u) * (p[2].v - p[0].v) - (p[2].u - p[0].u) * (p[1].v - p[0].v);
  if (!det) return;
  var across = function (k) { return ((q[1][k] - q[0][k]) * (p[2].v - p[0].v) - (q[2][k] - q[0][k]) * (p[1].v - p[0].v)) / det; };
  var down = function (k) { return ((q[2][k] - q[0][k]) * (p[1].u - p[0].u) - (q[1][k] - q[0][k]) * (p[2].u - p[0].u)) / det; };
  var a = across("x");
  var b = across("y");
  var c = down("x");
  var d = down("y");
  pen.save();
  pen.beginPath();
  pen.moveTo(q[0].x, q[0].y);
  pen.lineTo(q[1].x, q[1].y);
  pen.lineTo(q[2].x, q[2].y);
  pen.closePath();
  // White under it, so no gap shows between folds.
  pen.fillStyle = "#FFFFFF";
  pen.strokeStyle = "#FFFFFF";
  pen.lineWidth = 1;
  pen.fill();
  pen.stroke();
  pen.clip();
  pen.transform(a, b, c, d, q[0].x - a * p[0].u - c * p[0].v, q[0].y - b * p[0].u - d * p[0].v);
  pen.drawImage(sheet, 0, 0);
  pen.restore();
  var dark = Math.min(1, t * 2.5);
  pen.beginPath();
  pen.moveTo(q[0].x, q[0].y);
  pen.lineTo(q[1].x, q[1].y);
  pen.lineTo(q[2].x, q[2].y);
  pen.closePath();
  pen.fillStyle = "rgba(70, 58, 44, " + (triangle.shade * 0.38 * dark).toFixed(3) + ")";
  pen.fill();
  pen.strokeStyle = "rgba(60, 50, 40, " + (0.22 * dark).toFixed(3) + ")";
  pen.lineWidth = 0.7;
  pen.stroke();
}

// Crumples the overlay into the bag (its img). Calls done once at the end. False
// when it can't be drawn, and nothing has changed.
export function crumpleInto(overlay, bag, done) {
  var width = overlay.clientWidth;
  var height = overlay.clientHeight;
  var canvas = document.createElement("canvas");
  var pen = canvas.getContext && canvas.getContext("2d");
  var box = bag && bag.getBoundingClientRect();
  if (!pen || !width || !height || !box || !box.width || !bag.naturalWidth) return false;
  var sheet = picture(overlay, width, height);
  var mesh = makeMesh(width, height);
  var mouth = bagMouth(box, bag.naturalWidth / bag.naturalHeight);
  // Small enough to go into the bag's mouth.
  var fit = Math.min(1, mouth.half * 1.5 / mesh.ball);
  var at = overlay.getBoundingClientRect();
  var from = { x: at.left + at.width / 2, y: at.top + at.height / 2 };
  var most = Math.min(2, window.devicePixelRatio || 1);
  var frames = [];
  var dots = 1;
  canvas.className = "crumple";
  canvas.setAttribute("aria-hidden", "true");
  function size() {
    canvas.width = innerWidth * dots;
    canvas.height = innerHeight * dots;
  }
  size();
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  document.body.appendChild(canvas);
  overlay.style.visibility = "hidden";
  var start = null;
  var last = null;
  var ended = false;
  function end() {
    if (ended) return;
    ended = true;
    canvas.remove();
    done();
  }
  function frame(now) {
    if (ended) return;
    if (start === null) start = now;
    var finer = dots;
    if (last !== null) frames.push(now - last);
    dots = dotsFor(frames, most);
    last = now;
    if (dots !== finer) size();
    var t = Math.min(1, (now - start) / CRUMPLE_MS);
    try {
      draw(t);
    } catch (error) {
      end();
      return;
    }
    if (t < 1) requestAnimationFrame(frame);
    else end();
  }
  function draw(t) {
    var crumpled = Math.min(1, t / CRUMPLING);
    var falling = Math.max(0, (t - CRUMPLING * 0.8) / (1 - CRUMPLING * 0.8));
    var path = pathAt(falling, from, mouth, mesh.ball * fit);
    var small = path.scale * (1 + (fit - 1) * ease(Math.min(1, falling / 0.6)));
    pen.save();
    pen.setTransform(dots, 0, 0, dots, 0, 0);
    pen.clearRect(0, 0, innerWidth, innerHeight);
    // Once it's over the mouth, whatever is below the edge is inside the bag.
    if (falling > 0.6) {
      pen.beginPath();
      pen.rect(0, 0, innerWidth, mouth.y);
      pen.clip();
    }
    pen.translate(path.x, path.y);
    pen.rotate(path.turn);
    pen.scale(small, small);
    if (!crumpled) {
      pen.drawImage(sheet, -width / 2, -height / 2);
      pen.restore();
      return;
    }
    var points = meshAt(mesh, crumpled);
    mesh.triangles.forEach(function (triangle) { drawFold(pen, sheet, mesh, points, triangle, crumpled); });
    pen.restore();
  }
  draw(0);
  requestAnimationFrame(frame);
  // Phones pause drawing in the background.
  setTimeout(end, CRUMPLE_MS + 400);
  return true;
}
