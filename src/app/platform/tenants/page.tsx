"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePlatformEntitlements, usePlatformSnapshot } from "@/lib/query/hooks";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { currency, formatDate, pluralise, titleCase } from "@/lib/format";
import {
  PAID_FEATURES, consoleRows, platformTotals,
  type AccountState, type ConsoleRow,
} from "@/lib/platform/subscriptions";
import type { ClinicalTypeKey, FeatureKey, Tenant } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Field, SearchInput, Select } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/loader";
import { Monogram } from "@/components/layout/rail";
import { ConsolePage, TenantAddress } from "@/components/platform/chrome";
import { CreateClinicFlow } from "@/components/platform/create-clinic";
import { MonthlyCharge, TenantRowActions } from "@/components/platform/tenant-actions";
import { AccountBadge } from "@/components/platform/module-controls";
import {
  IconFilter, IconLayers, IconLock, IconPlus, IconReceipt, IconUsers,
} from "@/components/ui/icons";

/* ==========================================================================
   Every clinic, and the six questions worth asking about the set of them.

   The console's list used to answer one — "what is this called" — and hide the
   rest behind a menu. The work platform staff actually do here is narrower than
   that and always the same shape: find the clinics on a module, or trialling
   one, or suspended and still holding subscriptions, and then do one of four
   things to a row. So the filters are the screen, and the actions are icons in
   the row rather than a menu over it.
   ========================================================================== */

export default function TenantsPage() {
  return (
    <ConsolePage>
      {/* The filters can arrive in the query string — the overview hands off
          "the four suspended ones" as a link rather than as an instruction to
          go and set three dropdowns. Reading them is what needs the boundary. */}
      <React.Suspense fallback={<PageLoader label="Reading the platform…" />}>
        <TenantDirectory />
      </React.Suspense>
    </ConsolePage>
  );
}

/* ---- columns --------------------------------------------------------------- */

const col = columnHelperFor<ConsoleRow>();

const tenantColumns = col.columns([
  col.accessor((r) => r.tenant.name, {
    id: "name",
    header: "Clinic",
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <Monogram name={row.original.tenant.name} size={30} />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.original.tenant.name}</p>
          <p className="truncate text-[0.75rem] text-ink-3">
            {row.original.tenant.city} · {row.original.tenant.plan}
          </p>
        </div>
      </div>
    ),
  }),
  col.accessor((r) => r.tenant.slug, {
    id: "slug",
    header: "Subdomain",
    cell: ({ row }) => <TenantAddress tenant={row.original.tenant} />,
  }),
  col.accessor((r) => r.tenant.clinical_type, {
    id: "clinical_type",
    header: "Discipline",
    cell: ({ getValue }) => (
      <span className="text-ink-2">{CLINICAL_TYPES.find((c) => c.key === getValue())!.label}</span>
    ),
  }),
  col.accessor((r) => r.billed.length + r.trialing.length + r.held.length, {
    id: "modules",
    header: "Paid modules",
    cell: ({ row }) => <ModuleCell row={row.original} />,
  }),
  col.accessor((r) => r.mrr, {
    id: "subscription",
    header: "Subscription",
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <AccountBadge state={row.original.state} />
        <MonthlyCharge amount={row.original.mrr} />
      </div>
    ),
  }),
  col.accessor((r) => r.patients, {
    id: "usage",
    header: "Usage",
    cell: ({ row }) => (
      <div className="tnum font-mono text-[0.8125rem] leading-snug text-ink-2">
        <p>{row.original.patients} patients · {row.original.encounters} visits</p>
        <p className="text-[0.75rem] text-ink-3">
          {row.original.last_activity ? `last seen ${formatDate(row.original.last_activity)}` : "no activity yet"}
        </p>
      </div>
    ),
  }),
  col.accessor((r) => r.tenant.status, {
    id: "status",
    header: "Status",
    cell: ({ getValue }) => (
      <Badge tone={getValue() === "active" ? "ok" : getValue() === "trial" ? "warn" : "critical"} size="sm" dot>
        {titleCase(getValue())}
      </Badge>
    ),
  }),
  col.display({
    id: "manage",
    header: "Actions",
    meta: { align: "right", width: 150 },
    cell: ({ row }) => <TenantRowActions tenant={row.original.tenant} />,
  }),
]);

