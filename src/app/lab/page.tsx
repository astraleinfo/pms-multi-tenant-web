"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useLabOrder, useLabOrderPage, useLabStats, useUsers } from "@/lib/query/hooks";
import { useDebounced } from "@/lib/debounce";

import { formatDate, pluralise } from "@/lib/format";
import type { LabOrder, LabResultLine } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Card, Legend } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { Drawer } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import { StatusPill } from "@/components/domain/status";
import { PatientChip, PatientRef } from "@/components/domain/patient";
import {
  IconAlert, IconCheck, IconFlask, IconPlay, IconPlus, IconShield, IconTrash,
} from "@/components/ui/icons";

type Tab = "open" | "ordered" | "pending" | "resulted" | "verified";

const PAGE_SIZE = 10;

/** Column id → the sort key the API understands. Anything else is not sortable. */
const SORT_KEYS: Record<string, string> = {
  ordered_at: "ordered_at",
  test_name: "test_name",
  panel: "panel",
  status: "status",
};

/** A few sensible analyte skeletons so result entry is not a blank sheet. */
const TEMPLATES: Record<string, LabResultLine[]> = {
  FBC: [
    { analyte: "Haemoglobin", value: "", unit: "g/dL", reference: "13.0–17.0", flag: "normal" },
    { analyte: "White cell count", value: "", unit: "10⁹/L", reference: "4.0–11.0", flag: "normal" },
    { analyte: "Platelets", value: "", unit: "10⁹/L", reference: "150–400", flag: "normal" },
  ],
  HBA1C: [{ analyte: "HbA1c", value: "", unit: "mmol/mol", reference: "20–41", flag: "normal" }],
  CRP: [{ analyte: "C-reactive protein", value: "", unit: "mg/L", reference: "< 5", flag: "normal" }],
};

const blankLine = (): LabResultLine => ({ analyte: "", value: "", unit: "", reference: "", flag: "normal" });

const col = columnHelperFor<LabOrder>();

const labColumns = col.columns([
  col.accessor("ordered_at", {
    header: "Ordered",
    cell: ({ getValue }) => (
      <>
        <span className="tnum block font-mono text-[0.8125rem] text-ink">{formatDate(getValue().slice(0, 10))}</span>
        <span className="tnum block font-mono text-[0.75rem] text-ink-3">{getValue().slice(11)}</span>
      </>
    ),
  }),
  col.accessor((o) => o.patient_id, {
    id: "patient", header: "Patient", enableSorting: false,
    cell: ({ row }) => <LabPatient order={row.original} />,
  }),
  col.accessor("test_name", {
    header: "Test",
    cell: ({ row }) => (
      <>
        <span className="block text-ink">{row.original.test_name}</span>
        <span className="tnum block font-mono text-[0.75rem] text-ink-3">{row.original.test_code}</span>
      </>
    ),
  }),
  col.accessor("panel", { header: "Panel", cell: ({ getValue }) => <span className="text-ink-2">{getValue()}</span> }),
  col.accessor((o) => o.ordered_by, {
    id: "requested", header: "Requested by", enableSorting: false,
    cell: ({ row }) => <LabRequester id={row.original.ordered_by} />,
  }),
  col.accessor("status", {
    header: "Status",
    meta: { align: "right" },
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-2">
        {row.original.results.some((r) => r.flag !== "normal") && (
          <Badge tone="critical" size="sm" dot={false}>Flagged</Badge>
        )}
        <StatusPill kind="lab" status={row.original.status} size="sm" dot={false} />
      </div>
    ),
  }),
]);

function LabPatient({ order }: { order: LabOrder }) {
  return (
    <PatientRef id={order.patient_id} name={order.patient_name} mrn={order.patient_mrn} size="sm" />
  );
}

function LabRequester({ id }: { id: string }) {
  const { data: users = [] } = useUsers();
  return <span className="text-ink-2">{users.find((u) => u.id === id)?.name ?? "—"}</span>;
}

export default function LabPage() {
  return (
    <RoleGate allow={["lab_tech", "doctor"]}>
      <FeatureGate feature="lab">
        <Lab />
      </FeatureGate>
    </RoleGate>
  );
}

