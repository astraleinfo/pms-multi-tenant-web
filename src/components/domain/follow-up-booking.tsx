"use client";

import * as React from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb } from "@/lib/query/hooks";
import { selectAppointments, selectEncounters } from "@/lib/data/repository";
import { formatDate, formatTime12 } from "@/lib/format";
import {
  FOLLOW_UP_REASON, followUpLabel, followUpPrefill, followUpState, type FollowUpState,
} from "@/lib/follow-up-booking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { AppointmentModal } from "./quick-actions";
import { IconCalendar } from "@/components/ui/icons";

/** Where a visit's follow-up stands, read off the clinic's diary and encounters. */
export function useFollowUpState(patientId: string | null, encounterDate: string, days: number | null | undefined) {
  const { session, today } = useApp();
  const db = useClinicDb();
  const t = session.tenantId;
  return followUpState({
    patientId, encounterDate, days, today,
    appointments: selectAppointments(db, t),
    encounters: selectEncounters(db, t),
  });
}

/**
 * "Book follow-up" for one visit: the clinic's own booking dialog, opened on
 * the patient, the clinician, the due date and the reason. Once a booking
 * exists it says so instead, so a screen showing the instruction never nags
 * about a follow-up that is already on the call list.
 *
 * - `row` — the button, or what has been done, on one line
 * - `hint` — a sentence under the form's follow-up field, with the button
 * - `offer` — a standing callout, for the moment just after signing
 */
export function FollowUpBooking({
  patientId, doctorId, encounterDate, days, layout = "row", onDismiss,
}: {
  patientId: string | null;
  doctorId: string;
  encounterDate: string;
  days: number | null | undefined;
  layout?: "row" | "hint" | "offer";
  /** `offer` only: "Later" */
  onDismiss?: () => void;
}) {
  const { today, can } = useApp();
  /* a role that cannot book is told where it stands, not offered a button the server refuses */
  const mayBook = can("appointment:write");
  const read = useFollowUpState(patientId, encounterDate, days);
  /* The diary is re-read after a booking; until it lands, believe the dialog. */
  const [justBooked, setJustBooked] = React.useState<{ patient: string | null; date: string; time: string } | null>(null);
  /* only for the patient it was booked for — the form's patient can still change */
  const state: FollowUpState = read.kind === "open" && justBooked && justBooked.patient === patientId
    ? { kind: "booked", date: justBooked.date, time: justBooked.time }
    : read;
  const [booking, setBooking] = React.useState(false);

  const prefill = followUpPrefill({ patientId, doctorId, encounterDate, days, today });
  if (state.kind === "none" || !prefill) return null;

  const dialog = (
    <AppointmentModal
      open={booking}
      onClose={() => setBooking(false)}
      title="Book the follow-up"
      defaultPatient={prefill.patient}
      defaultDoctor={prefill.doctor}
      defaultDate={prefill.date}
      defaultReason={FOLLOW_UP_REASON}
      onBooked={({ date, time }) => setJustBooked({ patient: patientId, date, time })}
    />
  );

  const bookButton = (
    <Button
      variant={layout === "offer" ? "primary" : "secondary"} size="sm"
      onClick={() => setBooking(true)} disabled={!patientId}
    >
      <IconCalendar size={14} /> Book follow-up
    </Button>
  );

  if (layout === "offer") {
    if (state.kind !== "open" || !mayBook) return null;
    return (
      <>
        <Callout
          tone="accent" icon={<IconCalendar size={16} />} title="Book the follow-up now" className="mb-4"
          action={
            <span className="flex items-center gap-1.5">
              {bookButton}
              {onDismiss && <Button variant="ghost" size="sm" onClick={onDismiss}>Later</Button>}
            </span>
          }
        >
          Review due {formatDate(state.due, "long")}. It appears in Follow-ups once it is booked.
        </Callout>
        {dialog}
      </>
    );
  }

  if (layout === "hint") {
    return (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption text-ink-2">
        {state.kind === "open" ? (
          <span>
            {patientId ? "Not booked yet — it will appear in Follow-ups once booked." : "Choose a patient to book the follow-up."}
          </span>
        ) : state.kind === "booked" ? (
          <span className="text-ok-text">
            Booked for {formatDate(state.date, "long")} at {formatTime12(state.time)} — on the{" "}
            <Link href="/follow-ups" className="underline underline-offset-2">Follow-ups</Link> list.
          </span>
        ) : (
          <span>Seen again {formatDate(state.date, "long")}.</span>
        )}
        {state.kind === "open" && mayBook && bookButton}
        {dialog}
      </div>
    );
  }

  return (
    <>
      {state.kind === "open" ? (
        mayBook ? bookButton : <Badge tone="warn" size="sm">Not booked</Badge>
      ) : (
        <Badge tone={state.kind === "booked" ? "ok" : "neutral"} size="sm">{followUpLabel(state)}</Badge>
      )}
      {dialog}
    </>
  );
}