function ModuleCell({ row }: { row: ConsoleRow }) {
  const on = [...row.billed, ...row.trialing, ...row.held];
  if (!on.length) return <span className="text-[0.8125rem] text-ink-3">Core only</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="tnum text-[0.75rem] text-ink-3">
        {on.length} of {PAID_FEATURES.length}
      </span>
      <span className="flex flex-wrap gap-1">
        {on.map((s) => (
          <Badge
            key={s.feature.key}
            tone={s.state === "billed" ? "neutral" : s.state === "trial" ? "warn" : "critical"}
            size="sm"
            dot={false}
          >
            {s.feature.name}
          </Badge>
        ))}
      </span>
    </div>
  );
}

/* ---- filters --------------------------------------------------------------- */

type StatusFilter = "any" | Tenant["status"];
type TypeFilter = "any" | ClinicalTypeKey;
type ModuleFilter = "any" | FeatureKey;
type ModuleStateFilter = "enabled" | "trial" | "locked";
type BillingFilter = "any" | AccountState;

interface Filters {
  q: string;
  status: StatusFilter;
  type: TypeFilter;
  module: ModuleFilter;
  moduleState: ModuleStateFilter;
  billing: BillingFilter;
}

const NO_FILTERS: Filters = {
  q: "", status: "any", type: "any", module: "any", moduleState: "enabled", billing: "any",
};

const TENANT_STATUSES = ["active", "trial", "suspended"] as const;
const MODULE_STATES = ["enabled", "trial", "locked"] as const;
const ACCOUNT_STATES = ["billed", "trial", "held", "core_only"] as const;

/**
 * Filters carried in the query string.
 *
 * Anything unrecognised is dropped rather than trusted: this is a URL, so the
 * values in it are whatever somebody typed, and a filter that does not exist
 * would otherwise hide every row and look like an empty platform.
 */
function seedFilters(params: { get(key: string): string | null }): Filters {
  const pick = <T extends string, F extends string>(
    key: string, allowed: readonly T[], fallback: F,
  ): T | F => {
    const value = params.get(key);
    return value && (allowed as readonly string[]).includes(value) ? value as T : fallback;
  };

  return {
    q: params.get("q")?.slice(0, 80) ?? "",
    status: pick("status", TENANT_STATUSES, "any" as const),
    type: pick("type", CLINICAL_TYPES.map((c) => c.key), "any" as const),
    module: pick("module", PAID_FEATURES.map((f) => f.key), "any" as const),
    moduleState: pick("moduleState", MODULE_STATES, "enabled" as const),
    billing: pick("billing", ACCOUNT_STATES, "any" as const),
  };
}

function applyFilters(rows: ConsoleRow[], f: Filters) {
  const term = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    const t = r.tenant;
    if (
      term
      && !t.name.toLowerCase().includes(term)
      && !t.slug.includes(term)
      && !t.city.toLowerCase().includes(term)
      && !t.plan.toLowerCase().includes(term)
    ) return false;

    if (f.status !== "any" && t.status !== f.status) return false;
    if (f.type !== "any" && t.clinical_type !== f.type) return false;
    if (f.billing !== "any" && r.state !== f.billing) return false;

    if (f.module !== "any") {
      const line = r.subscriptions.find((s) => s.feature.key === f.module);
      if (!line) return false;
      if (f.moduleState === "enabled" && line.status !== "active") return false;
      if (f.moduleState === "trial" && line.status !== "trial") return false;
      if (f.moduleState === "locked" && line.status !== "inactive") return false;
    }
    return true;
  });
}

/** How many of the six are doing something, so "Clear" can say so. */
function activeCount(f: Filters) {
  return [
    f.q.trim() !== "",
    f.status !== "any",
    f.type !== "any",
    f.module !== "any",
    f.billing !== "any",
  ].filter(Boolean).length;
}

/* ---- the screen ------------------------------------------------------------ */

