// Saves a file on this device: the share sheet where it works, else a
// download. Used for the FHIR file and for backups. Nothing is sent.

export async function saveToDevice(file, nav, save) {
  nav = nav || navigator;
  save = save || download;
  if (!nav.canShare || !nav.canShare({ files: [file] })) return save(file);
  try {
    // Only the file: an iPhone saves a title as a second file.
    await nav.share({ files: [file] });
  } catch (error) {
    // Cancelled, or a share sheet is already open.
    if (error && (error.name === "AbortError" || error.name === "InvalidStateError")) throw error;
    // Chrome on Android says it can share a .json file, then refuses.
    save(file);
  }
}

function download(file) {
  var link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Android may ask where to save it first.
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 60000);
}
