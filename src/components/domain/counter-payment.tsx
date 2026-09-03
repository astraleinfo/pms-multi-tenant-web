"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { usePatientAccount } from "@/lib/query/hooks";
import { currency } from "@/lib/format";
import type { BillingDepartment, Charge, DepartmentAccount, Id, Payment } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, NumberInput, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { IconAlert, IconCard, IconCheck, IconReceipt } from "@/components/ui/icons";
import { DEPARTMENT_LABEL } from "@/components/domain/status";

/** Reading order at the desk: the visit, then what was done for it. */
const ORDER: BillingDepartment[] = ["clinic", "lab", "pharmacy"];

const METHODS: Array<{ value: Payment["method"]; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "Bank transfer / UPI" },
  { value: "insurance", label: "Insurance" },
];

/**
 * Taking money at one counter (§3.12).
 *
 * Two steps that look like one to whoever is standing there: what has not been
 * invoiced yet goes onto an invoice for that counter, then the amount handed
 * over is applied to it. Both are the server's arithmetic — the lines carry
 * what they bill for, so nothing can be charged twice however many times this
 * is opened.
 *
 * Paying is optional. "Add to the bill" issues the invoice and leaves it owing,
 * which is exactly what a patient who will pay on the way out needs.
 */
export function CounterPayment({
  open, onClose, patientId, department, onSettled,
}: {
  open: boolean;
  onClose: () => void;
  patientId: Id | null;
  department: BillingDepartment;
  /** told what happened, so a caller can close a drawer behind it */
  onSettled?: () => void;
}) {
  const { raiseCounterInvoice, takeCounterPayment, notify } = useApp();
  const { data: account, isPending } = usePatientAccount(open ? patientId : null);

  const entry = account?.departments?.[department];
  const due = entry?.due ?? 0;

  const [amount, setAmount] = React.useState(0);
  const [method, setMethod] = React.useState<Payment["method"]>("cash");
  const [reference, setReference] = React.useState("");
  const [collect, setCollect] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  /* The amount follows what is owed until somebody types over it. */
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (!open) { setTouched(false); setCollect(true); setReference(""); setBusy(false); return; }
    if (!touched) setAmount(due);
  }, [open, due, touched]);

  const settle = async () => {
    if (!patientId || !entry) return;
    setBusy(true);
    try {
      /* Anything not yet on an invoice goes on one first — a payment lands
         against invoices, so there has to be one to land against. */
      if (entry.unbilled.length > 0) {
        await raiseCounterInvoice(patientId, { department, issue: true });
      }
      if (taking) {
        const result = await takeCounterPayment(patientId, {
          department,
          amount,
          method,
          reference: reference.trim() || undefined,
        });
        notify({
          tone: "ok",
          title: `${currency(amount)} taken at the ${DEPARTMENT_LABEL[department].toLowerCase()} counter`,
          body: result.remaining > 0.005
            ? `${currency(result.remaining)} still owing here.`
            : "Nothing left owing here.",
        });
      } else {
        notify({
          tone: "ok",
          title: "Added to the bill",
          body: `${currency(due)} is owing at the ${DEPARTMENT_LABEL[department].toLowerCase()} counter. It can be paid in Billing.`,
        });
      }
      onSettled?.();
      onClose();
    } catch {
      /* The refusal — more than is owed, nothing to bill — is already a toast.
         The dialogue stays open so the figure can be corrected. */
    } finally {
      setBusy(false);
    }
  };

  /* Clearing the amount is a way of saying "not now", so the button says so
     rather than offering to take nothing. */
  const taking = collect && amount > 0;
  const nothingDue = !isPending && due <= 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${DEPARTMENT_LABEL[department]} counter`}
      subtitle={account ? `${account.patient_name} · ${account.patient_mrn}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void settle()} disabled={busy || nothingDue}>
            {taking ? <IconCard size={15} /> : <IconReceipt size={15} />}
            {taking ? `Take ${currency(amount)}` : "Add to the bill"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isPending && (
          <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-6 text-center text-[0.8125rem] text-ink-3">
            Working out what is owed…
          </p>
        )}

        {nothingDue && (
          <EmptyState
            compact
            icon={<IconCheck size={20} />}
            title="Nothing owing at this counter"
            body="Everything here has been billed and paid."
          />
        )}

        {entry && due > 0 && (
          <>
            <ChargeList entry={entry} />

            <div className="flex items-center justify-between rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5">
              <span className="text-[0.875rem] font-medium text-ink">To pay</span>
              <span className="tnum font-mono text-[1.0625rem] font-semibold text-ink">{currency(due)}</span>
            </div>

            <Checkbox
              checked={collect}
              onChange={setCollect}
              label="Take the money now"
              description="Leave this off to issue the invoice and let them pay in Billing on the way out."
            />

            {collect && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Amount" required help="Part payments are allowed.">
                  <NumberInput
                    min={0}
                    max={due}
                    step="0.01"
                    value={amount}
                    onChange={(n) => { setTouched(true); setAmount(n); }}
                  />
                </Field>
                <Field label="Method" required>
                  <Select value={method} onChange={(e) => setMethod(e.target.value as Payment["method"])}>
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </Field>
                <Field label="Reference" className="sm:col-span-2" help="Card slip, transaction id — optional.">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** What is being charged for, split by whether it is on an invoice yet. */
function ChargeList({ entry }: { entry: DepartmentAccount }) {
  const unpriced = entry.unbilled.filter((c) => !c.priced || c.unit_price <= 0).length;
  return (
    <div className="space-y-3">
      {entry.unbilled.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">
            Not billed yet
          </p>
          <ul className="divide-y divide-line-soft rounded-[var(--r)] border border-line">
            {entry.unbilled.map((charge) => <ChargeRow key={charge.ref_id} charge={charge} />)}
          </ul>
        </div>
      )}

      {entry.outstanding > 0.005 && (
        <div className="flex items-center justify-between rounded-[var(--r)] border border-line px-3 py-2.5">
          <span className="text-[0.8125rem] text-ink-2">
            Already invoiced and unpaid
            <span className="ml-1.5 text-ink-3">
              ({entry.invoices.length === 1 ? "1 invoice" : `${entry.invoices.length} invoices`})
            </span>
          </span>
          <span className="tnum font-mono text-[0.8125rem] text-ink">{currency(entry.outstanding)}</span>
        </div>
      )}

      {unpriced > 0 && (
        <p className="flex items-start gap-2 rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2.5 text-[0.75rem] leading-relaxed text-warn-text">
          <IconAlert size={14} className="mt-px shrink-0" />
          {unpriced === 1 ? "One line has" : `${unpriced} lines have`} no price in the tariff, so
          {unpriced === 1 ? " it is" : " they are"} counted as zero. Set prices under Pricing.
        </p>
      )}
    </div>
  );
}

function ChargeRow({ charge }: { charge: Charge }) {
  /* Nothing in the tariff, or a row still sitting at zero — either way the
     counter would ask for nothing, so both say so. */
  const worthless = !charge.priced || charge.unit_price <= 0;
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[0.8438rem] text-ink">{charge.description}</p>
        <p className="text-[0.75rem] text-ink-3">
          {charge.qty} × {currency(charge.unit_price)}
          {charge.tax_pct > 0 && ` · ${charge.tax_pct}% tax`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {worthless && <Badge tone="warn" size="sm" dot={false}>No price set</Badge>}
        <span className="tnum font-mono text-[0.8438rem] text-ink">{currency(charge.total)}</span>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Final settlement — everything still owing, in one go.
 *
 * The patient is leaving. Whatever they already paid at a window is simply not
 * here: the pharmacy took its money when the medicine was handed over, so the
 * pharmacy asks for nothing now and the total is the consultation and the lab.
 * That is not a subtraction this screen performs — a settled counter has no
 * `due` — but the counters that are square are still listed, so it is visible
 * that they were charged and are done rather than never charged at all.
 *
 * Two ways out, which are the two things a patient says at the door: pay it, or
 * put it on the bill and pay later.
 */
export function FinalSettlement({
  open, onClose, patientId, onSettled,
}: {
  open: boolean;
  onClose: () => void;
  patientId: Id | null;
  onSettled?: () => void;
}) {
  const { raiseCounterInvoice, takeCounterPayment, notify } = useApp();
  const { data: account, isPending } = usePatientAccount(open ? patientId : null);

  const [method, setMethod] = React.useState<Payment["method"]>("cash");
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setReference(""); setBusy(false); }
  }, [open]);

  const entries = ORDER.map((d) => account?.departments?.[d]).filter(Boolean) as DepartmentAccount[];
  const owing = entries.filter((entry) => entry.due > 0.005);
  const done = entries.filter((entry) => entry.due <= 0.005 && entry.paid > 0.005);
  const total = Math.round(owing.reduce((sum, entry) => sum + entry.due, 0) * 100) / 100;

  /* One counter at a time, in the order they are listed. Each is its own
     invoice and its own payment, so stopping half way leaves the counters that
     went through settled — which is the truth, the money changed hands. */
  const run = async (collect: boolean) => {
    if (!patientId || owing.length === 0) return;
    setBusy(true);
    const settled: BillingDepartment[] = [];
    try {
      for (const entry of owing) {
        if (entry.unbilled.length > 0) {
          await raiseCounterInvoice(patientId, { department: entry.department, issue: true });
        }
        if (collect) {
          await takeCounterPayment(patientId, {
            department: entry.department,
            amount: entry.due,
            method,
            reference: reference.trim() || undefined,
          });
        }
        settled.push(entry.department);
      }
      notify({
        tone: "ok",
        title: collect ? `${currency(total)} taken` : "Put on the bill",
        body: collect
          ? `Settled at the ${settled.map((d) => DEPARTMENT_LABEL[d].toLowerCase()).join(", ")} counter${settled.length > 1 ? "s" : ""}. Nothing left owing.`
          : `${currency(total)} is invoiced and owing. It can be paid here whenever they come back.`,
      });
      onSettled?.();
      onClose();
    } catch {
      /* The refusal is already a toast. Say which counters did go through, so
         nobody asks for the same money twice. */
      if (settled.length > 0) {
        notify({
          tone: "warn",
          title: "Only part of it went through",
          body: `${settled.map((d) => DEPARTMENT_LABEL[d].toLowerCase()).join(", ")} settled. The rest is still owing.`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const nothingDue = !isPending && total <= 0.005;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Final settlement"
      subtitle={account ? `${account.patient_name} · ${account.patient_mrn}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => void run(false)} disabled={busy || nothingDue}>
            <IconReceipt size={15} /> Pay later
          </Button>
          <Button variant="primary" onClick={() => void run(true)} disabled={busy || nothingDue}>
            <IconCard size={15} /> Take {currency(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isPending && (
          <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-6 text-center text-[0.8125rem] text-ink-3">
            Working out what is owed…
          </p>
        )}

        {nothingDue && (
          <EmptyState
            compact
            icon={<IconCheck size={20} />}
            title="Nothing left to settle"
            body="Every counter is square."
          />
        )}

        {owing.length > 0 && (
          <ul className="divide-y divide-line-soft rounded-[var(--r)] border border-line">
            {owing.map((entry) => (
              <li key={entry.department} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-medium text-ink">{DEPARTMENT_LABEL[entry.department]}</p>
                  <p className="text-[0.75rem] text-ink-3">
                    {[
                      entry.unbilled_total > 0.005 ? `${currency(entry.unbilled_total)} not billed yet` : null,
                      entry.outstanding > 0.005 ? `${currency(entry.outstanding)} already invoiced` : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="tnum shrink-0 font-mono text-[0.9375rem] text-ink">{currency(entry.due)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Counters that already have their money. Listed, not hidden — the
            desk needs to see the pharmacy was paid, not wonder about it. */}
        {done.length > 0 && (
          <ul className="space-y-1.5">
            {done.map((entry) => (
              <li
                key={entry.department}
                className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-line-soft px-3 py-2 text-[0.8125rem] text-ink-3"
              >
                <span className="flex items-center gap-2">
                  <IconCheck size={13} className="shrink-0 text-ok-text" />
                  {currency(entry.paid)} already paid at the {DEPARTMENT_LABEL[entry.department].toLowerCase()} counter
                </span>
                <span className="tnum font-mono">{currency(0)}</span>
              </li>
            ))}
          </ul>
        )}

        {owing.length > 0 && (
          <>
            <div className="flex items-center justify-between rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5">
              <span className="text-[0.875rem] font-medium text-ink">To pay now</span>
              <span className="tnum font-mono text-[1.0625rem] font-semibold text-ink">{currency(total)}</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Method" required>
                <Select value={method} onChange={(e) => setMethod(e.target.value as Payment["method"])}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </Field>
              <Field label="Reference" help="Card slip, transaction id — optional.">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>

            <p className="text-[0.75rem] leading-relaxed text-ink-3">
              Each counter is invoiced and paid separately, so the ledger still shows
              consultation, lab and pharmacy apart. To pay only some of it, or part of one
              counter, use Collect on that counter instead.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
