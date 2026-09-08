"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { usePatient, useServicePrices, useSuggestedLines } from "@/lib/query/hooks";
import { currency } from "@/lib/format";
import type {
  BillingDepartment, InvoiceLineItem, LineItemSource, ServiceKind, ServicePrice,
} from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  Checkbox, Combobox, Field, Input, NumberInput, Select, type ComboOption,
} from "@/components/ui/field";
import { PatientPicker } from "./patient";
import { Legend } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconAlert, IconPlus, IconReceipt, IconTrash } from "@/components/ui/icons";
import { DEPARTMENT_LABEL } from "@/components/domain/status";

type Draft = Omit<InvoiceLineItem, "id"> & {
  key: string;
  suggested?: boolean;
  /** the tariff had nothing for this line, so its price is a question */
  unpriced?: boolean;
};

let seq = 0;
const row = (
  d: Omit<InvoiceLineItem, "id">,
  extra: { suggested?: boolean; unpriced?: boolean } = {},
): Draft => ({ ...d, key: `li-${++seq}`, ...extra });

const SOURCE_LABEL: Record<LineItemSource, string> = {
  consultation: "Consultation", procedure: "Procedure", pharmacy: "Pharmacy", lab: "Lab", manual: "Manual",
};

/** What a tariff row becomes when it is added as a line. */
const SOURCE_OF_KIND: Record<ServiceKind, LineItemSource> = {
  consultation: "consultation", procedure: "procedure", lab: "lab", other: "manual",
};

/** Which counter a line belongs to — the same mapping the server uses. */
const DEPARTMENT_OF: Record<LineItemSource, BillingDepartment> = {
  consultation: "clinic", procedure: "clinic", manual: "clinic", lab: "lab", pharmacy: "pharmacy",
};

