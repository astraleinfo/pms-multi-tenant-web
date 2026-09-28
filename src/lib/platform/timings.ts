/** The API stores every timing knob in seconds or whole days; the Settings
 * form shows the unit an admin actually thinks in. Converting is one line
 * each way — worth a test because a form field is not a place a silent
 * rounding drift gets noticed. */

export function secondsToDays(seconds: number): number {
  return Math.round(seconds / 86400);
}

export function daysToSeconds(days: number): number {
  return days * 86400;
}

export function secondsToHours(seconds: number): number {
  return Math.round(seconds / 3600);
}

export function hoursToSeconds(hours: number): number {
  return hours * 3600;
}
