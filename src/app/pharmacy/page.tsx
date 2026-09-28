"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, usePharmacyStats, usePatient } from "@/lib/query/hooks";
import {
  batchesFor, selectInventoryItems, selectInventoryTx, selectPrescriptions,
  stockLevel, userName,
} from "@/lib/data/repository";

import { currency, formatDate, formatStamp, pluralise } from "@/lib/format";
import { StockReference } from "@/components/domain/stock-reference";
import type { Prescription } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, Legend } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { Input, NumberInput, Select } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import { StatusPill } from "@/components/domain/status";
import { AllergyFlag, PatientChip, PatientRef } from "@/components/domain/patient";
import { CounterPayment } from "@/components/domain/counter-payment";
import { PatientAccountSummary } from "@/components/domain/patient-account";
import { cn } from "@/lib/cn";
import {
  IconAlert, IconBox, IconCheck, IconList, IconPill, IconQueue, IconRx
} from "@/components/ui/icons";

export default function PharmacyPage() {
  return (
    <RoleGate allow={["pharmacist", "doctor"]}>
      <FeatureGate feature="pharmacy">
        <Pharmacy />
      </FeatureGate>
    </RoleGate>
  );
}

function Pharmacy() {
  const { session, hasFeature } = useApp();
  const db = useClinicDb();
  const t = session.tenantId;

  const all = selectPrescriptions(db, t).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const counter = all.filter((r) => r.status !== "dispensed");
  const [tab, setTab] = React.useState<"counter" | "history">("counter");
  const [selectedId, setSelectedId] = React.useState<string | null>(counter[0]?.id ?? null);

  const selected = all.find((r) => r.id === selectedId) ?? counter[0] ?? null;
  const stats = usePharmacyStats();

  return (
    <>
      <PageHeader
        title="Pharmacy"
        description="The counter reads prescription rows straight from the clinical record. Handing medicine over writes a dispense transaction into the one inventory ledger — no second stock table, no copied prescription."
        actions={
          hasFeature("inventory") ? (
            <ButtonLink href="/inventory" variant="secondary"><IconBox size={15} /> Inventory</ButtonLink>
          ) : undefined
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="At the counter" value={stats.prescriptions_waiting} tone="warn" icon={<IconRx size={16} />}
              hint="Pending or part dispensed" />
        <Stat label="Fully dispensed" value={stats.fully_dispensed} tone="ok" icon={<IconCheck size={16} />} />
        <Stat label="Units out" value={stats.dispensed_units} icon={<IconPill size={16} />}
              hint="Across every dispense transaction" />
        {/* a money figure, so the practice admin's; the server leaves it out for anyone else */}
        {stats.dispensed_value !== undefined && (
          <Stat label="Dispensed value" value={currency(stats.dispensed_value)} icon={<IconBox size={16} />}
                hint="At cost price, from the ledger" />
        )}
      </section>

      <Tabs
        className="mb-5 mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "counter", label: "Dispensing counter", icon: <IconPill size={15} />, count: counter.length },
          { value: "history", label: "Ledger", icon: <IconList size={15} />, count: selectInventoryTx(db, t).filter((x) => x.type === "dispense").length },
        ]}
      />

      {tab === "counter" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader icon={<IconQueue size={15} />} tone="accent" title="Waiting" subtitle={pluralise(counter.length, "prescription")} />
            <CardBody className="pt-0">
              {counter.length === 0 ? (
                <EmptyState compact icon={<IconCheck size={20} />} title="Counter is clear"
                            body="Every prescription written has been dispensed in full." />
              ) : (
                <ul className="space-y-1.5">
                  {counter.map((rx) => {
                    const on = rx.id === selected?.id;
                    return (
                      <li key={rx.id}>
                        <button
                          onClick={() => setSelectedId(rx.id)}
                          className={cn(
                            "w-full rounded-[var(--r)] border p-2.5 text-left transition-all duration-150",
                            on ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-ink-3/40 hover:bg-hover",
                          )}
                        >
                          <PatientRef id={rx.patient_id} name={rx.patient_name} size="sm" sub={rx.items.map((i) => i.medicine).join(", ")} />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="tnum font-mono text-micro text-ink-3">
                              {formatDate(rx.created_at.slice(0, 10))}
                            </span>
                            <StatusPill kind="prescription" status={rx.status} size="sm" dot={false} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {selected ? (
            <DispensePanel key={selected.id} rx={selected} onDone={() => {
              const next = counter.find((r) => r.id !== selected.id);
              setSelectedId(next?.id ?? null);
            }} />
          ) : (
            <Card><EmptyState icon={<IconPill size={20} />} title="Nothing selected"
                              body="Pick a prescription from the list to dispense against it." /></Card>
          )}
        </div>
      )}

      {tab === "history" && (
        <Card className="overflow-hidden">
          <CardHeader icon={<IconPill size={15} />} tone="ok" title="Dispense transactions" hint="Every hand-over as it hit the inventory ledger." />
          <TableWrap>
            <Table>
              <THead>
                <tr><TH>When</TH><TH>Item</TH><TH>Batch</TH><TH>For</TH><TH>By</TH><TH align="right">Handed over</TH></tr>
              </THead>
              <TBody>
                {selectInventoryTx(db, t).filter((x) => x.type === "dispense")
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((tx) => {
                    const item = selectInventoryItems(db, t).find((i) => i.id === tx.item_id);
                    return (
                      <TR key={tx.id}>
                        <TD className="tnum whitespace-nowrap text-label text-ink-2">{formatStamp(tx.at)}</TD>
                        <TD>{item?.name ?? tx.item_id}</TD>
                        <TD className="tnum font-mono text-label text-ink-2">{tx.batch_no}</TD>
                        <TD><StockReference tx={tx} /></TD>
                        <TD className="text-ink-2">{userName(db, tx.actor_id)}</TD>
                        <TD align="right" className="font-medium">{Math.abs(tx.qty)}</TD>
                      </TR>
                    );
                  })}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

function DispensePanel({ rx, onDone }: { rx: Prescription; onDone: () => void }) {
  const { session, dispense, hasFeature, can, notify } = useApp();

  /* The clinic bills, and this person is allowed to take the money. Without
     both, the window hands over the medicine and nothing else. */
  const billsHere = hasFeature("billing") && can("billing:write");
  /* Two steps at one window: hand the medicine over, then ask for the money. */
  const [busy, setBusy] = React.useState(false);
  const [collecting, setCollecting] = React.useState(false);
  const db = useClinicDb();
  const t = session.tenantId;
  /* The panel shows allergies, which a list row does not carry. */
  const { data: patient } = usePatient(rx.patient_id);

  const [lines, setLines] = React.useState<Record<string, { qty: number; batch: string }>>(() =>
    Object.fromEntries(rx.items.map((it) => {
      const batches = it.item_id ? batchesFor(db, it.item_id).filter((b) => b.qty > 0) : [];
      return [it.id, { qty: Math.max(0, it.qty - it.dispensed_qty), batch: batches[0]?.batch_no ?? "—" }];
    })));

  const anything = Object.values(lines).some((l) => l.qty > 0);

  const shortfalls = rx.items.filter((it) => {
    if (!it.item_id) return false;
    const want = lines[it.id]?.qty ?? 0;
    return want > stockLevel(db, t, it.item_id);
  });

  return (
    <Card>
      <CardHeader
        icon={<IconRx size={15} />} tone="violet" title={patient?.full_name ?? "Prescription"}
        subtitle={`${formatDate(rx.created_at.slice(0, 10), "long")} · ${userName(db, rx.doctor_id)}`}
        actions={<StatusPill kind="prescription" status={rx.status} size="sm" />}
      />
      <CardBody className="space-y-5">
        {patient && (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <PatientChip patient={patient} className="flex-1" />
            <AllergyFlag patient={patient} />
          </div>
        )}

        {/* What the window is owed, before anything is handed over. Somebody
            who came back only to pay is served from here, without dispensing
            anything they have already had. */}
        {hasFeature("billing") && (
          <PatientAccountSummary patientId={rx.patient_id} only="pharmacy" />
        )}

        <div>
          <Legend>Lines to hand over</Legend>
          <ul className="space-y-3">
            {rx.items.map((it) => {
              const remaining = it.qty - it.dispensed_qty;
              const batches = it.item_id ? batchesFor(db, it.item_id) : [];
              const level = it.item_id ? stockLevel(db, t, it.item_id) : null;
              const line = lines[it.id];
              const short = level != null && line.qty > level;
              return (
                <li key={it.id} className="rounded-[var(--r)] border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body font-medium text-ink">
                      {it.medicine} <span className="text-label font-normal text-ink-3">{it.strength}</span>
                    </p>
                    <StatusPill kind="prescription" status={it.status} size="sm" dot={false} />
                  </div>
                  <p className="mt-0.5 text-label text-ink-2">{it.dosage} · {it.frequency} · {it.duration}</p>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <label className="mb-1.5 block text-caption font-medium text-ink">Quantity</label>
                      <NumberInput
                        min={0}
                        max={remaining}
                        value={line.qty}
                        disabled={remaining === 0}
                        onChange={(qty) =>
                          setLines((p) => ({ ...p, [it.id]: { ...p[it.id], qty } }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-caption font-medium text-ink">Batch</label>
                      {batches.length ? (
                        <Select
                          value={line.batch}
                          onChange={(e) => setLines((p) => ({ ...p, [it.id]: { ...p[it.id], batch: e.target.value } }))}
                        >
                          {batches.map((b) => (
                            <option key={b.batch_no} value={b.batch_no}>
                              {b.batch_no} · {b.qty} left · expires {formatDate(b.expiry)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input value="Not stocked here" disabled />
                      )}
                    </div>
                    <div className="pb-2">
                      <p className="tnum font-mono text-caption text-ink-3">
                        {it.dispensed_qty}/{it.qty} done
                        {level != null && <span className={short ? "ml-2 text-critical-text" : "ml-2"}>· {level} in stock</span>}
                      </p>
                    </div>
                  </div>

                  <Meter className="mt-2.5" value={it.dispensed_qty} max={it.qty}
                         tone={it.dispensed_qty >= it.qty ? "ok" : it.dispensed_qty > 0 ? "info" : "warn"} />
                </li>
              );
            })}
          </ul>
        </div>

        {shortfalls.length > 0 && (
          <p className="flex items-start gap-2 rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-2.5 text-label text-critical-text">
            <IconAlert size={15} className="mt-px shrink-0" />
            Stock would go negative on {shortfalls.map((s) => s.medicine).join(", ")}. Reduce the quantity or record a purchase first.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <p className="text-caption leading-snug text-ink-3">
            What you hand over comes out of stock.
            {hasFeature("billing") && " What was handed over then becomes a charge at the pharmacy counter."}
          </p>
          <Button
            variant="primary"
            disabled={busy || !anything || shortfalls.length > 0}
            onClick={async () => {
              setBusy(true);
              try {
                await dispense(rx.id, rx.items.map((it) => ({
                  itemId: it.id, qty: lines[it.id]?.qty ?? 0, batch_no: lines[it.id]?.batch ?? "—",
                })).filter((l) => l.qty > 0));
              } catch {
                /* the refusal is already a toast; the panel stays as it was */
                setBusy(false);
                return;
              }
              setBusy(false);
              notify({ tone: "ok", title: "Dispensed", body: "Prescription updated and stock drawn from the ledger." });
              /* Money comes second, and only where the clinic bills at all. The
                 dialogue reads the account fresh, so it charges for what was
                 just handed over rather than what this panel thinks. */
              if (billsHere) setCollecting(true);
              else onDone();
            }}
          >
            <IconCheck size={15} /> {billsHere ? "Dispense and bill" : "Dispense"}
          </Button>
        </div>
      </CardBody>

      <CounterPayment
        open={collecting}
        onClose={() => { setCollecting(false); onDone(); }}
        patientId={rx.patient_id}
        department="pharmacy"
      />
    </Card>
  );
}
