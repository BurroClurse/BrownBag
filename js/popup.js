// A popup in the app's own look: the browser's <dialog>, which dims the page
// and keeps taps and the keyboard inside. Escape and the phone's Back close it.
// opener gets focus back. tapOutside: whether a tap beside the card closes it.

export function openPopup(parent, text, opener, { tapOutside = true, onClose = null, danger = false } = {}) {
  var popup = document.createElement("dialog");
  popup.className = "popup" + (danger ? " popup-danger" : "");
  popup.setAttribute("aria-labelledby", "popup-title");
  var inner = document.createElement("div");
  inner.className = "popup-inner";
  popup.appendChild(inner);
  var title = document.createElement("h2");
  title.id = "popup-title";
  title.textContent = text;
  inner.appendChild(title);
  popup.addEventListener("click", function (event) {
    if (tapOutside && event.target === popup) popup.close();
  });
  popup.addEventListener("close", function () {
    popup.remove();
    // iPhone Safari doesn't give a tapped button focus, so it isn't put back.
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    if (onClose) onClose();
  });
  parent.appendChild(popup);
  popup.showModal();
  return { inner: inner, close: function () { popup.close(); } };
}

// Leaving the screen closes it.
export function closePopups() {
  document.querySelectorAll("dialog.popup[open]").forEach(function (popup) { popup.close(); });
}

export function popupLine(inner, text, className) {
  var p = document.createElement("p");
  p.textContent = text;
  if (className) p.className = className;
  inner.appendChild(p);
  return p;
}

export function popupButton(parent, text, kind) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = "button big " + kind;
  button.textContent = text;
  parent.appendChild(button);
  return button;
}
