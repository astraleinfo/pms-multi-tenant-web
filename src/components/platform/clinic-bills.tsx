"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { formatDate } from "@/lib/format";
import { openPdfBlob } from "@/lib/pdf";
import type { SubscriptionInvoice, SubscriptionSummary, Tenant } from "@/lib/types";
import { ConfirmDialog } from "@/components/platform/confirm";
import { rentMoney } from "@/components/domain/subscription";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IconCheck, IconDownload } from "@/components/ui/icons";

/** One clinic's bills, with the actions a super admin has on them. */
export function ClinicBills({
  row, superAdmin, onChanged,
}: {
  row: { tenant: Tenant; invoices: SubscriptionInvoice[]; summary: SubscriptionSummary };
  superAdmin: boolean;
  onChanged: () => void;
}) {
  const { notify, updateTenant } = useApp();
  const [settling, setSettling] = React.useState<SubscriptionInvoice | null>(null);
  const [voiding, setVoiding] = React.useState<SubscriptionInvoice | null>(null);
  const [reference, setReference] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const today = row.tenant.today;

  const act = async (fn: () => Promise<unknown>, done: { title: string; body?: string }) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
      notify({ tone: "ok", ...done });
      setSettling(null);
      setVoiding(null);
      setReference("");
    } catch (error) {
      notify({ tone: "critical", title: "Not changed", body: error instanceof Error ? error.message : "Try again." });
    }
    setBusy(false);
  };

  const pdf = async (bill: SubscriptionInvoice) => {
    try {
      openPdfBlob(await api.tenantBillPdf(row.tenant.id, bill.id));
    } catch {
      notify({ tone: "warn", title: "Could not open the bill" });
    }
  };

  return (
    <div className="space-y-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-ink-3">
          {row.summary.on_hold
            ? `On hold since ${formatDate(row.summary.hold_since!.slice(0, 10))}. Settling or withdrawing the overdue bill lifts it immediately.`
            : row.summary.exempt
              ? "Exempt — no bills are raised for this clinic."
              : "Bills raised for this clinic, newest first."}
        </p>
        {superAdmin && (
          <Button
            variant="ghost" size="sm" disabled={busy}
            onClick={() => {
              void act(
                () => updateTenant(row.tenant.id, { billing_exempt: !row.summary.exempt }),
                row.summary.exempt
                  ? { title: `${row.tenant.name} will be billed again`, body: "From the next run." }
                  : { title: `${row.tenant.name} is exempt`, body: "No more bills, and any hold is lifted." },
              );
            }}
          >
            {row.summary.exempt ? "Bill this clinic again" : "Exempt from billing"}
          </Button>
        )}
      </div>

      {row.invoices.length === 0 ? (
        <p className="text-label text-ink-3">No bills yet.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Bill</TH>
              <TH>Modules</TH>
              <TH>Due</TH>
              <TH>Status</TH>
              <TH align="right">Amount</TH>
              <TH align="right"><span className="sr-only">Actions</span></TH>
            </TR>
          </THead>
          <TBody>
            {row.invoices.map((bill) => {
              const late = bill.status === "open" && today > bill.due_on;
              return (
                <TR key={bill.id}>
                  <TD><span className="tnum font-mono text-label text-ink">{bill.number}</span></TD>
                  <TD><span className="text-caption text-ink-3">{bill.lines.map((l) => l.name).join(", ")}</span></TD>
                  <TD><span className="tnum text-ink-2">{formatDate(bill.due_on)}</span></TD>
                  <TD>
                    <Badge
                      tone={bill.status === "paid" ? "ok" : bill.status === "void" ? "neutral" : late ? "critical" : "warn"}
                      size="sm"
                    >
                      {bill.status === "open" ? (late ? "Overdue" : "Open") : bill.status === "paid" ? "Paid" : "Void"}
                    </Badge>
                    {bill.status === "open" && (
                      <span className="mt-0.5 block text-micro text-ink-3">
                        {bill.reminders_sent} reminder{bill.reminders_sent === 1 ? "" : "s"} · last: {bill.reminder_stage.replace("_", " ")}
                      </span>
                    )}
                    {bill.status === "paid" && bill.payment_reference && (
                      <span className="mt-0.5 block text-micro text-ink-3">Ref {bill.payment_reference}</span>
                    )}
                  </TD>
                  <TD align="right"><span className="tnum font-mono text-label text-ink">{rentMoney(bill.amount, bill.currency)}</span></TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { void pdf(bill); }} aria-label={`PDF of ${bill.number}`}>
                        <IconDownload size={14} />
                      </Button>
                      {superAdmin && bill.status === "open" && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setVoiding(bill)}>Withdraw</Button>
                          <Button variant="secondary" size="sm" onClick={() => { setReference(""); setSettling(bill); }}>
                            <IconCheck size={14} /> Mark paid
                          </Button>
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <Modal
        open={!!settling}
        onClose={() => { if (!busy) setSettling(null); }}
        width="sm"
        title="Record a payment"
        subtitle={settling ? `${settling.number} · ${row.tenant.name}` : row.tenant.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSettling(null)} disabled={busy}>Cancel</Button>
            <Button
              variant="primary" disabled={busy}
              onClick={() => {
                if (!settling) return;
                void act(
                  () => api.settleBill(row.tenant.id, settling.id, reference),
                  { title: `${settling.number} marked paid`, body: row.summary.on_hold ? "The hold is lifted if this was the last overdue bill." : undefined },
                );
              }}
            >
              {busy ? "Saving…" : "Mark paid"}
            </Button>
          </>
        }
      >
        {settling && (
          <div className="space-y-3">
            <p className="text-label text-ink-2">
              {rentMoney(settling.amount, settling.currency)} for{" "}
              {settling.lines.map((l) => l.name).join(", ")}. The clinic&apos;s admins are emailed a receipt.
            </p>
            <Field label="Payment reference" htmlFor="bill-reference" help="Bank, UPI or cheque reference — printed on the receipt.">
              <Input
                id="bill-reference" value={reference} maxLength={120} autoFocus
                onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI 4127 8830 1123"
              />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!voiding}
        onClose={() => { if (!busy) setVoiding(null); }}
        onConfirm={() => {
          if (!voiding) return;
          void act(() => api.voidBill(row.tenant.id, voiding.id), { title: `${voiding.number} withdrawn` });
        }}
        busy={busy}
        tone="danger"
        title="Withdraw this bill?"
        subtitle={voiding ? `${voiding.number} · ${row.tenant.name}` : row.tenant.name}
        confirmLabel="Withdraw bill"
      >
        <p className="text-label leading-relaxed text-ink-2">
          For a bill raised in error. It stops counting towards a hold, and is kept — marked void — so the
          record of what was raised stays complete. It cannot be reopened.
        </p>
      </ConfirmDialog>
    </div>
  );
}
