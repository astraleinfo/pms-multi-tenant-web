"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { BillingDepartment, Invoice } from "@/lib/types";
import { useBillingStats, useInvoicePage } from "@/lib/query/hooks";
import { invoiceTotals } from "@/lib/data/repository";
import { useDebounced } from "@/lib/debounce";

import { currency, formatDate, pluralise, sentenceCase } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Button, Segmented } from "@/components/ui/button";
import { EmptyState, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { SearchInput } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import { DEPARTMENT_LABEL, StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { InvoiceComposer } from "@/components/domain/invoice-composer";
import {
  IconAlert, IconCard, IconCheck, IconPlus, IconReceipt, IconUser
} from "@/components/ui/icons";
import { PatientAccount } from "@/components/domain/patient-account";

type Tab = "all" | "unpaid" | "draft" | "paid" | "void";

const PAGE_SIZE = 10;

/** Column id → the sort key the API understands. Anything else is not sortable.
    `total` and `balance` are sums the database works out, so they sort too. */
const SORT_KEYS: Record<string, string> = {
  number: "number",
  issued_at: "issued_at",
  total: "total",
  balance: "balance",
  status: "status",
};

const col = columnHelperFor<Invoice>();

const invoiceColumns = col.columns([
  col.accessor("number", {
    header: "Invoice",
    cell: ({ row }) => (
      <>
        <span className="tnum block font-mono text-label font-medium text-ink">{row.original.number}</span>
        <span className="block text-caption text-ink-3">{pluralise(row.original.line_items.length, "line")}</span>
      </>
    ),
  }),
  col.accessor((i) => i.patient_id, {
    id: "patient",
    header: "Patient",
    enableSorting: false,
    cell: ({ row }) => <InvoicePatient invoice={row.original} />,
  }),
  col.accessor("issued_at", {
    header: "Issued",
    cell: ({ row }) => (
      <span className="tnum text-label text-ink-2">{formatDate(row.original.issued_at)}</span>
    ),
  }),
  col.accessor("department", {
    header: "Counter",
    enableSorting: false,
    cell: ({ getValue }) => <span className="text-label text-ink-2">{DEPARTMENT_LABEL[getValue()]}</span>,
  }),
  col.accessor((i) => invoiceTotals(i).total, {
    id: "total",
    header: "Total",
    meta: { align: "right" },
    cell: ({ getValue }) => <span className="tnum font-mono">{currency(getValue())}</span>,
  }),
  col.accessor((i) => invoiceTotals(i).balance, {
    id: "balance",
    header: "Balance",
    meta: { align: "right" },
    cell: ({ getValue }) => (
      /* only money still owed is coloured; a settled invoice owes nothing, and says so quietly */
      getValue() > 0.005
        ? <span className="tnum font-medium text-warn-text">{currency(getValue())}</span>
        : <span className="text-ink-3">—</span>
    ),
  }),
  col.accessor("status", {
    header: "Status",
    meta: { align: "right" },
    cell: ({ getValue }) => <StatusPill kind="invoice" status={getValue()} size="sm" dot={false} />,
  }),
]);

/** The invoice row carries the name it needs, so this is a render, not a lookup. */
function InvoicePatient({ invoice }: { invoice: Invoice }) {
  return (
    <PatientRef
      id={invoice.patient_id}
      name={invoice.patient_name}
      mrn={invoice.patient_mrn}
      size="sm"
    />
  );
}

export default function BillingPage() {
  return (
    <RoleGate allow={["receptionist"]}>
      <FeatureGate feature="billing">
        <Billing />
      </FeatureGate>
    </RoleGate>
  );
}

function Billing() {
  const router = useRouter();

  const [tab, setTab] = React.useState<Tab>("all");
  /* The lab and the pharmacy bill separately, so the ledger can be read one
     counter at a time — the database narrows it, not the browser. */
  const [counter, setCounter] = React.useState<BillingDepartment | "all">("all");
  const [q, setQ] = React.useState("");
  const term = useDebounced(q);
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState({ id: "issued_at", desc: true });
  const [compose, setCompose] = React.useState(false);
  /* Two questions, and the screen answers one at a time. "How is the ledger
     doing" is a table of invoices; "somebody is at the desk to pay" is one
     person's account, counter by counter. They want different shapes, so they
     are different views rather than one screen trying to be both. */
  const [view, setView] = React.useState<"ledger" | "account">("ledger");
  const [payingFor, setPayingFor] = React.useState<string | null>(null);

  /* The money is added up in the database, so this page, the reports and the
     ledger cannot disagree about it. */
  const stats = useBillingStats();
  const mix = stats.revenue_mix;

  /* any change to what is being asked for starts again at the first page */
  React.useEffect(() => { setPage(0); }, [term, tab, sort, counter]);

  /* Owing is a question about money rather than a status value, so it goes to
     the database as its own flag — a browser cannot answer it over ten rows. */
  const query = React.useMemo(() => ({
    status: tab === "all" || tab === "unpaid" ? undefined : tab,
    unpaid: tab === "unpaid" || undefined,
    department: counter === "all" ? undefined : counter,
    search: term || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: SORT_KEYS[sort.id] ?? "issued_at",
    order: (sort.desc ? "desc" : "asc") as "asc" | "desc",
  }), [tab, counter, term, page, sort]);

  const { data: result, isFetching } = useInvoicePage(query);
  const rows = result?.items ?? [];
  const total = result?.total ?? 0;

  const byStatus = result?.counts ?? {};
  /* The department counts describe the whole ledger, so the segmented control
     keeps saying how many the lab has while the clinic's page is on screen. */
  const counters = {
    clinic: byStatus["department:clinic"] ?? 0,
    lab: byStatus["department:lab"] ?? 0,
    pharmacy: byStatus["department:pharmacy"] ?? 0,
    all:
      (byStatus["department:clinic"] ?? 0)
      + (byStatus["department:lab"] ?? 0)
      + (byStatus["department:pharmacy"] ?? 0),
  };
  const counts = {
    all: (["draft", "issued", "partially_paid", "paid", "void"] as const)
      .reduce((s, key) => s + (byStatus[key] ?? 0), 0),
    unpaid: byStatus.unpaid ?? 0,
    draft: byStatus.draft ?? 0,
    paid: byStatus.paid ?? 0,
    void: byStatus.void ?? 0,
  };

  return (
    <>
      <PageHeader
        title="Billing"
        description="Invoices reference the encounter rather than copying it. Lines are suggested from the visit and priced from the clinic's own tariff — and the lab and the pharmacy bill on their own invoices, so each counter chases its own money."
        actions={
          <>
            <Button variant="secondary" onClick={() => setView("account")}>
              <IconCard size={15} /> Collect payment
            </Button>
            <Button variant="primary" onClick={() => setCompose(true)}>
              <IconPlus size={15} /> New invoice
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Billed" value={currency(stats.billed)} icon={<IconReceipt size={16} />}
              hint={`${pluralise(stats.count, "invoice")} excluding voids`} />
        <Stat label="Collected" value={currency(stats.paid)} icon={<IconCheck size={16} />}
              footer={<Meter value={stats.paid} max={Math.max(stats.billed, 1)} tone="ok" />} />
        <Stat label="Outstanding" value={currency(stats.outstanding)} tone={stats.outstanding > 0 ? "warn" : "ink"}
              icon={<IconAlert size={16} />} hint={`${pluralise(stats.unpaid, "invoice")} still owing`} />
        <Stat label="Drafts" value={stats.drafts} icon={<IconReceipt size={16} />} hint="Not yet issued" />
      </section>

      <Tabs
        className="mb-5 mt-5"
        value={view}
        onChange={setView}
        tabs={[
          { value: "ledger", label: "Invoices", icon: <IconReceipt size={15} />, count: counts.all },
          { value: "account", label: "A patient's account", icon: <IconUser size={15} /> },
        ]}
      />

      {view === "account" && (
        <PatientAccount
          patientId={payingFor}
          onPatientChange={setPayingFor}
        />
      )}

      {view === "ledger" && (
        /* The ledger is the page: full width, so every column fits whether the
           rail is open or not. The counter filter sits on the same line as the
           status tabs, and the money mix follows the table as one slim bar —
           it is context for the ledger, not a rival to it. */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={tab}
              onChange={setTab}
              className="!border-b-0"
              tabs={[
                { value: "all", label: "All", count: counts.all },
                { value: "unpaid", label: "Owing", count: counts.unpaid },
                { value: "draft", label: "Drafts", count: counts.draft },
                { value: "paid", label: "Paid", count: counts.paid },
                { value: "void", label: "Void", count: counts.void },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2.5">
              <Segmented<BillingDepartment | "all">
                value={counter}
                onChange={setCounter}
                options={[
                  { value: "all", label: "Every counter" },
                  { value: "clinic", label: `Clinic · ${counters.clinic}` },
                  { value: "lab", label: `Lab · ${counters.lab}` },
                  { value: "pharmacy", label: `Pharmacy · ${counters.pharmacy}` },
                ]}
              />
              <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice number or patient"
                           wrapperClassName="w-full sm:w-64" />
            </div>
          </div>

          <Card className="overflow-hidden">
            <DataTable
              columns={invoiceColumns}
              data={rows}
              getRowId={(i) => i.id}
              pageSize={PAGE_SIZE}
              onRowClick={(inv) => router.push(`/billing/${inv.id}`)}
              minWidth="52rem"
              empty={<EmptyState icon={<IconReceipt size={20} />} title="Nothing here" body="No invoice matches this filter." />}
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

          {mix.length > 0 && <MoneyMix mix={mix} />}
        </div>
      )}

      <InvoiceComposer open={compose} onClose={() => setCompose(false)} patientId={null} encounterId={null} />
    </>
  );
}

/** Billed value by source, as one bar — the proportions at a glance, the figures beside them. */
function MoneyMix({ mix }: { mix: Array<{ label: string; value: number }> }) {
  const total = mix.reduce((sum, m) => sum + m.value, 0) || 1;
  const colours = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
  return (
    <Card>
      <CardBody className="pt-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-label font-semibold text-ink">Where the money came from</h2>
          <span className="tnum text-label text-ink-2">{currency(total)} billed</span>
        </div>
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3" role="img"
             aria-label={mix.map((m) => `${sentenceCase(m.label)} ${Math.round((m.value / total) * 100)}%`).join(", ")}>
          {mix.map((m, i) => (
            <span key={m.label} style={{ width: `${(m.value / total) * 100}%`, background: colours[i % colours.length] }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {mix.map((m, i) => (
            <li key={m.label} className="flex items-center gap-2 text-label">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colours[i % colours.length] }} aria-hidden />
              <span className="text-ink">{sentenceCase(m.label)}</span>
              <span className="tnum text-ink-2">{currency(m.value)}</span>
              <span className="tnum text-ink-3">{Math.round((m.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
