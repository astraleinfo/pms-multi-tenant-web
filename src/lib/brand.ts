/**
 * The colour a clinic prints its invoices in. The API owns the rule — it refuses to store a
 * colour white text cannot be read on — and this mirrors it, so the Settings page can say so
 * as someone types instead of after a refused save.
 */

/** What a clinic that never chose a colour prints in. Matches the API's default. */
export const DEFAULT_BRAND_COLOR = "#0f766e";

/** The least contrast against white a brand colour may have (WCAG's 4.5:1 for body text). */
const MIN_CONTRAST = 4.5;

const HEX = /^#[0-9a-fA-F]{6}$/;

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** The contrast ratio of white text on `hex`: 1 (none) to 21 (black). Expects `#rrggbb`. */
export function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 1.05 / (0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b) + 0.05);
}

/** Why `value` cannot be the brand colour, in words for the person typing — or `null` if it can. */
export function brandProblem(value: string): string | null {
  if (!HEX.test(value)) return "A colour is written #rrggbb, like #0f766e.";
  if (contrastWithWhite(value) < MIN_CONTRAST) {
    return "That colour is too light for white text to be read on it. Pick a darker one.";
  }
  return null;
}
