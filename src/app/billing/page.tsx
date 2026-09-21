"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { BillingDepartment, Invoice } from "@/lib/types";
import { useBillingStats, useInvoicePage } from "@/lib/query/hooks";
import { invoiceTotals } from "@/lib/data/repository";
import { useDebounced } from "@/lib/debounce";

import { currency, formatDate, pluralise } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { EmptyState, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { ChoiceGroup, SearchInput } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { DonutChart } from "@/components/charts/donut-chart";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import { Badge } from "@/components/ui/badge";
import { DEPARTMENT_LABEL, StatusPill } from "@/components/domain/status";
import { PatientChip, PatientRef } from "@/components/domain/patient";
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
      <span className="tnum font-mono text-label text-ink-2">{formatDate(row.original.issued_at)}</span>
    ),
  }),
  col.accessor("department", {
    header: "Counter",
    enableSorting: false,
    cell: ({ getValue }) => (
      <Badge tone={getValue() === "clinic" ? "neutral" : "accent"} size="sm" dot={false}>
        {DEPARTMENT_LABEL[getValue()]}
      </Badge>
    ),
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
      <span className={`tnum font-mono ${getValue() > 0.005 ? "text-warn-text" : "text-ok-text"}`}>
        {currency(getValue())}
      </span>
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
        eyebrow="Feature module"
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
        <Stat label="Collected" value={currency(stats.paid)} tone="ok" icon={<IconCheck size={16} />}
              footer={<Meter value={stats.paid} max={Math.max(stats.billed, 1)} tone="ok" />} />
        <Stat label="Outstanding" value={currency(stats.outstanding)} tone={stats.outstanding > 0 ? "warn" : "ok"}
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
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <ChoiceGroup<BillingDepartment | "all">
            className="mb-4"
            columns={4}
            value={counter}
            onChange={setCounter}
            options={[
              { value: "all", label: "Every counter", description: `${counters.all} invoices` },
              { value: "clinic", label: "Clinic", description: `${counters.clinic} invoices` },
              { value: "lab", label: "Lab", description: `${counters.lab} invoices` },
              { value: "pharmacy", label: "Pharmacy", description: `${counters.pharmacy} invoices` },
            ]}
          />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice number or patient"
                         wrapperClassName="min-w-[200px] max-w-xs flex-1" />
          </div>

          <Card className="overflow-hidden">
            <DataTable
              columns={invoiceColumns}
              data={rows}
              getRowId={(i) => i.id}
              pageSize={PAGE_SIZE}
              onRowClick={(inv) => router.push(`/billing/${inv.id}`)}
              minWidth="50rem"
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
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={<IconReceipt size={15} />} tone="ok" title="Where the money came from" hint="Billed value by line-item source." />
            <CardBody className="pt-1">
              {mix.length ? (
                <DonutChart
                  slices={mix}
                  centreValue={currency(mix.reduce((s, x) => s + x.value, 0))}
                  centreLabel="billed"
                  format={(n) => currency(n)}
                  size={150}
                />
              ) : (
                <EmptyState compact icon={<IconReceipt size={20} />} title="Nothing billed yet" />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconReceipt size={15} />} tone="ok" title="Invoice states" hint="Payments move an invoice along; they never edit it." />
            <CardBody className="pt-1">
              <ol className="space-y-2.5">
                {[
                  { s: "draft", d: "Composed, still editable, nothing owed." },
                  { s: "issued", d: "Sent to the patient. Balance equals the total." },
                  { s: "partially_paid", d: "A payment landed but did not clear it." },
                  { s: "paid", d: "Payments cover the total." },
                  { s: "void", d: "Cancelled. Excluded from every revenue figure." },
                ].map((row) => (
                  <li key={row.s} className="flex items-start gap-3">
                    <StatusPill kind="invoice" status={row.s} size="sm" />
                    <p className="min-w-0 flex-1 text-caption leading-snug text-ink-2">{row.d}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      )}

      <InvoiceComposer open={compose} onClose={() => setCompose(false)} patientId={null} encounterId={null} />
    </>
  );
}
