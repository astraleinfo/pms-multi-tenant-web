import type { QueueEntry } from "./types";

/**
 * A clinician sees one patient at a time. The API refuses to start a second
 * consultation while one is open (409, `details.reason === "doctor_busy"`);
 * these helpers let a screen say so before it asks, and read the refusal when
 * it asks anyway.
 */

/** Who is holding the room, as the popup names them. */
export interface CurrentConsultation {
  queueEntryId: string;
  patientName: string;
  tokenNo: number;
}

/**
 * The consultation that would block starting `entry`: another token of the
 * same clinician, on the same day, already in consultation. `null` when the
 * clinician is free — and always for the token that is itself in the room, so
 * recording that one is never blocked.
 */
export function blockingConsultation(
  queue: readonly QueueEntry[],
  entry: Pick<QueueEntry, "id" | "doctor_id" | "queue_date" | "status">,
): QueueEntry | null {
  if (entry.status === "in_consultation") return null;
  return (
    queue
      .filter((q) =>
        q.id !== entry.id
        && q.status === "in_consultation"
        && q.doctor_id === entry.doctor_id
        && q.queue_date === entry.queue_date)
      .sort((a, b) => a.token_no - b.token_no)[0] ?? null
  );
}

export function describeConsultation(q: QueueEntry): CurrentConsultation {
  return { queueEntryId: q.id, patientName: q.patient_name, tokenNo: q.token_no };
}

/**
 * The board as it stands once a visit is signed: the API completes the token
 * in the same transaction, and returns the encounter linked to it (even when
 * the form was opened without one). Writing that into the cached board means
 * "With you now" and the queue drop the patient at once, not on the refetch.
 */
export function closeSignedToken<Q extends readonly QueueEntry[] | undefined>(
  queue: Q,
  encounter: { queue_entry_id: string | null; status: string },
): Q {
  if (!queue || encounter.status !== "signed" || !encounter.queue_entry_id) return queue;
  const id = encounter.queue_entry_id;
  return queue.map((q) =>
    q.id === id && q.status !== "completed" ? { ...q, status: "completed" as const } : q,
  ) as unknown as Q;
}

/** The API's "this clinician is still with someone" refusal, if that is what this is. */
export function doctorBusyFromError(error: unknown): (CurrentConsultation & { message: string }) | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { status?: unknown; message?: unknown; details?: Record<string, unknown> };
  if (e.status !== 409 || e.details?.reason !== "doctor_busy") return null;
  return {
    message: typeof e.message === "string" ? e.message : "",
    queueEntryId: String(e.details.queue_entry_id ?? ""),
    patientName: String(e.details.patient_name ?? ""),
    tokenNo: Number(e.details.token_no ?? 0),
  };
}
