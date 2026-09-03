"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { useInvoicePage, usePatientAccount } from "@/lib/query/hooks";
import { invoiceTotals } from "@/lib/data/repository";
import { currency, formatDate, pluralise } from "@/lib/format";
import type { BillingDepartment, DepartmentAccount, Id, Invoice } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Field } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PatientPicker } from "@/components/domain/patient";
import { DEPARTMENT_LABEL, StatusPill } from "@/components/domain/status";
import { CounterPayment, FinalSettlement } from "@/components/domain/counter-payment";
import { IconCard, IconCheck, IconReceipt } from "@/components/ui/icons";

/** Reading order at the desk: the visit, then what was done for it. */
const ORDER: BillingDepartment[] = ["clinic", "lab", "pharmacy"];

/**
 * One patient's whole account — every counter, and every bill.
 *
 * This is the question actually asked at the desk: *somebody is standing here,
 * what do they owe?* The answer is three numbers, because the clinic, the lab
 * and the pharmacy each keep their own invoices and each is settled on its own.
 * Underneath it is every invoice they have, so "which bill is this?" has an
 * answer too.
 */
export function PatientAccount({
  patientId, onPatientChange, showPicker = true,
}: {
  patientId: Id | null;
  onPatientChange?: (id: Id) => void;
  showPicker?: boolean;
}) {
  const [collecting, setCollecting] = React.useState<BillingDepartment | null>(null);
  const [settling, setSettling] = React.useState(false);

  return (
    <div className="space-y-5">
      {showPicker && (
        <Card>
          <CardBody>
            <Field label="Patient" required help="Search by name, record number or phone.">
              <PatientPicker value={patientId} onChange={(id) => onPatientChange?.(id)} />
            </Field>
          </CardBody>
        </Card>
      )}

      {!patientId ? (
        <Card>
          <EmptyState
            icon={<IconCard size={20} />}
            title="Find the patient"
            body="Their consultation, lab and pharmacy bills all appear here, and each counter is paid on its own."
          />
        </Card>
      ) : (
        <>
          <CounterSummary
            patientId={patientId}
            onCollect={setCollecting}
            onSettleAll={() => setSettling(true)}
          />
          <PatientInvoices patientId={patientId} />
        </>
      )}

      <CounterPayment
        open={collecting !== null}
        onClose={() => setCollecting(null)}
        patientId={patientId}
        department={collecting ?? "clinic"}
      />

      <FinalSettlement
        open={settling}
        onClose={() => setSettling(false)}
        patientId={patientId}
      />
    </div>
  );
}

/**
 * What each counter is owed, and the buttons that settle it.
 *
 * All three are listed whatever their state, because "the pharmacy is not in
 * the total" and "the pharmacy was never charged" are different facts and the
 * desk has to be able to tell them apart. A counter that took its money at the
 * window says so and contributes nothing to the total.
 */
function CounterSummary({
  patientId, onCollect, onSettleAll,
}: {
  patientId: Id;
  onCollect: (department: BillingDepartment) => void;
  onSettleAll: () => void;
}) {
  /* Whoever cannot take money still sees what is owed — a clinician reading
     the account is fine; a button that answers 403 is not. */
  const { can } = useApp();
  const collects = can("billing:write");
  const { data: account, isPending } = usePatientAccount(patientId);

  if (isPending) {
    return (
      <Card>
        <CardHeader title="What is owed" />
        <CardBody className="pt-1">
          <p className="text-[0.8125rem] text-ink-3">Working out what is owed…</p>
        </CardBody>
      </Card>
    );
  }
  if (!account) return null;

  const settled = account.total_due <= 0.005;

  const owing = ORDER.filter((d) => (account.departments[d]?.due ?? 0) > 0.005);

  return (
    <Card>
      <CardHeader
        title={settled ? "What is owed" : "Left to pay"}
        subtitle={account.patient_name ? `${account.patient_name} · ${account.patient_mrn}` : undefined}
        actions={
          <span className={`tnum font-mono text-[1.0625rem] font-semibold ${settled ? "text-ok-text" : "text-ink"}`}>
            {currency(account.total_due)}
          </span>
        }
      />
      <CardBody className="pt-1">
        {settled ? (
          <EmptyState
            compact
            icon={<IconCheck size={20} />}
            title="Nothing owing"
            body="Every counter is settled."
          />
        ) : (
          <ul className="space-y-2">
            {ORDER.map((department) => {
              const entry = account.departments[department];
              if (!entry) return null;
              return (
                <CounterRow
                  key={department}
                  entry={entry}
                  collects={collects}
                  onCollect={() => onCollect(department)}
                />
              );
            })}
          </ul>
        )}
      </CardBody>

      {/* One button for the patient who is leaving and wants it all done. It
          only ever asks for the counters that still owe something. */}
      {collects && owing.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-surface-2 px-5 py-3.5">
          <p className="text-[0.8125rem] text-ink-2">
            {owing.map((d) => DEPARTMENT_LABEL[d].toLowerCase()).join(" + ")} ={" "}
            <span className="tnum font-mono font-medium text-ink">{currency(account.total_due)}</span>
          </p>
          <Button variant="primary" size="sm" onClick={onSettleAll}>
            <IconCard size={14} /> Settle everything
          </Button>
        </div>
      )}
    </Card>
  );
}