/**
 * §3.12 — an invoice is composed from the visit.
 *
 * The suggestions come from the server, priced from the clinic's own tariff:
 * the consultation, each scan by its code, and anything dispensed at its stock
 * price. Everything is editable and lines can be added by hand.
 *
 * The lab and the pharmacy bill separately, so a visit that touched both can
 * be raised as one invoice per counter — each one owned by the desk that will
 * chase it.
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
  const { config, createInvoice, notify } = useApp();

  const { data: suggested, isPending: suggestionsPending } = useSuggestedLines(
    open ? encounterId : null,
  );
  /* The tariff, for the picker below and for the one line a walk-in starts
     with. Prices are the practice admin's decision; this only quotes them. */
  const { data: tariff } = useServicePrices({ active: true });

  const suggestions = React.useMemo<Draft[]>(() => {
    if (!encounterId) {
      /* No visit to bill from — a walk-in at the desk. It still starts with the
         consultation the clinic charges for, rather than a blank sheet or a
         figure invented here. */
      const consultation = tariff.find((p) => p.kind === "consultation");
      return [
        row(
          {
            description: consultation?.name ?? "Consultation",
            source: "consultation",
            qty: 1,
            unit_price: consultation?.price ?? 0,
            tax_pct: consultation?.tax_pct ?? config.tax_pct,
          },
          { suggested: true, unpriced: !consultation },
        ),
      ];
    }
    /* `suggested` is expected to be `{ lines, already_billed }` (the shape the
       server now returns). If it is somehow still a bare array — the old
       shape, e.g. from a mismatched deploy — `suggested?.lines` would quietly
       resolve to nothing and seed zero lines with no sign anything is wrong.
       Treat that as an error rather than silently proceeding as if the visit
       has nothing to bill. */
    if (Array.isArray(suggested)) {
      notify({ tone: "critical", title: "Could not read suggested invoice lines" });
      return [];
    }
    return (suggested?.lines ?? []).map((line) =>
      row(
        {
          description: line.description,
          source: line.source,
          qty: line.qty,
          unit_price: line.unit_price,
          tax_pct: line.tax_pct,
        },
        { suggested: true, unpriced: !line.priced },
      ),
    );
  }, [suggested, encounterId, tariff, config.tax_pct, notify]);

  /* Items already invoiced (and possibly paid) through the pharmacy counter
     or a department account — offered separately so they aren't silently
     billed twice. */
  const alreadyBilled = suggested?.already_billed ?? [];

  const [lines, setLines] = React.useState<Draft[]>([]);
  const [issue, setIssue] = React.useState(true);
  const [split, setSplit] = React.useState(true);
  const [department, setDepartment] = React.useState<BillingDepartment>("clinic");
  const [chosen, setChosen] = React.useState<string | null>(patientId);
  const [saving, setSaving] = React.useState(false);

  /* Seeded once per opening. The suggestions arrive after the dialogue does,
     so they fill it when they land — but a later refetch must not wipe out
     lines somebody has since edited. */
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (open) {
      setIssue(true); setSplit(true); setChosen(patientId); setSaving(false);
      seeded.current = false;
    }
  }, [open, patientId]);

  React.useEffect(() => {
    if (!open || seeded.current) return;
    /* Nothing to seed from yet: a visit whose suggestions are still in flight. */
    if (encounterId && suggestionsPending) return;
    setLines(suggestions);
    seeded.current = true;
  }, [open, suggestions, suggestionsPending, encounterId]);

  const patch = (key: string, p: Partial<Draft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const tax = lines.reduce((s, l) => s + (l.qty * l.unit_price * l.tax_pct) / 100, 0);
  const { data: patient } = usePatient(chosen ?? "");

  /** The lines this composer holds, grouped by the counter that owns them. */
  const byDepartment = React.useMemo(() => {
    const groups = new Map<BillingDepartment, Draft[]>();
    for (const line of lines) {
      const key = DEPARTMENT_OF[line.source];
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    return groups;
  }, [lines]);

  const tariffOptions = React.useMemo<ComboOption[]>(
    () => tariff.map((p: ServicePrice) => ({
      value: p.id,
      label: p.name,
      hint: currency(p.price),
      keywords: `${p.code} ${p.kind} ${p.note ?? ""}`,
    })),
    [tariff],
  );

  const spansCounters = byDepartment.size > 1;
  const unpriced = lines.filter((l) => l.unpriced || l.unit_price <= 0).length;

  const submit = async () => {
    if (!chosen) {
      notify({ tone: "warn", title: "Choose a patient first" });
      return;
    }
    if (!lines.length) {
      notify({ tone: "warn", title: "Add at least one line" });
      return;
    }

    /* Either one invoice per counter, or one invoice carrying the department
       that was chosen for it. */
    const batches: Array<{ department: BillingDepartment; lines: Draft[] }> =
      split && spansCounters
        ? [...byDepartment.entries()].map(([dept, group]) => ({ department: dept, lines: group }))
        : [{ department: spansCounters ? department : ([...byDepartment.keys()][0] ?? "clinic"), lines }];

    setSaving(true);
    try {
      const ids: string[] = [];
      for (const batch of batches) {
        const id = await createInvoice({
          patient_id: chosen,
          encounter_id: encounterId,
          department: batch.department,
          line_items: batch.lines.map(({ key, suggested: _s, unpriced: _u, ...rest }) => rest),
          issue,
        });
        ids.push(id);
      }
      notify({
        tone: "ok",
        title: batches.length > 1
          ? `${batches.length} invoices ${issue ? "issued" : "saved as drafts"}`
          : issue ? "Invoice issued" : "Draft invoice saved",
        body: batches.length > 1
          ? batches.map((b) => DEPARTMENT_LABEL[b.department]).join(", ")
          : currency(subtotal + tax),
      });
      onClose();
      router.push(`/billing/${ids[0]}`);
    } finally {
      setSaving(false);
    }
  };

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
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            <IconReceipt size={15} />
            {split && spansCounters
              ? `${issue ? "Issue" : "Save"} ${byDepartment.size} invoices`
              : issue ? "Issue invoice" : "Save draft"}
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

        {encounterId && suggestionsPending && (
          <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-6 text-center text-[0.8125rem] text-ink-3">
            Working out what this visit bills for…
          </p>
        )}

        {lines.length === 0 && !suggestionsPending && (
          <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-6 text-center text-[0.8125rem] text-ink-3">
            No lines yet — add one below.
          </p>
        )}

        {unpriced > 0 && (
          <p className="flex items-start gap-2 rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2.5 text-[0.8125rem] leading-relaxed text-warn-text">
            <IconAlert size={14} className="mt-px shrink-0" />
            {unpriced === 1 ? "One line has" : `${unpriced} lines have`} no price in the tariff yet, so
            {unpriced === 1 ? " it is" : " they are"} suggested at zero. Type a figure here, or set one for
            good under Pricing.
          </p>
        )}

        {lines.map((l) => (
          <div key={l.key} className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {l.suggested
                  ? <Badge tone="accent" size="sm">Suggested from the visit</Badge>
                  : <Badge tone="neutral" size="sm">Added by hand</Badge>}
                <Badge tone="neutral" size="sm" dot={false}>{DEPARTMENT_LABEL[DEPARTMENT_OF[l.source]]}</Badge>
                {(l.unpriced || l.unit_price <= 0)
                  && <Badge tone="warn" size="sm" dot={false}>No price set</Badge>}
              </div>
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
                <Select value={l.source} onChange={(e) => patch(l.key, { source: e.target.value as LineItemSource })}>
                  {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Qty">
                <NumberInput min={1} value={l.qty}
                             onChange={(n) => patch(l.key, { qty: n })} />
              </Field>
              <Field label="Unit price">
                <NumberInput min={0} step="0.01" value={l.unit_price}
                             onChange={(n) => patch(l.key, { unit_price: n, unpriced: false })} />
              </Field>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label="Add from the tariff" htmlFor="composer-tariff">
            <Combobox
              id="composer-tariff"
              value=""
              onChange={(id) => {
                const priced = tariff.find((p) => p.id === id);
                if (!priced) return;
                setLines((p) => [
                  ...p,
                  row({
                    description: priced.name,
                    source: SOURCE_OF_KIND[priced.kind],
                    qty: 1,
                    unit_price: priced.price,
                    tax_pct: priced.tax_pct,
                  }),
                ]);
              }}
              options={tariffOptions}
              placeholder="Type a procedure, a scan or a service"
              emptyText="Nothing in the tariff matches. Prices are set under Pricing."
            />
          </Field>
          <Field label={<span className="sr-only">Add a blank line</span>} className="sm:self-end">
            <Button
              variant="secondary"
              onClick={() => setLines((p) => [
                ...p,
                row({ description: "", source: "manual", qty: 1, unit_price: 0, tax_pct: config.tax_pct }),
              ])}
            >
              <IconPlus size={14} /> Blank line
            </Button>
          </Field>
        </div>

        {alreadyBilled.length > 0 && (
          <details className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <summary className="cursor-pointer text-[0.8125rem] font-medium text-ink-2">
              Already billed ({alreadyBilled.length})
            </summary>
            <ul className="mt-2.5 space-y-2">
              {alreadyBilled.map((b, i) => {
                const invoice = b.invoices[0];
                return (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-line-soft bg-surface px-3 py-2 text-[0.8125rem]">
                    <div>
                      <p className="text-ink">{b.description} × {b.qty}</p>
                      <p className="text-ink-3">
                        Invoice {invoice?.invoice_number}
                        {invoice?.invoice_status === "paid" && " · already paid"}
                        {invoice?.invoice_status === "partially_paid" && " · part paid"}
                        {invoice?.invoice_status === "issued" && " · issued, not yet paid"}
                        {/* A pharmacy item can be split across more than one counter
                            invoice (partial billing) — say so rather than showing
                            only the first invoice and hiding the rest. */}
                        {b.invoices.length > 1 && ` (+${b.invoices.length - 1} more)`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLines((prev) => [
                        ...prev,
                        row({ description: b.description, source: b.source, qty: b.qty, unit_price: b.unit_price, tax_pct: b.tax_pct }),
                      ])}
                    >
                      Add anyway
                    </Button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

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

        {/* Which counter gets it. Only a question when the lines span more
            than one — otherwise the answer is obvious and the server works it
            out from the lines anyway. */}
        {spansCounters ? (
          <div className="space-y-3 rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <Checkbox
              checked={split}
              onChange={setSplit}
              label="Bill each counter separately"
              description={`One invoice per counter — ${[...byDepartment.entries()]
                .map(([d, group]) => `${DEPARTMENT_LABEL[d]} (${group.length})`)
                .join(", ")}. The lab and the pharmacy chase their own money.`}
            />
            {!split && (
              <Field label="Raise the whole thing under" htmlFor="composer-department">
                <Select
                  id="composer-department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value as BillingDepartment)}
                >
                  {(Object.keys(DEPARTMENT_LABEL) as BillingDepartment[]).map((d) => (
                    <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        ) : (
          lines.length > 0 && (
            <p className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.75rem] text-ink-2">
              This goes to the {DEPARTMENT_LABEL[[...byDepartment.keys()][0] ?? "clinic"].toLowerCase()} counter.
            </p>
          )
        )}

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
