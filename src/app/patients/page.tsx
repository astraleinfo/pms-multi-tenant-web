"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { useDebounced } from "@/lib/debounce";
import type { Patient } from "@/lib/types";
import { useAnalytics, usePatientPage } from "@/lib/query/hooks";
import { age, formatDate, pluralise, relativeDay } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Button, ButtonLink, Segmented } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { CardsSkeleton } from "@/components/ui/loader";
import { FeatureGate } from "@/components/domain/gates";
import { PatientChip, AllergyFlag } from "@/components/domain/patient";
import {
  IconArrowRight, IconChevronLeft, IconChevronRight, IconGrid, IconList, IconPlus, IconUsers,
} from "@/components/ui/icons";

const col = columnHelperFor<Patient>();
const PAGE_SIZE = 10;

/** Column id → the sort key the API understands. Anything else is not sortable. */
const SORT_KEYS: Record<string, "full_name" | "mrn" | "dob" | "registered_at" | "last_visit"> = {
  full_name: "full_name",
  mrn: "mrn",
  last_visit: "last_visit",
};

/** Defined once, outside render — the engine expects stable inputs. */
const patientColumns = col.columns([
  col.accessor("full_name", {
    header: "Patient",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <PatientChip patient={row.original} sub={`${age(row.original.dob)} years · ${row.original.sex}`} />
        {row.original.tags?.map((tag) => <Badge key={tag} tone="neutral" size="sm">{tag}</Badge>)}
      </div>
    ),
  }),
  col.accessor("mrn", {
    header: "Record",
    cell: ({ getValue }) => <span className="tnum font-mono text-[0.8125rem] text-ink-2">{getValue()}</span>,
  }),
  col.accessor("phone", {
    header: "Contact",
    enableSorting: false,
    cell: ({ row }) => (
      <>
        <span className="tnum block font-mono text-[0.8125rem] text-ink">{row.original.phone}</span>
        {row.original.email && <span className="block truncate text-[0.75rem] text-ink-3">{row.original.email}</span>}
      </>
    ),
  }),
  col.accessor("allergies", {
    header: "Safety",
    enableSorting: false,
    cell: ({ row }) => <AllergyFlag patient={row.original} />,
  }),
  col.accessor((p) => p.last_visit ?? "", {
    id: "last_visit",
    header: "Last seen",
    meta: { align: "right" },
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-ink-2">
        {row.original.last_visit ? relativeDay(row.original.last_visit) : <span className="text-ink-3">Never</span>}
      </span>
    ),
  }),
]);

export default function PatientsPage() {
  return (
    <FeatureGate feature="patient">
      <PatientList />
    </FeatureGate>
  );
}

type Filter = "all" | "seen_today" | "new" | "allergies";

function PatientList() {
  const router = useRouter();
  const { today } = useApp();

  const [q, setQ] = React.useState("");
  const term = useDebounced(q, 250);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [view, setView] = React.useState<"table" | "cards">("table");
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState({ id: "last_visit", desc: true });

  /* a six-column table is the wrong shape for a phone — open as cards there */
  React.useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("cards");
  }, []);

  /* any change to what is being asked for starts again at the first page */
  React.useEffect(() => { setPage(0); }, [term, filter, sort]);

  /**
   * The query is the whole request: search, filter, sort and page all go to the
   * database, which returns this page and how many rows matched. The browser
   * never holds the register — which is what lets a clinic have fifty thousand
   * patients without this screen changing at all.
   */
  const query = React.useMemo(() => ({
    search: term || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: SORT_KEYS[sort.id] ?? "registered_at",
    order: (sort.desc ? "desc" : "asc") as "asc" | "desc",
    seen_on: filter === "seen_today" ? today : undefined,
    registered_since: filter === "new" ? `${today.slice(0, 7)}-01` : undefined,
    with_allergies: filter === "allergies" ? true : undefined,
  }), [term, page, sort, filter, today]);

  const { data: result, isFetching, isPending } = usePatientPage(query);
  const { data: analytics } = useAnalytics(30);

  const rows = result?.items ?? [];
  const total = result?.total ?? 0;
  const register = analytics?.core;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Register"
        title="Patients"
        description="The record is tenant-scoped: searching, sorting and paging all happen in the database, under this clinic's row-level policy, so the search below can only ever see this clinic's rows — and only ever sends the page you are looking at."
        actions={
          <ButtonLink href="/patients/new" variant="primary">
            <IconPlus size={15} /> Register patient
          </ButtonLink>
        }
        meta={
          <>
            <span className="text-[0.8125rem] text-ink-2">
              {pluralise(register?.patients ?? 0, "patient")} on file
            </span>
            <span className="text-[0.8125rem] text-ink-2">{register?.seen_today ?? 0} seen today</span>
            <span className="text-[0.8125rem] text-ink-2">{register?.never_visited ?? 0} never visited</span>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5" data-tour="patients-search">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, record number or phone"
          wrapperClassName="min-w-[220px] flex-1 max-w-md"
        />
        <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-9.5 w-auto">
          <option value="all">Everyone</option>
          <option value="seen_today">Seen today</option>
          <option value="new">Registered this month</option>
          <option value="allergies">Has recorded allergies</option>
        </Select>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: <IconList size={15} />, title: "Table" },
            { value: "cards", label: <IconGrid size={15} />, title: "Cards" },
          ]}
        />
      </div>

      {total === 0 && !isPending ? (
        <Card>
          <EmptyState
            icon={<IconUsers size={20} />}
            title={isFetching ? "Searching…" : "No patient matches"}
            body={term ? `Nothing in this clinic matches “${term}”.` : "Adjust the filter, or register the first patient."}
            action={<ButtonLink href="/patients/new" size="sm" variant="primary"><IconPlus size={14} /> Register patient</ButtonLink>}
          />
        </Card>
      ) : view === "table" ? (
        <Card className="overflow-hidden">
          <CardHeader
            title={pluralise(total, "record")}
            subtitle="Sorting and paging are queries, not filters over something already loaded."
          />
          <DataTable
            columns={patientColumns}
            data={rows}
            getRowId={(p) => p.id}
            pageSize={PAGE_SIZE}
            onRowClick={(p) => router.push(`/patients/${p.id}`)}
            minWidth="52rem"
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
      ) : isPending ? (
        <CardsSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => (
              <Card key={p.id} interactive as="article" className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <PatientChip patient={p} size="lg" href={`/patients/${p.id}`} sub={`${p.mrn} · ${age(p.dob)} years`} />
                  <IconArrowRight size={15} className="mt-1 shrink-0 text-ink-3" />
                </div>
                <div className="mt-3.5 space-y-2 border-t border-line-soft pt-3">
                  <AllergyFlag patient={p} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-ink-3">
                    <span className="tnum font-mono">{p.phone}</span>
                    <span>{p.last_visit ? relativeDay(p.last_visit) : "No visits yet"}</span>
                  </div>
                  <p className="text-[0.75rem] text-ink-3">
                    Registered {formatDate(p.registered_at, "long")}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="tnum text-[0.75rem] text-ink-3">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary" size="icon-sm" aria-label="Previous page"
                  disabled={page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))}
                >
                  <IconChevronLeft size={15} />
                </Button>
                <span className="tnum px-1 text-[0.75rem] text-ink-2">{page + 1} / {pages}</span>
                <Button
                  variant="secondary" size="icon-sm" aria-label="Next page"
                  disabled={page + 1 >= pages} onClick={() => setPage((n) => n + 1)}
                >
                  <IconChevronRight size={15} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