/** One counter's line: what it wants, or why it wants nothing. */
function CounterRow({
  entry, collects, onCollect,
}: {
  entry: DepartmentAccount;
  collects: boolean;
  onCollect: () => void;
}) {
  const clear = entry.due <= 0.005;
  const alreadyPaid = clear && entry.paid > 0.005;

  const detail = clear
    ? alreadyPaid
      ? `${currency(entry.paid)} paid at the counter — not in the total`
      : "nothing charged here"
    : [
        entry.unbilled_total > 0.005 ? `${currency(entry.unbilled_total)} not billed yet` : null,
        entry.outstanding > 0.005
          ? `${currency(entry.outstanding)} on ${pluralise(entry.invoices.length, "invoice")}`
          : null,
      ].filter(Boolean).join(" · ");

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--r)] border px-3 py-2.5 ${
        clear ? "border-line-soft" : "border-line"
      }`}
    >
      <div className="min-w-0">
        <p className={`flex items-center gap-1.5 text-[0.875rem] font-medium ${clear ? "text-ink-3" : "text-ink"}`}>
          {alreadyPaid && <IconCheck size={13} className="shrink-0 text-ok-text" />}
          {DEPARTMENT_LABEL[entry.department]}
        </p>
        <p className="text-[0.75rem] text-ink-3">{detail}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`tnum font-mono text-[0.9375rem] ${clear ? "text-ink-3" : "text-ink"}`}>
          {currency(entry.due)}
        </span>
        {collects && (
          <Button variant={clear ? "ghost" : "secondary"} size="sm" disabled={clear} onClick={onCollect}>
            <IconCard size={14} /> Collect
          </Button>
        )}
      </div>
    </li>
  );
}

/** Every bill this patient has, whichever counter raised it. */
function PatientInvoices({ patientId }: { patientId: Id }) {
  const router = useRouter();
  const { data } = useInvoicePage({ patient_id: patientId, limit: 50, sort: "issued_at", order: "desc" });
  const invoices = data?.items ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<IconReceipt size={16} />}
        title="Their bills"
        subtitle={`${pluralise(invoices.length, "invoice")} across every counter`}
      />
      {invoices.length === 0 ? (
        <EmptyState compact title="Nothing billed yet" body="Charges appear above until they are put on an invoice." />
      ) : (
        <TableWrap maxHeight="min(50vh, 32rem)">
          <Table>
            <THead sticky>
              <tr>
                <TH>Invoice</TH>
                <TH>Counter</TH>
                <TH>Issued</TH>
                <TH align="right">Total</TH>
                <TH align="right">Balance</TH>
                <TH align="right">Status</TH>
              </tr>
            </THead>
            <TBody>
              {invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} onOpen={router.push} />)}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}

function InvoiceRow({ invoice, onOpen }: { invoice: Invoice; onOpen: (href: string) => void }) {
  const totals = invoiceTotals(invoice);
  return (
    <TR onClick={() => onOpen(`/billing/${invoice.id}`)}>
      <TD>
        <ButtonLink
          href={`/billing/${invoice.id}`}
          variant="ghost"
          size="sm"
          className="h-7 px-2 font-mono text-[0.8125rem]"
        >
          {invoice.number}
        </ButtonLink>
      </TD>
      <TD>
        <Badge tone={invoice.department === "clinic" ? "neutral" : "accent"} size="sm" dot={false}>
          {DEPARTMENT_LABEL[invoice.department]}
        </Badge>
      </TD>
      <TD className="tnum font-mono text-[0.8125rem] text-ink-2">{formatDate(invoice.issued_at)}</TD>
      <TD align="right" className="tnum font-mono">{currency(totals.total)}</TD>
      <TD align="right">
        <span className={`tnum font-mono ${totals.balance > 0.005 ? "text-warn-text" : "text-ok-text"}`}>
          {currency(totals.balance)}
        </span>
      </TD>
      <TD align="right"><StatusPill kind="invoice" status={invoice.status} size="sm" dot={false} /></TD>
    </TR>
  );
}

/**
 * The compact version, for a screen that is already about one patient — the
 * record, or the dispensing window. No picker, no invoice table: just what
 * each counter is owed and a way to take it.
 */
export function PatientAccountSummary({
  patientId, only,
}: {
  patientId: Id;
  /** show one counter rather than all three — the pharmacy window's own view */
  only?: BillingDepartment;
}) {
  const { can } = useApp();
  const { data: account, isPending } = usePatientAccount(can("billing:read") ? patientId : null);
  const [collecting, setCollecting] = React.useState<BillingDepartment | null>(null);

  if (isPending || !account) return null;

  const departments = only ? [only] : ORDER;
  const shown = departments
    .map((department) => account.departments[department])
    .filter((entry) => entry && entry.due > 0.005);

  if (shown.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.8125rem] text-ink-2">
        <IconCheck size={14} className="shrink-0 text-ok-text" />
        {only
          ? `Nothing owing at the ${DEPARTMENT_LABEL[only].toLowerCase()} counter.`
          : "Nothing owing on this account."}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {shown.map((entry) => (
          <li
            key={entry.department}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[0.8438rem] font-medium text-warn-text">
                {currency(entry.due)} owing at the {DEPARTMENT_LABEL[entry.department].toLowerCase()} counter
              </p>
              <p className="text-[0.75rem] text-warn-text/80">
                {entry.unbilled_total > 0.005 && `${currency(entry.unbilled_total)} not billed yet`}
                {entry.unbilled_total > 0.005 && entry.outstanding > 0.005 && " · "}
                {entry.outstanding > 0.005 && `${currency(entry.outstanding)} invoiced`}
              </p>
            </div>
            {can("billing:write") && (
              <Button variant="secondary" size="sm" onClick={() => setCollecting(entry.department)}>
                <IconCard size={14} /> Collect
              </Button>
            )}
          </li>
        ))}
      </ul>

      <CounterPayment
        open={collecting !== null}
        onClose={() => setCollecting(null)}
        patientId={patientId}
        department={collecting ?? "clinic"}
      />
    </>
  );
}
