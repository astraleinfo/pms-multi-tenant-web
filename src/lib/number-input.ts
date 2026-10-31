/**
 * What a number box reports for what is typed in it, or `undefined` for a
 * half-typed value ("-", "1e") that is left on screen without being reported.
 *
 * An empty box means zero, unless the field opts into `emptyAsNaN` — for a
 * figure where "nothing" and "zero" differ, such as a price that, left empty,
 * falls back to another one. The caller then gets `NaN` and decides.
 */
export function readNumberInput(raw: string, { emptyAsNaN = false } = {}): number | undefined {
  if (raw.trim() === "") return emptyAsNaN ? Number.NaN : 0;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}
