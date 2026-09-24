"use client";

import * as React from "react";
import { usePrescriptionPage, useUsers } from "@/lib/query/hooks";
import { useDebounced } from "@/lib/debounce";
import { formatDate, pluralise } from "@/lib/format";
import type { Prescription } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { EmptyState, Meter } from "@/components/ui/misc";
import { SearchInput } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { FeatureGate } from "@/components/domain/gates";
import { StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { PrescriptionDetailModal } from "@/components/domain/prescription-detail";
import { IconRx } from "@/components/ui/icons";

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
  const [opened, setOpened] = React.useState<Prescription | null>(null);
  const [tab, setTab] = React.useState<Tab>("all");
  const [q, setQ] = React.useState("");
  const term = useDebounced(q);
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState({ id: "created_at", desc: true });

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
        title="Prescriptions"
        description="Written from the consultation and stored once. The pharmacy reads these rows directly rather than keeping a copy — which is why a clinic without a pharmacy still prescribes normally."
        meta={
          <>
            <span className="text-label text-ink-2">{pluralise(counts.all, "prescription")}</span>
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
          onRowClick={(rx) => setOpened(rx)}
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

      <PrescriptionDetailModal prescription={opened} onClose={() => setOpened(null)} />
    </>
  );
}
