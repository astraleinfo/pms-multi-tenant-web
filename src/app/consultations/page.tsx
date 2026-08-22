"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Encounter } from "@/lib/types";
import { useTenant } from "@/lib/store/app-store";
import { useEncounterPage, useQueue, useUsers } from "@/lib/query/hooks";
import { useDebounced } from "@/lib/debounce";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { formatDate, pluralise, relativeDay } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Numeral } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { SearchInput } from "@/components/ui/field";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import { PatientRef } from "@/components/domain/patient";
import { IconArrowRight, IconPlus, IconStethoscope } from "@/components/ui/icons";

const PAGE_SIZE = 10;

/** Column id → the sort key the API understands. Anything else is not sortable. */
const SORT_KEYS: Record<string, string> = {
  date: "date",
  diagnosis: "diagnosis",
  follow_up: "follow_up",
  status: "status",
};

const col = columnHelperFor<Encounter>();

/** Defined once, outside render — the engine expects stable inputs. */
const encounterColumns = col.columns([
  col.accessor("date", {
    header: "Date",
    cell: ({ row }) => (
      <>
        <span className="tnum block font-mono text-[0.8125rem] text-ink">{formatDate(row.original.date)}</span>
        <span className="block text-[0.75rem] text-ink-3">{relativeDay(row.original.date)}</span>
      </>
    ),
  }),
  col.accessor((e) => e.patient_id, {
    id: "patient", header: "Patient", enableSorting: false,
    cell: ({ row }) => (
      <PatientRef id={row.original.patient_id} name={row.original.patient_name}
                  mrn={row.original.patient_mrn} size="sm" />
    ),
  }),
  col.accessor("diagnosis", {
    header: "Diagnosis",
    meta: { width: 280 },
    cell: ({ row }) => (
      <>
        <span className="block truncate text-ink">{row.original.diagnosis || "—"}</span>
        <span className="block truncate text-[0.75rem] text-ink-3">{row.original.chief_complaint}</span>
      </>
    ),
  }),
  col.accessor((e) => e.doctor_id, {
    id: "clinician", header: "Clinician", enableSorting: false,
    cell: ({ row }) => <EncounterClinician id={row.original.doctor_id} />,
  }),
  col.accessor((e) => e.follow_up_days ?? 0, {
    id: "follow_up", header: "Follow-up",
    cell: ({ row }) => (
      <span className="text-ink-2">{row.original.follow_up_days ? `${row.original.follow_up_days} days` : "—"}</span>
    ),
  }),
  col.accessor("status", {
    header: "Status",
    meta: { align: "right" },
    cell: ({ getValue }) => (
      <Badge tone={getValue() === "signed" ? "ok" : "warn"} size="sm" dot>{getValue()}</Badge>
    ),
  }),
]);

/** The row names its patient but not its clinician, so this one is a lookup —
    over the staff list, which is small, rather than over the case book. */
function EncounterClinician({ id }: { id: string }) {
  const { data: users } = useUsers();
  return <span className="text-ink-2">{users.find((u) => u.id === id)?.name ?? "—"}</span>;
}

export default function ConsultationsPage() {
  return (
    <RoleGate allow={["doctor"]}>
      <FeatureGate feature="consultation">
        <Consultations />
      </FeatureGate>
    </RoleGate>
  );
}

function Consultations() {
  const router = useRouter();
  const { tenant } = useTenant();
  const { data: queue } = useQueue();

  const [q, setQ] = React.useState("");
  const term = useDebounced(q);
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState({ id: "date", desc: true });

  /* any change to what is being asked for starts again at the first page */
  React.useEffect(() => { setPage(0); }, [term, sort]);

  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;
  const inRoom = (queue ?? []).filter((x) => x.status === "in_consultation" || x.status === "called");

  /* The query is the whole request: the search term, the sort and the page all
     go to the database, which answers with those ten rows and how many matched.
     A clinic's whole case book never reaches the browser. */
  const query = React.useMemo(() => ({
    search: term || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: SORT_KEYS[sort.id] ?? "date",
    order: (sort.desc ? "desc" : "asc") as "asc" | "desc",
  }), [term, page, sort]);

  const { data: result, isFetching, isPending } = useEncounterPage(query);
  const rows = result?.items ?? [];
  const total = result?.total ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={clinical.label}
        title="Consultations"
        description={`Every encounter is the same row in the same table. What changes with the clinical type is the payload — here that means ${clinical.examLabel.toLowerCase()}.`}
        actions={
          <ButtonLink href="/consultations/new" variant="primary">
            <IconPlus size={15} /> New encounter
          </ButtonLink>
        }
      />

      {inRoom.length > 0 && (
        <Card className="mb-5 border-accent-border">
          <CardHeader
            icon={<IconStethoscope size={16} />}
            title="With you now"
            subtitle="Tokens currently called or in consultation."
          />
          <CardBody className="pt-0">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {inRoom.map((qe) => {
                return (
                  <li key={qe.id} className="flex items-center gap-3 rounded-[var(--r)] border border-line bg-surface-2 p-3">
                    <Numeral tone="accent">{String(qe.token_no).padStart(2, "0")}</Numeral>
                    <span className="min-w-0 flex-1">
                      <PatientRef id={qe.patient_id} name={qe.patient_name} sub={qe.reason} />
                    </span>
                    <ButtonLink href={`/consultations/new?queue=${qe.id}`} size="sm" variant="primary">
                      Record <IconArrowRight size={13} />
                    </ButtonLink>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Patient, diagnosis or complaint"
          wrapperClassName="min-w-[220px] flex-1 max-w-md"
        />
        <span className="text-[0.8125rem] text-ink-3">{pluralise(total, "encounter")}</span>
      </div>

      <Card className="overflow-hidden">
        {total === 0 && !isPending ? (
          <EmptyState
            icon={<IconStethoscope size={20} />}
            title={isFetching ? "Searching…" : q ? "No encounter matches" : "No encounters recorded"}
            body={q
              ? `Nothing in this clinic matches “${q}”.`
              : "Start one from the queue, or open a blank encounter for a patient."}
            action={<ButtonLink href="/consultations/new" size="sm" variant="primary">New encounter</ButtonLink>}
          />
        ) : (
          <DataTable
            columns={encounterColumns}
            data={rows}
            getRowId={(e) => e.id}
            pageSize={PAGE_SIZE}
            onRowClick={(e) => router.push(`/consultations/${e.id}`)}
            minWidth="54rem"
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
        )}
      </Card>

    </>
  );
}