function TenantDirectory() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: snapshot, isPending } = usePlatformSnapshot();
  const { byTenant } = usePlatformEntitlements();
  const [filters, setFilters] = React.useState<Filters>(() => seedFilters(params));
  const [creating, setCreating] = React.useState(false);

  /* Arriving from the overview with a query string re-seeds the form, because
     the route does not remount when only the query changes. Clearing the
     filters does not touch the URL, so an empty query is left well alone. */
  const query = params.toString();
  React.useEffect(() => {
    if (query) setFilters(seedFilters(new URLSearchParams(query)));
  }, [query]);

  const rows = React.useMemo(
    () => consoleRows(snapshot?.tenants ?? [], byTenant),
    [snapshot, byTenant],
  );
  const totals = React.useMemo(() => platformTotals(rows), [rows]);
  const shown = React.useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const active = activeCount(filters);

  return (
    <>
      <PageHeader
        eyebrow="Tenancy"
        title="Every clinic on the platform"
        description="The only screen that reads across tenants, and the only place a clinic can be created. Each one is handed its own subdomain — that address is what binds every later request to its data."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <IconPlus size={15} /> Create clinic
          </Button>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Clinics" value={totals.tenants} icon={<IconLayers size={16} />}
          hint={`${totals.active} active · ${totals.trial} trial · ${totals.suspended} suspended`}
        />
        <Stat
          label="Paying clinics" value={totals.payingTenants} icon={<IconUsers size={16} />}
          hint={totals.tenants ? `${Math.round((totals.payingTenants / totals.tenants) * 100)}% of the platform` : "—"}
        />
        <Stat
          label="Module revenue" value={currency(totals.mrr)} unit="/mo" icon={<IconReceipt size={16} />}
          hint={`${pluralise(totals.billedSubscriptions, "billed subscription")}`}
        />
        <Stat
          label="Suspended" value={totals.suspended}
          tone={totals.suspended ? "critical" : "ink"} icon={<IconLock size={16} />}
          hint={
            totals.suspended
              ? `${currency(totals.heldValue)}/mo on hold behind them`
              : "Every clinic is reachable"
          }
        />
      </section>

      <Card className="mt-5 overflow-hidden">
        <CardHeader
          icon={<IconFilter size={16} />}
          title="Filters"
          subtitle="Narrow by what a clinic is, what it holds and what it pays."
          actions={
            active > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
                Clear {active === 1 ? "filter" : `${active} filters`}
              </Button>
            )
          }
        />
        <div className="grid grid-cols-1 gap-3 border-t border-line-soft bg-surface-2 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Search" className="xl:col-span-2">
            <SearchInput
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Name, subdomain, city or plan"
            />
          </Field>

          <Field label="Clinic status">
            <Select value={filters.status} onChange={(e) => set("status", e.target.value as StatusFilter)}>
              <option value="any">Any status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </Select>
          </Field>

          <Field label="Discipline">
            <Select value={filters.type} onChange={(e) => set("type", e.target.value as TypeFilter)}>
              <option value="any">Any discipline</option>
              {CLINICAL_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </Field>

          <Field label="Module">
            <Select value={filters.module} onChange={(e) => set("module", e.target.value as ModuleFilter)}>
              <option value="any">Any module</option>
              {PAID_FEATURES.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
            </Select>
          </Field>

          <Field
            label="Module state"
            help={filters.module === "any" ? "Pick a module to use this." : undefined}
          >
            <Select
              value={filters.moduleState}
              disabled={filters.module === "any"}
              onChange={(e) => set("moduleState", e.target.value as ModuleStateFilter)}
            >
              <option value="enabled">Enabled</option>
              <option value="trial">On trial</option>
              <option value="locked">Locked</option>
            </Select>
          </Field>

          <Field label="Payment status">
            <Select value={filters.billing} onChange={(e) => set("billing", e.target.value as BillingFilter)}>
              <option value="any">Any payment status</option>
              <option value="billed">Paying</option>
              <option value="trial">Trial, not billed</option>
              <option value="held">On hold (suspended)</option>
              <option value="core_only">Core only, nothing billed</option>
            </Select>
          </Field>
        </div>

        <DataTable
          columns={tenantColumns}
          data={shown}
          getRowId={(r) => r.tenant.id}
          loading={isPending}
          pageSize={12}
          initialSorting={[{ id: "name", desc: false }]}
          minWidth="82rem"
          onRowClick={(r) => router.push(`/platform/tenants/${r.tenant.id}`)}
          empty={
            <EmptyState
              icon={<IconLayers size={20} />}
              title="No clinic matches those filters"
              body={
                active
                  ? "Loosen one of them, or clear them all to see the whole platform again."
                  : "There is no clinic on this platform yet."
              }
              action={
                active
                  ? <Button variant="secondary" size="sm" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>
                  : <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                    <IconPlus size={14} /> Create the first clinic
                  </Button>
              }
            />
          }
        />

        {shown.length > 0 && shown.length !== rows.length && (
          <p className="border-t border-line-soft px-5 py-2.5 text-[0.75rem] text-ink-3">
            Showing {shown.length} of {rows.length} clinics · {currency(
              shown.reduce((sum, r) => sum + r.mrr, 0),
            )}/mo between them
          </p>
        )}
      </Card>

      <CreateClinicFlow open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
