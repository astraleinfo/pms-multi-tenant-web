/* Pure step navigation for the tour, kept out of the component so the
   direction rules can be tested. */

export type TourDirection = "forward" | "back";

/** Where one move from `index` lands: a step index, or "finish" past the end. */
export function stepTarget(index: number, length: number, dir: TourDirection): number | "finish" {
  if (dir === "forward") return index + 1 < length ? index + 1 : "finish";
  return index > 0 ? index - 1 : 0;
}

/**
 * Where to go when a step's anchor never shows up. A skipped step is skipped in
 * the direction of travel — skipping forward after Back would undo the Back.
 * Backing off the first step has nowhere left to go, so the tour ends.
 */
export function skipTarget(index: number, length: number, dir: TourDirection): number | "finish" {
  if (dir === "back" && index === 0) return "finish";
  return stepTarget(index, length, dir);
}

/**
 * How many 125ms looks to spend on an anchor. A page that is still arriving
 * deserves a few seconds; once we are already on the step's route, an anchor
 * that is not there is not coming, and waiting only makes the tour feel stuck.
 */
export function maxAnchorAttempts(onRoute: boolean): number {
  return onRoute ? 6 : 24;
}

/** Whether the pathname is the step's own route (a step with no `href` is always on route). */
export function isOnRoute(href: string | undefined, pathname: string): boolean {
  if (!href) return true;
  return href.split("?")[0] === pathname;
}
