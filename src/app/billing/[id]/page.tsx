"use client";

import * as React from "react";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb, usePatient } from "@/lib/query/hooks";
import { findInvoice, invoiceTotals } from "@/lib/data/repository";
import { currency, formatDate, pluralise, relativeDay } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV, Meter } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input, NumberInput, Select } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import { DEPARTMENT_LABEL, StatusPill } from "@/components/domain/status";
import { PatientChip } from "@/components/domain/patient";
import {
  IconArrowRight, IconCard, IconCheck, IconChevronLeft, IconPrint, IconReceipt, IconX,
} from "@/components/ui/icons";

export default function InvoicePage(props: PageProps<"/billing/[id]">) {
  const { id } = React.use(props.params);
  return (
    <RoleGate allow={["receptionist"]}>
      <FeatureGate feature="billing">
        <Invoice id={id} />
      </FeatureGate>
    </RoleGate>
  );
}

function Invoice({ id }: { id: string }) {
  const { session, today, config, addPayment, issueInvoice, voidInvoice, notify } = useApp();
  const db = useClinicDb();
  const { tenant } = useTenant();
  const t = session.tenantId;
  const invoice = findInvoice(db, t, id);
  const [paying, setPaying] = React.useState(false);
  /* Above the bail-out below, not next to where it is read. The invoice is not
     there on the first render and is a moment later, so a hook underneath that
     `return` is a hook this component calls sometimes — which React counts. */
  const { data: patient } = usePatient(invoice?.patient_id ?? "");

  if (!invoice) {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          title="No such invoice in this clinic"
          body="Invoices are tenant-scoped; this one belongs elsewhere or has been removed."
          action={<ButtonLink href="/billing" variant="secondary" size="sm"><IconChevronLeft size={14} /> Back to billing</ButtonLink>}
        />
      </Card>
    );
  }

  const totals = invoiceTotals(invoice);
  const overdue = totals.balance > 0.005 && invoice.due_at < today && invoice.status !== "draft";

  return (
    <>
      <PageHeader
        eyebrow={<span className="tnum font-mono">{invoice.number}</span>}
        title={patient?.full_name ?? "Invoice"}
        description={`Issued ${formatDate(invoice.issued_at, "long")} · due ${formatDate(invoice.due_at, "long")}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => window.print()}><IconPrint size={15} /> Print</Button>
            {invoice.status === "draft" && (
              <Button variant="secondary" onClick={() => {
                issueInvoice(invoice.id);
                notify({ tone: "ok", title: "Invoice issued" });
              }}>
                <IconCheck size={15} /> Issue
              </Button>
            )}
            {invoice.status !== "void" && totals.balance > 0.005 && (
              <Button variant="primary" onClick={() => setPaying(true)}>
                <IconCard size={15} /> Take payment
              </Button>
            )}
            {invoice.status !== "void" && totals.paid === 0 && (
              <Button variant="ghost" onClick={() => {
                voidInvoice(invoice.id);
                notify({ tone: "warn", title: "Invoice voided", body: "It is excluded from every revenue figure." });
              }}>
                <IconX size={15} /> Void
              </Button>
            )}
          </>
        }
        meta={
          <>
            <StatusPill kind="invoice" status={invoice.status} />
            {/* Which counter raised it — the lab and the pharmacy bill on
                their own invoices, and chase their own money. */}
            <Badge tone={invoice.department === "clinic" ? "neutral" : "accent"} size="sm" dot={false}>
              {DEPARTMENT_LABEL[invoice.department]} counter
            </Badge>
            {overdue && <Badge tone="critical" size="sm">Overdue since {formatDate(invoice.due_at)}</Badge>}
            {invoice.encounter_id && (
              <ButtonLink href={`/consultations/${invoice.encounter_id}`} variant="ghost" size="sm">
                Linked encounter <IconArrowRight size={13} />
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title="Line items" subtitle={pluralise(invoice.line_items.length, "line")} />
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Description</TH><TH>Source</TH><TH align="right">Qty</TH>
                    <TH align="right">Unit</TH><TH align="right">Amount</TH>
                  </tr>
                </THead>
                <TBody>
                  {invoice.line_items.map((li) => (
                    <TR key={li.id}>
                      <TD className="font-medium">{li.description}</TD>
                      <TD>
                        <Badge
                          tone={li.source === "pharmacy" ? "accent" : li.source === "lab" ? "warn" : li.source === "procedure" ? "info" : "neutral"}
                          size="sm" dot={false}
                        >
                          {li.source}
                        </Badge>
                      </TD>
                      <TD align="right" className="tnum font-mono">{li.qty}</TD>
                      <TD align="right" className="tnum font-mono">{currency(li.unit_price)}</TD>
                      <TD align="right" className="tnum font-mono font-medium">{currency(li.qty * li.unit_price)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <CardBody className="pt-4">
              <dl className="ml-auto max-w-xs space-y-1.5">
                <div className="flex justify-between text-[0.875rem]">
                  <dt className="text-ink-2">Subtotal</dt>
                  <dd className="tnum font-mono text-ink">{currency(totals.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-[0.875rem]">
                  <dt className="text-ink-2">Tax</dt>
                  <dd className="tnum font-mono text-ink">{currency(totals.tax)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1.5 text-[1rem] font-semibold">
                  <dt className="text-ink">Total</dt>
                  <dd className="tnum font-mono text-ink">{currency(totals.total)}</dd>
                </div>
                <div className="flex justify-between text-[0.875rem]">
                  <dt className="text-ink-2">Paid</dt>
                  <dd className="tnum font-mono text-ok-text">−{currency(totals.paid)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1.5 text-[0.9375rem] font-semibold">
                  <dt className="text-ink">Balance</dt>
                  <dd className={`tnum font-mono ${totals.balance > 0.005 ? "text-warn-text" : "text-ok-text"}`}>
                    {currency(totals.balance)}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconCard size={16} />} title="Payments"
                        subtitle="Part payments are normal — the status follows the balance." />
            <CardBody className="pt-0">
              {invoice.payments.length === 0 ? (
                <EmptyState compact title="No payments recorded"
                            action={invoice.status !== "void"
                              ? <Button size="sm" variant="primary" onClick={() => setPaying(true)}>Take payment</Button>
                              : undefined} />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-[0.875rem] font-medium text-ink">{currency(p.amount)}</p>
                        <p className="text-[0.75rem] text-ink-3">
                          {p.method.toUpperCase()}{p.reference ? ` · ${p.reference}` : ""}
                        </p>
                      </div>
                      <span className="tnum font-mono text-[0.75rem] text-ink-3">{p.at}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="Bill to" />
            <CardBody className="pt-0">
              {patient ? (
                <>
                  <PatientChip patient={patient} size="lg" href={`/patients/${patient.id}`} />
                  <dl className="mt-4 space-y-3 border-t border-line-soft pt-4">
                    <KV label="Record" value={<span className="tnum font-mono text-[0.8125rem]">{patient.mrn}</span>} />
                    <KV label="Phone" value={<span className="tnum font-mono text-[0.8125rem]">{patient.phone}</span>} />
                    {patient.clinical_ext.insurance_number != null && (
                      <KV label="Insurance" value={<span className="tnum font-mono text-[0.8125rem]">{String(patient.clinical_ext.insurance_number)}</span>} />
                    )}
                  </dl>
                </>
              ) : <p className="text-[0.8125rem] text-ink-3">Patient not found.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Settlement" />
            <CardBody className="pt-1">
              <Meter value={totals.paid} max={Math.max(totals.total, 0.01)}
                     tone={totals.balance <= 0.005 ? "ok" : "warn"} height={8} />
              <p className="mt-2 text-[0.8125rem] text-ink-2">
                {totals.balance <= 0.005
                  ? "Settled in full."
                  : `${currency(totals.balance)} still owed — due ${relativeDay(invoice.due_at).toLowerCase()}.`}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line-soft pt-4">
                <KV label="Issued" value={formatDate(invoice.issued_at, "long")} />
                <KV label="Due" value={formatDate(invoice.due_at, "long")} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Issued by" />
            <CardBody className="pt-0">
              <p className="text-[0.875rem] font-medium text-ink">{tenant.name}</p>
              {config.address && <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-2">{config.address}</p>}
              {config.contact_phone && (
                <p className="tnum mt-1 font-mono text-[0.75rem] text-ink-2">{config.contact_phone}</p>
              )}
              {config.contact_email && (
                <p className="break-all text-[0.75rem] text-ink-2">{config.contact_email}</p>
              )}
              <p className="mt-2 text-[0.75rem] text-ink-3">
                Every invoice carries the tenant that raised it — this record can never appear in another clinic's ledger.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>

      <PaymentModal
        open={paying}
        onClose={() => setPaying(false)}
        balance={totals.balance}
        onSubmit={(amount, method, reference) => {
          addPayment(invoice.id, amount, method, reference);
          notify({ tone: "ok", title: "Payment recorded", body: currency(amount) });
          setPaying(false);
        }}
      />
    </>
  );
}

function PaymentModal({
  open, onClose, balance, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  balance: number;
  onSubmit: (amount: number, method: Payment["method"], reference?: string) => void;
}) {
  const [amount, setAmount] = React.useState(balance);
  const [method, setMethod] = React.useState<Payment["method"]>("card");
  const [reference, setReference] = React.useState("");

  React.useEffect(() => {
    if (open) { setAmount(Math.round(balance * 100) / 100); setMethod("card"); setReference(""); }
  }, [open, balance]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title="Take payment"
      subtitle={`${currency(balance)} outstanding`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={amount <= 0}
                  onClick={() => onSubmit(Math.min(amount, balance), method, reference.trim() || undefined)}>
            <IconReceipt size={15} /> Record payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Amount" required help={`Anything up to ${currency(balance)}. Part payments are allowed.`}>
          <NumberInput min={0} step="0.01" max={balance} value={amount} onChange={setAmount} />
        </Field>
        <Field label="Method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as Payment["method"])}>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="upi">Bank transfer / UPI</option>
            <option value="insurance">Insurance</option>
          </Select>
        </Field>
        <Field label="Reference">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="CARD-4417, claim number…" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[balance, balance / 2, 50, 20].filter((v) => v > 0 && v <= balance).map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setAmount(Math.round(v * 100) / 100)}
              className="tnum rounded-[var(--r-pill)] border border-line-strong bg-surface px-2.5 py-1 font-mono text-[0.75rem] text-ink-2 transition-colors hover:border-accent hover:text-accent-text"
            >
              {currency(Math.round(v * 100) / 100)}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
