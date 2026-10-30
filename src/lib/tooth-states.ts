/**
 * The tooth states the chart can record, as plain data so the cycle and the
 * label mapping can be tested without rendering anything.
 *
 * The keys are what is stored in `clinical_ext.tooth_chart`, an open JSON
 * column the API does not validate against a list, so a key is never renamed
 * or reused: existing charts hold them. New states only ever go on the end.
 */
export type ToothState =
  | "healthy" | "watch" | "caries" | "filling" | "crown" | "extract"
  | "mobility" | "fracture";

/**
 * The states in clinical order, healthy to hopeless, because the legend reads
 * as a scale and the click-cycle walks it. Mobility and fracture are findings
 * rather than steps on that scale; they sit after extraction so that the
 * original six keep their positions and a clinician's click-count habits.
 *
 * `caries` was missing. Not as an edge case — it is the second commonest value
 * in the column after `filling`, and every encounter carrying one crashed the
 * chart on `TOOTH_STATES.find(...)!`. Active decay and a tooth already booked
 * for removal are both red, and they have to be told apart, so decay takes the
 * soft tint and extraction the solid one: the tooth that is coming out is the
 * only thing on this chart that is filled in.
 *
 * Mobility takes violet and fracture the solid ink. Every red, amber, blue,
 * green and neutral tone is already spoken for, and neither finding is a
 * grade of decay, so neither borrows a colour that means one. Colour is also
 * never the only signal: each state has its own glyph on the tooth and its
 * name in the title.
 */
export const TOOTH_STATES: Array<{ key: ToothState; label: string; swatch: string; ink: string }> = [
  { key: "healthy", label: "Sound", swatch: "bg-surface border-line-strong", ink: "text-ink-2" },
  { key: "watch", label: "Watch", swatch: "bg-warn-soft border-warn-border", ink: "text-warn-text" },
  { key: "caries", label: "Decay", swatch: "bg-critical-soft border-critical-border", ink: "text-critical-text" },
  { key: "filling", label: "Filled", swatch: "bg-info-soft border-info-border", ink: "text-info-text" },
  { key: "crown", label: "Crowned", swatch: "bg-accent-soft border-accent-border", ink: "text-accent-text" },
  { key: "extract", label: "For extraction", swatch: "bg-critical border-critical", ink: "text-ink-on" },
  { key: "mobility", label: "Mobility", swatch: "bg-violet-soft border-violet-border", ink: "text-violet-text" },
  { key: "fracture", label: "Fracture", swatch: "bg-ink-2 border-ink-2", ink: "text-ink-on" },
];

export const TOOTH_CYCLE: ToothState[] = TOOTH_STATES.map((s) => s.key);

/** The state's display metadata, or undefined for a value this build does not know. */
export function toothStateMeta(state: string) {
  return TOOTH_STATES.find((s) => s.key === state);
}

/**
 * What a click on a tooth in `current` turns it into. `indexOf` is -1 for a
 * state that is not in the cycle, and -1 + 1 is 0 — so an unrecognised tooth
 * steps to "healthy" on the first click rather than to "watch". Clicking it
 * is the reader saying they have looked.
 */
export function nextToothState(current: string): ToothState {
  return TOOTH_CYCLE[(TOOTH_CYCLE.indexOf(current as ToothState) + 1) % TOOTH_CYCLE.length];
}
