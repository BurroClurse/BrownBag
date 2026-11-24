// Swiping the QR code away: down, left or right. Close does the same, for
// anyone who can't swipe.

var EDGE = 24;
var FAR = 100;
var QUICK = 40;

// How far it's dragged, or null when this isn't a swipe to close. start: where
// the finger went down. Up is left to scrolling, and the sides of the screen to
// the phone's own Back.
export function dragOf(start, dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) {
    var edge = start.x < EDGE || start.x > start.width - EDGE;
    return edge ? null : { x: dx, y: 0 };
  }
  return dy > 0 && start.atTop ? { x: 0, y: dy } : null;
}

// A code a little taller than the screen still closes with one swipe down.
export function nearTop(scrollTop) {
  return scrollTop <= 40;
}

export function endsIt(drag, ms) {
  if (!drag) return false;
  var far = Math.max(Math.abs(drag.x), Math.abs(drag.y));
  return far >= FAR || (far >= QUICK && far / Math.max(ms, 1) >= 0.5);
}

export function swipeAway(overlay, close) {
  var start = null;
  var drag = null;
  var swiping = false;
  function settle() {
    overlay.classList.remove("dragging");
    overlay.style.removeProperty("--drag-x");
    overlay.style.removeProperty("--drag-y");
    start = null;
    drag = null;
    swiping = false;
  }
  // Once it's open, its opening animation no longer holds it in place.
  overlay.addEventListener("animationend", function (event) {
    if (event.target === overlay && /^qr-(in|fade-in)$/.test(event.animationName)) overlay.classList.add("open");
  });
  overlay.addEventListener("touchstart", function (event) {
    if (event.touches.length > 1) {
      settle();
      return;
    }
    var zoomed = window.visualViewport && window.visualViewport.scale > 1.01;
    if (zoomed || !overlay.classList.contains("open")) return;
    var touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY, width: innerWidth, atTop: nearTop(overlay.scrollTop), at: Date.now() };
  }, { passive: true });
  overlay.addEventListener("touchmove", function (event) {
    if (!start || event.touches.length > 1) return;
    var touch = event.touches[0];
    var dx = touch.clientX - start.x;
    var dy = touch.clientY - start.y;
    if (!swiping) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (!dragOf(start, dx, dy)) {
        start = null;
        return;
      }
      swiping = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      overlay.classList.add("dragging");
    }
    // Kept to the way it started.
    drag = swiping === "x" ? { x: dx, y: 0 } : { x: 0, y: Math.max(dy, 0) };
    if (event.cancelable) event.preventDefault();
    overlay.style.setProperty("--drag-x", drag.x + "px");
    overlay.style.setProperty("--drag-y", drag.y + "px");
  }, { passive: false });
  overlay.addEventListener("touchend", function () {
    if (!swiping) {
      start = null;
      return;
    }
    if (endsIt(drag, Date.now() - start.at)) {
      // It closes from where the finger left it.
      start = null;
      close();
    } else {
      settle();
    }
  });
  overlay.addEventListener("touchcancel", settle);
}
