/** Tiny class joiner. No dependency, no merge magic — order wins. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
