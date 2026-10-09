/**
 * Placeholder text is a token, not a faded copy of the muted ink. Diluting
 * `--ink-3` to 80% put it at 4.3:1 — under AA, and it is often the only hint
 * of what a field wants. `--ink-placeholder` is tuned to clear 4.5:1 against
 * both the live and the disabled field ground.
 */
export const controlBase =
  "w-full rounded-[var(--r)] border border-line-strong bg-surface text-ink " +
  "placeholder:text-ink-placeholder shadow-[inset_0_1px_2px_hsl(var(--sh)/.04)] " +
  "transition-[border-color,box-shadow,background-color] duration-150 ease-[var(--ease-brand)] " +
  "focus:outline-none focus:border-focus focus:shadow-[var(--focus-ring)] " +
  "disabled:bg-disabled-surface disabled:text-disabled-ink disabled:border-disabled-border " +
  "disabled:cursor-not-allowed";
