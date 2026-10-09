"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useAppointment, useClinicDb } from "@/lib/query/hooks";
import { userName } from "@/lib/data/repository";
import { daysBetween, formatDate, formatTime12, relativeDay } from "@/lib/format";
import { isBooked, type Appointment } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/loader";
import { StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { IconArrowRight, IconCalendar, IconCheck, IconClock, IconX } from "@/components/ui/icons";

/**
 * One booking, opened from the diary. It opens on the row it was opened from,
 * so it is whole from the first frame, and reads the booking by id behind that
 * — what it settles on is the booking as it is now.
 */
export function AppointmentDetailModal({ appointment: opened, onClose }: {
  appointment: Appointment | null;
  onClose: () => void;
}) {
  const { today, setAppointmentStatus, checkIn, notify } = useApp();
  const db = useClinicDb();
  const { data: fresh, isPending } = useAppointment(opened?.id ?? "");
  const appointment = fresh ?? opened;

  const act = (a: Appointment, status: Appointment["status"], msg: string) => {
    setAppointmentStatus(a.id, status);
    notify({ tone: status === "no_show" ? "warn" : "ok", title: msg, body: `${formatDate(a.date)} · ${formatTime12(a.time)}` });
    onClose();
  };

  return (
    <Modal
      open={!!opened}
      onClose={onClose}
      width="lg"
      title={appointment?.patient_name ?? "Appointment"}
      subtitle={appointment ? `${formatDate(appointment.date, "day")} at ${formatTime12(appointment.time)}` : undefined}
      footer={
        appointment && (
          isBooked(appointment.status) ? (
            <>
              <Button variant="ghost" onClick={() => act(appointment, "cancelled", "Appointment cancelled")}>
                <IconX size={14} /> Cancel
              </Button>
              <Button variant="secondary" onClick={() => act(appointment, "no_show", "Marked as no show")}>
                No show
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  checkIn(appointment.id);
                  notify({ tone: "ok", title: "Checked in", body: "Token issued and pushed to the waiting-room board." });
                  onClose();
                }}
              >
                <IconCheck size={14} /> Check in
              </Button>
            </>
          ) : (
            <ButtonLink href={`/patients/${appointment.patient_id}`} variant="secondary">
              Open patient record <IconArrowRight size={14} />
            </ButtonLink>
          )
        )
      }
    >
      {!appointment && isPending ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !appointment ? (
        <EmptyState icon={<IconCalendar size={22} />} title="No such appointment"
                    body="This booking doesn’t exist, or it has been removed." />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PatientRef id={appointment.patient_id} name={appointment.patient_name} mrn={appointment.patient_mrn} />
            <div className="flex items-center gap-2">
              <StatusPill kind="appointment" status={appointment.status} />
              <Badge tone="neutral" size="sm">{appointment.duration_min} minutes</Badge>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <KV label="Clinician" value={userName(db, appointment.doctor_id)} />
            <KV label="Booked via" value={appointment.created_via.replace("_", " ")} />
            <KV label="Date" value={formatDate(appointment.date, "long")} />
            <KV label="Time" value={formatTime12(appointment.time)} mono />
          </dl>

          <div>
            <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Reason</p>
            <p className="mt-1 text-body leading-relaxed text-ink">{appointment.reason}</p>
          </div>

          {appointment.date === today && isBooked(appointment.status) && (
            <p className="flex items-start gap-2 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-caption leading-relaxed text-ink-2">
              <IconClock size={14} className="mt-px shrink-0 text-ink-3" />
              Checking in issues the next token in today&apos;s sequence and pushes the board update — the
              appointment row stays where it is and only changes status.
            </p>
          )}
          {daysBetween(today, appointment.date) > 0 && (
            <p className="text-caption text-ink-3">
              This booking is {relativeDay(appointment.date).toLowerCase()} — check-in opens on the day.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
