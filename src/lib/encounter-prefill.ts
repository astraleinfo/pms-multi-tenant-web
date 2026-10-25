/**
 * What a new encounter starts with when it is opened from a queue entry: the
 * patient waiting, the doctor they were booked with, and the reason they gave
 * at the desk as the chief complaint.
 *
 * The queue arrives asynchronously, so the form may mount before the entry is
 * known. `seedFromQueue` is therefore applied whenever the entry first appears,
 * and only fills what the clinician has not already filled in.
 */
export type QueuePrefillSource = { patient_id: string; doctor_id?: string | null; reason?: string | null };

export type EncounterSeed = { patient: string | null; doctor: string | null; complaint: string };

export function seedFromQueue(entry: QueuePrefillSource | null | undefined): EncounterSeed | null {
  if (!entry) return null;
  return {
    patient: entry.patient_id || null,
    doctor: entry.doctor_id || null,
    complaint: (entry.reason ?? "").trim(),
  };
}

/** Merge a late seed into the current form values without overwriting edits. */
export function applySeed(
  current: { patient: string | null; doctor: string; complaint: string },
  seed: EncounterSeed | null,
): { patient: string | null; doctor: string; complaint: string } {
  if (!seed) return current;
  return {
    patient: current.patient ?? seed.patient,
    doctor: seed.doctor ?? current.doctor,
    complaint: current.complaint.trim() ? current.complaint : seed.complaint,
  };
}
