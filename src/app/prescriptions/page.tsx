"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { usePatient, usePrescriptionPage, useUsers } from "@/lib/query/hooks";
import { useDebounced } from "@/lib/debounce";
import { formatDate, pluralise } from "@/lib/format";
import { openPdfBlob } from "@/lib/pdf";
import type { Prescription } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV, Meter } from "@/components/ui/misc";
import { Drawer } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { FeatureGate } from "@/components/domain/gates";
import { StatusPill } from "@/components/domain/status";
import { AllergyFlag, PatientChip, PatientRef } from "@/components/domain/patient";
import { IconArrowRight, IconPrint, IconRx } from "@/components/ui/icons";

type Tab = "all" | "pending" | "partially_dispensed" | "dispensed";

const PAGE_SIZE = 10;

/** Column id → the sort key the API understands. Anything else is not sortable. */
const SORT_KEYS: Record<string, string> = { created_at: "created_at", status: "status" };

const col = columnHelperFor<Prescription>();

const prescriptionColumns = col.columns([
  col.accessor("created_at", {
    header: "Written",
    cell: ({ getValue }) => (
      <>
        <span className="tnum block font-mono text-label text-ink">{formatDate(getValue().slice(0, 10))}</span>
        <span className="tnum block font-mono text-caption text-ink-3">{getValue().slice(11)}</span>
      </>
    ),
  }),
  col.accessor((rx) => rx.patient_id, {
    id: "patient",
    header: "Patient",
    enableSorting: false,
    cell: ({ row }) => <RxPatient rx={row.original} />,
  }),
  col.accessor((rx) => rx.items.map((i) => i.medicine).join(", "), {
    id: "medicines",
    header: "Medicines",
    /* summed across a row's items — not a column the database can order by */
    enableSorting: false,
    cell: ({ row, getValue }) => (
      <>
        <span className="block max-w-[280px] truncate text-ink">{getValue()}</span>
        <span className="block text-caption text-ink-3">{pluralise(row.original.items.length, "line")}</span>
      </>
    ),
  }),
  col.accessor((rx) => rx.doctor_id, {
    id: "prescriber",
    header: "Prescriber",
    enableSorting: false,
    cell: ({ row }) => <RxPrescriber id={row.original.doctor_id} />,
  }),
  col.accessor((rx) => rx.items.reduce((s2, i) => s2 + i.dispensed_qty, 0) / Math.max(1, rx.items.reduce((s2, i) => s2 + i.qty, 0)), {
    id: "dispensed",
    header: "Dispensed",
    enableSorting: false,
    meta: { width: 160 },
    cell: ({ row }) => {
      const total = row.original.items.reduce((a, i) => a + i.qty, 0);
      const done = row.original.items.reduce((a, i) => a + i.dispensed_qty, 0);
      return (
        <div className="flex items-center gap-2">
          <Meter value={done} max={total} tone={done >= total ? "ok" : done > 0 ? "info" : "warn"} className="w-20" />
          <span className="tnum font-mono text-caption text-ink-3">{done}/{total}</span>
        </div>
      );
    },
  }),
  col.accessor("status", {
    header: "Status",
    meta: { align: "right" },
    cell: ({ getValue }) => <StatusPill kind="prescription" status={getValue()} size="sm" dot={false} />,
  }),
]);

function RxPatient({ rx }: { rx: Prescription }) {
  return <PatientRef id={rx.patient_id} name={rx.patient_name} mrn={rx.patient_mrn} size="sm" />;
}

function RxPrescriber({ id }: { id: string }) {
  const { data: users = [] } = useUsers();
  return <span className="text-ink-2">{users.find((u) => u.id === id)?.name ?? "—"}</span>;
}

export default function PrescriptionsPage() {
  return (
    <FeatureGate feature="prescription">
      <Prescriptions />
    </FeatureGate>
  );
}

