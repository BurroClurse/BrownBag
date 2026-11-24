// The sign-in library writes what it does to the browser's log, including
// sign-in passes and record addresses. This page drops those lines. It loads
// before the library, which stays an unchanged copy.
(function () {
  var debug = console.debug;
  console.debug = function (message) {
    if (typeof message === "string" && message.indexOf("[fhirclient]") === 0) return;
    debug.apply(console, arguments);
  };
})();
