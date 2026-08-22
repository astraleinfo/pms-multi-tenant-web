"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, usePatient } from "@/lib/query/hooks";
import {
  findEncounter, selectInventoryItems, selectLabOrders, selectPrescriptions,
} from "@/lib/data/repository";
import { currency } from "@/lib/format";
import type { InvoiceLineItem } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { PatientPicker } from "./patient";
import { Legend } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconPlus, IconReceipt, IconTrash } from "@/components/ui/icons";

type Draft = Omit<InvoiceLineItem, "id"> & { key: string; suggested?: boolean };

let seq = 0;
const row = (d: Omit<InvoiceLineItem, "id">, suggested = false): Draft =>
  ({ ...d, key: `li-${++seq}`, suggested });

const SOURCE_LABEL: Record<InvoiceLineItem["source"], string> = {
  consultation: "Consultation", procedure: "Procedure", pharmacy: "Pharmacy", lab: "Lab", manual: "Manual",
};

/**
 * §3.12 — an invoice is composed from the visit. Suggestions come from the
 * encounter, its lab orders and anything dispensed against its prescriptions;
 * everything is editable and lines can be added by hand.
 */
export function InvoiceComposer({
  open, onClose, patientId, encounterId,
}: {
  open: boolean;
  onClose: () => void;
  /** null lets the composer ask which patient the invoice is for */
  patientId: string | null;
  encounterId: string | null;
}) {
  const router = useRouter();
  const { session, config, createInvoice, notify } = useApp();
  const db = useClinicDb();
  const t = session.tenantId;

  const suggestions = React.useMemo<Draft[]>(() => {
    const out: Draft[] = [];
    const encounter = encounterId ? findEncounter(db, t, encounterId) : null;

    const tax = config.tax_pct;
    out.push(row({ description: "Consultation", source: "consultation", qty: 1, unit_price: 500, tax_pct: tax }, true));

    if (encounter) {
      const procedures = (encounter.clinical_ext.procedures as string[] | undefined) ?? [];
      for (const p of procedures) {
        out.push(row({ description: p, source: "procedure", qty: 1, unit_price: 2500, tax_pct: tax }, true));
      }
      for (const l of selectLabOrders(db, t).filter((x) => x.encounter_id === encounterId)) {
        out.push(row({ description: l.test_name, source: "lab", qty: 1, unit_price: 300, tax_pct: tax }, true));
      }
      const items = selectInventoryItems(db, t);
      for (const rx of selectPrescriptions(db, t).filter((x) => x.encounter_id === encounterId)) {
        for (const it of rx.items.filter((x) => x.dispensed_qty > 0)) {
          const stock = items.find((s) => s.id === it.item_id);
          out.push(row({
            description: `${it.medicine} ${it.strength} × ${it.dispensed_qty}`,
            source: "pharmacy", qty: it.dispensed_qty,
            unit_price: Math.round((stock?.unit_price ?? 0.4) * 1.6 * 100) / 100, tax_pct: tax,
          }, true));
        }
      }
    }
    return out;
  }, [db, t, encounterId, config.tax_pct]);

  const [lines, setLines] = React.useState<Draft[]>(suggestions);
  const [issue, setIssue] = React.useState(true);
  const [chosen, setChosen] = React.useState<string | null>(patientId);
  React.useEffect(() => {
    if (open) { setLines(suggestions); setIssue(true); setChosen(patientId); }
  }, [open, suggestions, patientId]);

  const patch = (key: string, p: Partial<Draft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const tax = lines.reduce((s, l) => s + (l.qty * l.unit_price * l.tax_pct) / 100, 0);
  const { data: patient } = usePatient(chosen ?? "");

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Compose invoice"
      subtitle={patient ? `${patient.full_name} · ${patient.mrn}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!chosen) {
                notify({ tone: "warn", title: "Choose a patient first" });
                return;
              }
              if (!lines.length) {
                notify({ tone: "warn", title: "Add at least one line" });
                return;
              }
              const id = await createInvoice({
                patient_id: chosen,
                encounter_id: encounterId,
                line_items: lines.map(({ key, suggested, ...rest }) => rest),
                issue,
              });
              notify({ tone: "ok", title: issue ? "Invoice issued" : "Draft invoice saved", body: currency(subtotal + tax) });
              onClose();
              router.push(`/billing/${id}`);
            }}
          >
            <IconReceipt size={15} /> {issue ? "Issue invoice" : "Save draft"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {patientId === null && (
          <Field label="Patient" required>
            <PatientPicker value={chosen} onChange={setChosen} />
          </Field>
        )}

        <Legend>Line items</Legend>

        {lines.length === 0 && (
          <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-6 text-center text-[0.8125rem] text-ink-3">
            No lines yet — add one below.
          </p>
        )}

        {lines.map((l) => (
          <div key={l.key} className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              {l.suggested
                ? <Badge tone="accent" size="sm">Suggested from the visit</Badge>
                : <Badge tone="neutral" size="sm">Added by hand</Badge>}
              <Button variant="ghost" size="icon-sm" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                      aria-label="Remove line">
                <IconTrash size={14} />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_6rem]">
              <Field label="Description">
                <Input value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} />
              </Field>
              <Field label="Source">
                <Select value={l.source} onChange={(e) => patch(l.key, { source: e.target.value as InvoiceLineItem["source"] })}>
                  {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Qty">
                <Input type="number" min={1} value={l.qty}
                       onChange={(e) => patch(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Unit price">
                <Input type="number" min={0} step="0.01" value={l.unit_price}
                       onChange={(e) => patch(l.key, { unit_price: Number(e.target.value) || 0 })} />
              </Field>
            </div>
          </div>
        ))}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setLines((p) => [...p, row({ description: "", source: "manual", qty: 1, unit_price: 0, tax_pct: 0 })])}
        >
          <IconPlus size={14} /> Add line
        </Button>

        <div className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
          <dl className="space-y-1.5">
            <div className="flex justify-between text-[0.8125rem]">
              <dt className="text-ink-2">Subtotal</dt>
              <dd className="tnum font-mono text-ink">{currency(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-[0.8125rem]">
              <dt className="text-ink-2">Tax</dt>
              <dd className="tnum font-mono text-ink">{currency(tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 text-[0.9375rem] font-semibold">
              <dt className="text-ink">Total</dt>
              <dd className="tnum font-mono text-ink">{currency(subtotal + tax)}</dd>
            </div>
          </dl>
        </div>

        <Checkbox
          checked={issue}
          onChange={setIssue}
          label="Issue immediately"
          description="Leave off to keep it as a draft that can still be edited before it goes out."
        />
      </div>
    </Modal>
  );
}
