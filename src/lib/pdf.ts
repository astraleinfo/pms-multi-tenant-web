/** Opens a PDF blob in a new tab as an object URL. The URL is revoked after a
 *  short delay — long enough for the new tab to have loaded it. */
export function openPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
