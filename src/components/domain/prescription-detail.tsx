"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { useDoctors, usePatient, usePrescription, useUsers } from "@/lib/query/hooks";
import { currency, formatDate } from "@/lib/format";
import { anyPriced, awaitsCounter, dispensedTotal, lineTotal } from "@/lib/prescription-pricing";
import { openPdfBlob } from "@/lib/pdf";
import { encounterHref, pharmacyCounterHref } from "@/lib/routes";
import type { Prescription } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV, Meter } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/loader";
import { StatusPill } from "@/components/domain/status";
import { AllergyFlag, PatientRef } from "@/components/domain/patient";
import { IconArrowRight, IconPrint, IconRx } from "@/components/ui/icons";

/** One prescription, opened from the list — on the row it was opened from,
    then as the server has it. */
export function PrescriptionDetailModal({ prescription: opened, onClose }: {
  prescription: Prescription | null;
  onClose: () => void;
}) {
  const { notify } = useApp();
  const { data: users = [] } = useUsers();
  const { data: doctors = [] } = useDoctors();
  const { data: fresh, isPending } = usePrescription(opened?.id ?? "");
  const rx = fresh ?? opened;
  /* allergies are the patient's, which a prescription row does not carry */
  const { data: patient } = usePatient(rx?.patient_id ?? "");
  const [printing, setPrinting] = React.useState(false);

  const print = async (encounterId: string) => {
    setPrinting(true);
    try {
      openPdfBlob(await api.getConsultationPdf(encounterId));
    } catch {
      notify({ tone: "warn", title: "Could not generate the print PDF" });
    } finally {
      setPrinting(false);
    }
  };

  /* The row carries the name; the lists only cover rows from before that, and
     neither holds a support account that recorded the visit. */
  const prescriber = rx
    ? rx.doctor_name || (doctors.find((u) => u.id === rx.doctor_id) ?? users.find((u) => u.id === rx.doctor_id))?.name || "—"
    : "";

  return (
    <Modal
      open={!!opened}
      onClose={onClose}
      width="lg"
      title={rx?.patient_name ?? "Prescription"}
      subtitle={rx ? `${formatDate(rx.created_at.slice(0, 10), "long")} · ${prescriber}` : undefined}
      footer={
        rx && (
          <>
            <Button variant="ghost" onClick={() => void print(rx.encounter_id)} disabled={printing}>
              <IconPrint size={14} /> {printing ? "Preparing…" : "Print"}
            </Button>
            {awaitsCounter(rx.status) && (
              <ButtonLink href={pharmacyCounterHref(rx.id)} variant="primary">
                Dispense at the counter <IconArrowRight size={14} />
              </ButtonLink>
            )}
          </>
        )
      }
    >
      {!rx && isPending ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !rx ? (
        <EmptyState icon={<IconRx size={22} />} title="No such prescription"
                    body="This prescription doesn’t exist, or it has been removed." />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PatientRef id={rx.patient_id} name={rx.patient_name} mrn={rx.patient_mrn} />
            <div className="flex flex-wrap items-center gap-2">
              {patient && <AllergyFlag patient={patient} />}
              <StatusPill kind="prescription" status={rx.status} />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6">
            <KV label="Prescriber" value={prescriber} />
            <KV label="Encounter" value={
              <ButtonLink href={encounterHref(rx.encounter_id)} variant="ghost" size="sm" className="h-6 px-1.5">
                View consultation <IconArrowRight size={13} />
              </ButtonLink>
            } />
          </dl>

          <div>
            <p className="mb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Medicines</p>
            <ul className="space-y-2.5">
              {rx.items.map((it) => (
                <li key={it.id} className="rounded-[var(--r)] border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body font-medium text-ink">
                      {it.medicine} <span className="text-label font-normal text-ink-3">{it.strength}</span>
                    </p>
                    <StatusPill kind="prescription" status={it.status} size="sm" dot={false} />
                  </div>
                  <p className="mt-1 text-label text-ink-2">
                    {it.dosage} · {it.frequency} · {it.duration}
                  </p>
                  {it.instructions && (
                    <p className="mt-1 text-caption italic text-ink-3">{it.instructions}</p>
                  )}
                  {it.dispense === false ? (
                    <p className="mt-2.5 text-caption text-ink-3">
                      Quantity {it.qty} · for the patient to buy elsewhere, so nothing is dispensed or billed here.
                    </p>
                  ) : (
                    <>
                      <div className="mt-2.5 flex items-center gap-3">
                        <Meter value={it.dispensed_qty} max={it.qty}
                               tone={it.dispensed_qty >= it.qty ? "ok" : it.dispensed_qty > 0 ? "info" : "warn"} className="flex-1" />
                        <span className="tnum shrink-0 font-mono text-caption text-ink-2">
                          {it.dispensed_qty} of {it.qty}
                        </span>
                      </div>
                      {it.unit_price != null && (
                        <p className="tnum mt-1.5 font-mono text-caption text-ink-2">
                          {it.qty} × {currency(it.unit_price)} = {currency(lineTotal(it) ?? 0)}
                        </p>
                      )}
                      {!it.item_id && (
                        <Badge tone="neutral" size="sm" className="mt-2">Not linked to stock</Badge>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {anyPriced(rx.items) && (
              <p className="mt-3 flex items-baseline justify-between border-t border-line-soft pt-2.5 text-label text-ink-2">
                <span>Dispensed from the clinic</span>
                <span className="tnum font-mono font-medium text-ink">{currency(dispensedTotal(rx.items))}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