function Prescriptions() {
  const { hasFeature, notify } = useApp();
  const { data: users } = useUsers();
  const [tab, setTab] = React.useState<Tab>("all");
  const [q, setQ] = React.useState("");
  const term = useDebounced(q);
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState({ id: "created_at", desc: true });
  const [open, setOpen] = React.useState<Prescription | null>(null);
  const [printing, setPrinting] = React.useState(false);

  const printPrescription = async (encounterId: string) => {
    setPrinting(true);
    try {
      openPdfBlob(await api.getConsultationPdf(encounterId));
    } catch {
      notify({ tone: "warn", title: "Could not generate the print PDF" });
    } finally {
      setPrinting(false);
    }
  };

  /* any change to what is being asked for starts again at the first page */
  React.useEffect(() => { setPage(0); }, [term, tab, sort]);

  /* Tab, search, sort and page are one question, answered in the database. The
     counts come back with the page and describe the whole list, not the tab. */
  const query = React.useMemo(() => ({
    status: tab === "all" ? undefined : tab,
    search: term || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: SORT_KEYS[sort.id] ?? "created_at",
    order: (sort.desc ? "desc" : "asc") as "asc" | "desc",
  }), [tab, term, page, sort]);

  const { data: result, isFetching } = usePrescriptionPage(query);
  const rows = result?.items ?? [];
  const total = result?.total ?? 0;

  /* The drawer shows allergies, which a list row does not carry — so it asks
     for the one patient it is about, rather than the whole register. */
  const { data: patient } = usePatient(open?.patient_id ?? "");

  const byStatus = result?.counts ?? {};
  const counts = {
    all: Object.values(byStatus).reduce((s, n) => s + n, 0),
    pending: byStatus.pending ?? 0,
    partially_dispensed: byStatus.partially_dispensed ?? 0,
    dispensed: byStatus.dispensed ?? 0,
  };



  return (
    <>
      <PageHeader
        eyebrow="Core module"
        title="Prescriptions"
        description="Written from the consultation and stored once. The pharmacy reads these rows directly rather than keeping a copy — which is why a clinic without a pharmacy still prescribes normally."
        meta={
          <>
            <span className="text-label text-ink-2">{pluralise(counts.all, "prescription")}</span>
            <span className="text-label text-ink-2">
              {pluralise(total, "match")} on this filter
            </span>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          className="!border-b-0"
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "pending", label: "Pending", count: counts.pending },
            { value: "partially_dispensed", label: "Part dispensed", count: counts.partially_dispensed },
            { value: "dispensed", label: "Dispensed", count: counts.dispensed },
          ]}
        />
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patient or medicine"
                     wrapperClassName="min-w-[200px] max-w-xs flex-1" />
      </div>

      <Card className="overflow-hidden">
        <DataTable
          columns={prescriptionColumns}
          data={rows}
          getRowId={(rx) => rx.id}
          pageSize={PAGE_SIZE}
          onRowClick={(rx) => setOpen(rx)}
          minWidth="52rem"
          empty={<EmptyState icon={<IconRx size={20} />} title="Nothing here" body="No prescription matches this filter." />}
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

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        width="lg"
        title={patient?.full_name ?? "Prescription"}
        subtitle={open ? `${formatDate(open.created_at.slice(0, 10), "long")} · ${users.find((u) => u.id === open.doctor_id)?.name ?? "—"}` : ""}
        footer={
          open && (
            <>
              <Button variant="ghost" onClick={() => void printPrescription(open.encounter_id)} disabled={printing}>
                <IconPrint size={14} /> {printing ? "Preparing…" : "Print"}
              </Button>
              {hasFeature("pharmacy") && open.status !== "dispensed" && (
                <ButtonLink href="/pharmacy" variant="primary">
                  Dispense at the counter <IconArrowRight size={14} />
                </ButtonLink>
              )}
            </>
          )
        }
      >
        {open && patient && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusPill kind="prescription" status={open.status} />
              <AllergyFlag patient={patient} />
            </div>

            <dl className="grid grid-cols-2 gap-x-4">
              <KV label="Record" value={<span className="tnum font-mono text-label">{patient.mrn}</span>} />
              <KV label="Encounter" value={
                <ButtonLink href={`/consultations/${open.encounter_id}`} variant="ghost" size="sm" className="h-6 px-1.5">
                  Open encounter
                </ButtonLink>
              } />
            </dl>

            <div>
              <p className="mb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Medicines</p>
              <ul className="space-y-2.5">
                {open.items.map((it) => (
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
                    <div className="mt-2.5 flex items-center gap-3">
                      <Meter value={it.dispensed_qty} max={it.qty}
                             tone={it.dispensed_qty >= it.qty ? "ok" : it.dispensed_qty > 0 ? "info" : "warn"} className="flex-1" />
                      <span className="tnum shrink-0 font-mono text-caption text-ink-2">
                        {it.dispensed_qty} of {it.qty}
                      </span>
                    </div>
                    {!it.item_id && (
                      <Badge tone="neutral" size="sm" className="mt-2">Not linked to stock</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
