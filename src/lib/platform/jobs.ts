import type { Job, JobStatus } from "@/lib/api";
import type { Tone } from "@/components/ui/badge";

/* ==========================================================================
   Reading a job.

   Flower's vocabulary arrives already translated by the API; what is left is
   presentation — the tone a status wears, how long "2.5 seconds" should read,
   and how a UTC stamp becomes a time somebody recognises.
   ========================================================================== */

export const JOB_STATUSES: readonly JobStatus[] = [
  "active", "pending", "completed", "failed", "retried", "revoked",
] as const;

export const JOB_TONE: Record<JobStatus, Tone> = {
  active: "accent",
  pending: "warn",
  completed: "ok",
  failed: "critical",
  retried: "info",
  revoked: "neutral",
};

export const JOB_LABEL: Record<JobStatus, string> = {
  active: "Running",
  pending: "Queued",
  completed: "Completed",
  failed: "Failed",
  retried: "Retried",
  revoked: "Revoked",
};

/**
 * A duration, at the precision the number deserves.
 *
 * Sub-second jobs are the common case here and "0 minutes" tells nobody
 * anything, so milliseconds survive until a job runs long enough for them to
 * stop mattering.
 */
export function durationOf(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;

  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

/**
 * A UTC stamp as a local time.
 *
 * The API sends UTC because a job belongs to no clinic and therefore to no
 * clinic's clock. The person reading the screen does have one, so the
 * conversion happens here — in the browser, which is the only place that knows
 * what it is.
 */
export function momentOf(iso: string | null | undefined, style: "full" | "time" = "full"): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString(undefined, {
    ...(style === "full" ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** "4 minutes ago" — how stale the thing on screen is. */
export function agoOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

/** The last thing that happened to a job, whatever that was. */
export const lastEventOf = (job: Job) =>
  job.finished_at ?? job.started_at ?? job.received_at ?? null;

/**
 * The short name of a task.
 *
 * Every task in this product is `pms.<area>.<verb>`, and the column is far
 * more readable showing the last two. The full name is still the title.
 */
export function shortTaskName(name: string): string {
  const parts = name.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : name;
}

/**
 * A `datetime-local` value as an instant the API will read correctly.
 *
 * The control hands back local wall-clock with no zone on it, and the API
 * reads a zoneless stamp as UTC — so sending it through untouched would slide
 * the window by however far from Greenwich the person is sitting.
 */
export function localInputToUtc(value: string): string | undefined {
  if (!value) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}
