"use client";

import * as React from "react";
import { useLabOrderPage, useLabStats, useUsers } from "@/lib/query/hooks";
import { useDebounced } from "@/lib/debounce";
import { formatDate, pluralise } from "@/lib/format";
import type { LabOrder } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { RoleGate } from "@/components/domain/gates";
import { StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { LabOrderModal } from "@/components/domain/lab-order-detail";
import { IconAlert, IconCheck, IconFlask, IconPlay, IconShield } from "@/components/ui/icons";

type Tab = "open" | "ordered" | "pending" | "resulted" | "verified";

const PAGE_SIZE = 10;

/** Column id → the sort key the API understands. Anything else is not sortable. */
const SORT_KEYS: Record<string, string> = {
  ordered_at: "ordered_at",
  test_name: "test_name",
  panel: "panel",
  status: "status",
};

const col = columnHelperFor<LabOrder>();

const labColumns = col.columns([
  col.accessor("ordered_at", {
    header: "Ordered",
    cell: ({ getValue }) => (
      <>
        <span className="tnum block font-mono text-label text-ink">{formatDate(getValue().slice(0, 10))}</span>
        <span className="tnum block font-mono text-caption text-ink-3">{getValue().slice(11)}</span>
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
        <span className="tnum block font-mono text-caption text-ink-3">{row.original.test_code}</span>
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
      <Lab />
    </RoleGate>
  );
}

function Lab() {
  const [tab, setTab] = React.useState<Tab>("open");
  const [q, setQ] = React.useState("");
  const term = useDebounced(q);
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState({ id: "ordered_at", desc: true });
  const [opened, setOpened] = React.useState<LabOrder | null>(null);

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

  return (
    <>
      <PageHeader
        title="Lab"
        description="Tests ordered from a consultation. A result reaches the patient’s record only once it has been verified."
        meta={
          <>
            <span className="text-label text-ink-2">{pluralise(stats.total, "order")}</span>
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
          onRowClick={(o) => setOpened(o)}
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

      <LabOrderModal order={opened} onClose={() => setOpened(null)} />
    </>
  );
}