function Lab() {
  const [tab, setTab] = React.useState<Tab>("open");
  const [q, setQ] = React.useState("");
  const term = useDebounced(q);
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState({ id: "ordered_at", desc: true });
  const [open, setOpen] = React.useState<LabOrder | null>(null);

  const stats = useLabStats();

  /* any change to what is being asked for starts again at the first page */
  React.useEffect(() => { setPage(0); }, [term, tab, sort]);

  /* "Open" is one state machine away from any single status, so the bench's own
     view is a flag the database understands rather than a filter over rows the
     browser has collected. */
  const query = React.useMemo(() => ({
    status: tab === "open" ? undefined : tab,
    unverified: tab === "open" || undefined,
    search: term || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: SORT_KEYS[sort.id] ?? "ordered_at",
    order: (sort.desc ? "desc" : "asc") as "asc" | "desc",
  }), [tab, term, page, sort]);

  const { data: result, isFetching } = useLabOrderPage(query);
  const rows = result?.items ?? [];
  const total = result?.total ?? 0;

  /* The drawer reads the order by id, so it stays in step as the order moves
     through its states — including off this page, which is what verifying one
     from the Open tab does. */

  return (
    <>
      <PageHeader
        eyebrow="Feature module"
        title="Lab"
        description="Orders are raised from an encounter and travel through one state machine. Results stay invisible to the patient record until a technician verifies them."
        meta={
          <>
            <span className="text-[0.8125rem] text-ink-2">{pluralise(stats.total, "order")}</span>
            {stats.abnormal > 0 && (
              <Badge tone="critical" size="sm"><IconAlert size={11} /> {stats.abnormal} with flagged analytes</Badge>
            )}
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ordered" value={stats.ordered} icon={<IconFlask size={16} />} hint="Not yet started" />
        <Stat label="In the lab" value={stats.pending} tone="warn" icon={<IconPlay size={16} />} hint="Sample being processed" />
        <Stat label="Awaiting sign-off" value={stats.resulted} tone="accent" icon={<IconShield size={16} />}
              hint="Held back from the record" />
        <Stat label="Verified" value={stats.verified} tone="ok" icon={<IconCheck size={16} />} hint="Released to the patient" />
      </section>

      <Tabs
        className="mb-5 mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "open", label: "Open", count: stats.total - stats.verified },
          { value: "ordered", label: "Ordered", count: stats.ordered },
          { value: "pending", label: "In the lab", count: stats.pending },
          { value: "resulted", label: "Awaiting sign-off", count: stats.resulted },
          { value: "verified", label: "Verified", count: stats.verified },
        ]}
      />

      <Card className="overflow-hidden">
        <DataTable
          columns={labColumns}
          data={rows}
          getRowId={(o) => o.id}
          searchPlaceholder="Patient, test or panel"
          pageSize={PAGE_SIZE}
          onRowClick={(o) => setOpen(o)}
          minWidth="54rem"
          empty={<EmptyState icon={<IconFlask size={20} />} title="Nothing in this state"
                             body="Orders raised from a consultation land here." />}
          server={{
            total,
            page,
            onPageChange: setPage,
            search: q,
            onSearchChange: setQ,
            sort,
            onSortChange: setSort,
            loading: isFetching,
          }}
        />
      </Card>

      {open && <OrderDrawer key={open.id} order={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function OrderDrawer({ order: opened, onClose }: { order: LabOrder; onClose: () => void }) {
  const { startLabOrder, saveLabResults, verifyLabOrder, notify } = useApp();
  /* the row that opened this stands in until the read lands */
  const { data: fresh } = useLabOrder(opened.id);
  const order = fresh ?? opened;
  /* the drawer needs two names, which is the staff list — not the order book */
  const { data: users } = useUsers();
  const nameOf = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? "—";


  const [results, setResults] = React.useState<LabResultLine[]>(
    order.results.length ? order.results : TEMPLATES[order.test_code] ?? [blankLine()],
  );

  const patch = (i: number, p: Partial<LabResultLine>) =>
    setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const editable = order.status === "pending" || order.status === "resulted";

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={order.test_name}
      subtitle={`${order.patient_name} · ${order.patient_mrn}`}
      footer={
        <>
          {order.status === "ordered" && (
            <Button variant="primary" onClick={() => {
              startLabOrder(order.id);
              notify({ tone: "ok", title: "Sample accepted", body: "The order is now with the lab." });
            }}>
              <IconPlay size={14} /> Accept sample
            </Button>
          )}
          {editable && (
            <Button
              variant="secondary"
              onClick={() => {
                saveLabResults(order.id, results.filter((r) => r.analyte.trim()));
                notify({ tone: "ok", title: "Results saved", body: "Still held back until a technician verifies them." });
              }}
            >
              Save results
            </Button>
          )}
          {order.status === "resulted" && (
            <Button variant="primary" onClick={() => {
              verifyLabOrder(order.id);
              notify({ tone: "ok", title: "Verified and released", body: "The result is now visible on the patient record." });
            }}>
              <IconShield size={14} /> Verify and release
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusPill kind="lab" status={order.status} />
          <span className="tnum font-mono text-[0.75rem] text-ink-3">{order.test_code} · {order.panel}</span>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <KV label="Ordered" value={order.ordered_at} mono />
          <KV label="Requested by" value={nameOf(order.ordered_by)} />
          {order.resulted_at && <KV label="Resulted" value={order.resulted_at} mono />}
          {order.verified_at && <KV label="Verified" value={`${order.verified_at} · ${nameOf(order.verified_by)}`} />}
        </dl>

        {order.note && (
          <div className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">Clinical question</p>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-ink">{order.note}</p>
          </div>
        )}

        <div>
          <Legend>Results</Legend>

          {order.status === "ordered" && (
            <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-6 text-center text-[0.8125rem] text-ink-3">
              Accept the sample before entering results.
            </p>
          )}

          {order.status === "verified" && (
            <TableWrap>
              <Table>
                <THead>
                  <tr><TH>Analyte</TH><TH>Value</TH><TH>Reference</TH><TH align="right">Flag</TH></tr>
                </THead>
                <TBody>
                  {order.results.map((r) => (
                    <TR key={r.analyte}>
                      <TD>{r.analyte}</TD>
                      <TD className="tnum font-mono">{r.value} {r.unit}</TD>
                      <TD className="text-ink-3">{r.reference}</TD>
                      <TD align="right">
                        <Badge tone={r.flag === "normal" ? "ok" : r.flag === "high" ? "critical" : "warn"} size="sm">
                          {r.flag}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}

          {editable && (
            <div className="space-y-2.5">
              {results.map((r, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-[var(--r)] border border-line bg-surface-2 p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_minmax(0,1fr)_7rem_auto]">
                  <Input placeholder="Analyte" value={r.analyte} onChange={(e) => patch(i, { analyte: e.target.value })} />
                  <Input placeholder="Value" value={r.value} onChange={(e) => patch(i, { value: e.target.value })} />
                  <Input placeholder="Unit" value={r.unit} onChange={(e) => patch(i, { unit: e.target.value })} />
                  <Input placeholder="Reference" value={r.reference} onChange={(e) => patch(i, { reference: e.target.value })} />
                  <Select value={r.flag} onChange={(e) => patch(i, { flag: e.target.value as LabResultLine["flag"] })}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                  </Select>
                  <Button variant="ghost" size="icon" aria-label="Remove row"
                          onClick={() => setResults((p) => p.filter((_, idx) => idx !== i))}>
                    <IconTrash size={14} />
                  </Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setResults((p) => [...p, blankLine()])}>
                <IconPlus size={14} /> Add analyte
              </Button>
            </div>
          )}
        </div>

        <p className="flex items-start gap-2 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-2">
          <IconShield size={14} className="mt-px shrink-0 text-ink-3" />
          Verification is the gate: <code className="font-mono text-[0.6875rem]">GET /encounters/&#123;id&#125;/lab-results</code> returns
          verified rows only, so a saved-but-unsigned result never reaches the clinician's record view.
        </p>
      </div>
    </Drawer>
  );
}
