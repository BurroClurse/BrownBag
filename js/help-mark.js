// The "?" on the help pills (the developer, 2026-11-28): drawn as a shape,
// not a letter, so the hook stays in the pill's white top half and the dot in
// its teal bottom half, each the other color. A smooth hook at 80 percent of
// the first drawing, the dot matched to the line, and the dot just under the
// middle line, so the gap is about one line wide. Sizes are in the pill's inside (the
// 33 by 44 pill less its 2px border). Used by the page and by the paper ball.

var SVG = "http://www.w3.org/2000/svg";

export var HELP_MARK = {
  width: 29,
  height: 40,
  hook: "M9.78 10.32 C9.78 7.76 11.86 6.08 14.5 6.08 C17.14 6.08 19.22 7.76 19.22 10.32 C19.22 12.72 16.98 13.36 15.62 14.32 C14.82 14.88 14.5 15.6 14.5 17.36",
  stroke: 4.6,
  dot: { cx: 14.5, cy: 26.2, r: 2.9 },
  ink: "#164F5A",
  paper: "#FFFFFF"
};

// Every point the hook's path names. A curve stays inside the points that
// shape it, so these bound where the hook can reach.
export function hookPoints() {
  var numbers = HELP_MARK.hook.match(/-?\d+(?:\.\d+)?/g).map(Number);
  var points = [];
  for (var i = 0; i < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
  return points;
}

// The mark for a pill in the page. Its colors come from the CSS, so a
// high-contrast mode can override them.
export function helpMarkSvg() {
  var svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "help-mark");
  svg.setAttribute("viewBox", "0 0 " + HELP_MARK.width + " " + HELP_MARK.height);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  var hook = document.createElementNS(SVG, "path");
  hook.setAttribute("d", HELP_MARK.hook);
  hook.setAttribute("class", "help-hook");
  var dot = document.createElementNS(SVG, "circle");
  dot.setAttribute("cx", HELP_MARK.dot.cx);
  dot.setAttribute("cy", HELP_MARK.dot.cy);
  dot.setAttribute("r", HELP_MARK.dot.r);
  dot.setAttribute("class", "help-dot");
  svg.appendChild(hook);
  svg.appendChild(dot);
  return svg;
}
