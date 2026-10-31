/**
 * What the platform calls itself, and the logo it draws — in one place, so a
 * rename is one edit. Mirrors the API's `app/core/brand.py`.
 *
 * `PRODUCT_NAME` wherever there is room for words (the page title, the sign-in
 * stage). The API's emails use a short tagline ("CMS") in the one slot
 * too small for it; nothing in the web app is that tight.
 */

export const PLATFORM_NAME = "Astrale";
export const PRODUCT_NAME = "Clinic Management System";
/** "Astrale Clinic Management System", for a line that names both at once */
export const FULL_NAME = `${PLATFORM_NAME} ${PRODUCT_NAME}`;

/** The built-in logo — what the console draws until a custom one is uploaded,
 *  and what it falls back to while that one loads. The API bundles its own copy. */
export const DEFAULT_LOGO_SRC = "/astrale-logo-mark.png";

/** What the API accepts for the platform's logo. It is the authority — this is
 *  only so the console can refuse an obvious mistake before the upload. */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** The longest side, in pixels — the API's `MAX_LOGO_SIDE`. */
export const LOGO_MAX_SIDE = 4000;

/** Why an image this many pixels across and down cannot be the logo — or
 *  `null` if it can. Read off the staged preview once it has loaded. */
export function logoSizeProblem(width: number, height: number): string | null {
  if (width > LOGO_MAX_SIDE || height > LOGO_MAX_SIDE) {
    return `Logos are limited to ${LOGO_MAX_SIDE} × ${LOGO_MAX_SIDE} pixels; this one is ${width} × ${height}.`;
  }
  return null;
}

/** Why `file` cannot be the platform's logo, in words for the person who chose
 *  it — or `null` if it can be sent. */
export function logoProblem(file: { type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
    return "A logo has to be a PNG, JPEG or WebP image.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > LOGO_MAX_BYTES) return "Logos are limited to 2 MB.";
  return null;
}
