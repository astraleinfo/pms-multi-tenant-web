"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconArrowRight } from "@/components/ui/icons";
import type { CurrentConsultation } from "@/lib/queue-rules";

/**
 * "Finish the one in the room first." Shown when a consultation is started —
 * or about to be — while the same clinician still has another open. Nothing
 * is started; the way forward is the consultation already in progress.
 */
export function DoctorBusyModal({
  current, doctorName, message, onClose,
}: {
  current: CurrentConsultation | null;
  doctorName?: string;
  /** the API's own wording, when this came back as a refusal */
  message?: string;
  onClose: () => void;
}) {
  const token = current ? String(current.tokenNo).padStart(2, "0") : "";
  const who = doctorName || "This clinician";
  return (
    <Modal
      open={!!current}
      onClose={onClose}
      title="Finish the current consultation first"
      width="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {current?.queueEntryId && (
            <ButtonLink variant="primary" href={`/consultations/new?queue=${current.queueEntryId}`} onClick={onClose}>
              Go to current consultation <IconArrowRight size={13} />
            </ButtonLink>
          )}
        </div>
      }
    >
      <p className="text-body text-ink-2">
        {message || `${who} is still consulting ${current?.patientName ?? "another patient"} (token ${token}).`}
      </p>
      <p className="mt-2 text-body text-ink-3">
        A clinician sees one patient at a time. Complete that consultation before starting the next.
      </p>
    </Modal>
  );
}
