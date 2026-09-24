"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlatformCatalog, usePlatformEntitlements, usePlatformSnapshot } from "@/lib/query/hooks";
import { currency, pluralise } from "@/lib/format";
import {
  PAID_FEATURES, consoleRows, moduleStats, platformTotals,
  type BillingState, type ConsoleRow, type ModuleStats, type Subscription,
} from "@/lib/platform/subscriptions";
import type { Feature, FeatureKey } from "@/lib/types";
import { isSuperAdmin } from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Field, SearchInput, Select } from "@/components/ui/field";
import { ConsolePage } from "@/components/platform/chrome";
import {
  BILLING_LABEL, ModulePrice, useModuleSwitch,
} from "@/components/platform/module-controls";
import { FeaturePriceDialog } from "@/components/platform/price-editor";
import {
  IconEdit, IconGrid, IconLayers, IconUsers
} from "@/components/ui/icons";

/* ==========================================================================
   Modules, priced and sold.

   One screen for the commercial side of the product: what the catalogue
   costs, who is on what, and the switch for every clinic in one grid rather
   than one dialog at a time. What each module earns lives under Billing &
   revenue instead, read off raised invoices rather than the catalogue price.
   The switch here is the same call the tenant page makes and asks the same
   question before it runs — there is one way to grant a module, and this is
   a second door onto it.
   ========================================================================== */

type Tab = "catalogue" | "access";

const TABS: Tab[] = ["catalogue", "access"];

export default function ModulesPage(props: PageProps<"/platform/modules">) {
  const sp = React.use(props.searchParams);
  const opening = TABS.find((t) => t === sp.tab) ?? "catalogue";
  return <ConsolePage><ModuleConsole opening={opening} /></ConsolePage>;
}

function ModuleConsole({ opening }: { opening: Tab }) {
  const router = useRouter();
  const { data: snapshot, isPending: snapshotPending } = usePlatformSnapshot();
  const { byTenant, isPending: entitlementsPending } = usePlatformEntitlements();
  const catalog = usePlatformCatalog();
  const isPending = snapshotPending || catalog.isPending;
  /* Addressable, the way Settings is: the overview links at three different
     parts of this screen, and without a tab in the URL all three arrived at
     the catalogue and read as three links to the same place — which is what
     they were. */
  const [tab, setTab] = React.useState<Tab>(opening);
  const openTab = (next: Tab) => {
    setTab(next);
    router.replace(`/platform/modules?tab=${next}`, { scroll: false });
  };
  const [focus, setFocus] = React.useState<FeatureKey | "any">("any");

  const rows = React.useMemo(
    () => consoleRows(snapshot?.tenants ?? [], byTenant, catalog.features),
    [snapshot, byTenant, catalog.features],
  );
  const totals = React.useMemo(() => platformTotals(rows), [rows]);
  const stats = React.useMemo(() => moduleStats(rows, catalog.features), [rows, catalog.features]);
  const paidStats = React.useMemo(() => stats.filter((s) => !s.feature.is_core), [stats]);
  const paidFeatures = React.useMemo(
    () => catalog.features.filter((f) => !f.is_core),
    [catalog.features],
  );

  /* Jump from a catalogue card straight to that module's tenants. */
  const manage = (key: FeatureKey) => { setFocus(key); openTab("access"); };

  return (
    <>
      <PageHeader
        eyebrow="Commercial"
        title="Modules & pricing"
        description="What the platform sells, what each module costs, and which clinics hold it. Core modules are seeded with every clinic and are not sold separately. Revenue lives under Billing & revenue."
        meta={
          <>
            <span className="text-label text-ink-2">
              {PAID_FEATURES.length} paid modules · {pluralise(totals.tenants, "clinic")}
            </span>
            {entitlementsPending && (
              <span className="text-caption text-ink-3">reading entitlements…</span>
            )}
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={openTab}
        className="my-5"
        tabs={[
          { value: "catalogue", label: "Catalogue & pricing", icon: <IconLayers size={15} />, count: PAID_FEATURES.length },
          { value: "access", label: "Tenant access", icon: <IconUsers size={15} />, count: totals.tenants },
        ]}
      />

      {tab === "catalogue" && <CatalogueTab stats={stats} paid={paidStats} onManage={manage} />}
      {tab === "access" && (
        <AccessTab
          rows={rows} paid={paidFeatures} focus={focus} onFocus={setFocus} loading={isPending}
        />
      )}
    </>
  );
}

/* ---- catalogue -------------------------------------------------------------- */

function CatalogueTab({
  stats, paid, onManage,
}: {
  stats: ModuleStats[];
  paid: ModuleStats[];
  onManage: (key: FeatureKey) => void;
}) {
  const { platformUser } = useApp();
  /* The price is a super admin's to set; the API refuses the desk with a 403,
     so the desk is not offered a button that can only fail. */
  const canPrice = isSuperAdmin(platformUser);
  const [pricing, setPricing] = React.useState<FeatureKey | null>(null);
  const core = stats.filter((s) => s.feature.is_core);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {paid.map((stat) => (
          <ModuleCard
            key={stat.feature.key}
            stat={stat}
            onManage={onManage}
            onPrice={canPrice ? setPricing : undefined}
          />
        ))}
      </div>

      <FeaturePriceDialog
        stat={paid.find((s) => s.feature.key === pricing) ?? null}
        onClose={() => setPricing(null)}
      />

      <div>
        <Card>
          <CardHeader
            icon={<IconLayers size={15} />} tone="violet" title="Core modules"
            hint="Seeded with every clinic, in every plan, and never sold separately."
          />
          <CardBody>
            <ul className="divide-y divide-line-soft">
              {core.map((s) => (
                <li key={s.feature.key} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-ink">{s.feature.name}</p>
                    <p className="mt-0.5 text-caption leading-snug text-ink-3">{s.feature.summary}</p>
                  </div>
                  <span className="shrink-0 self-center text-caption text-ink-3">Included</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line-soft pt-3 text-caption leading-relaxed text-ink-3">
              The product does not work without these five, so they carry no price and no switch.
              The server refuses to deactivate one however it is asked.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ModuleCard({
  stat, onManage, onPrice,
}: {
  stat: ModuleStats;
  onManage: (key: FeatureKey) => void;
  /** absent for anyone who may not set prices */
  onPrice?: (key: FeatureKey) => void;
}) {
  const { feature } = stat;

  return (
    <Card className="flex flex-col">
      <div className="px-5 pt-4.5">
        <h3 className="text-body font-semibold leading-tight text-ink">{feature.name}</h3>
        <p className="mt-1 text-label leading-snug text-ink-2">{feature.summary}</p>
      </div>

      <div className="mt-3.5 flex-1 border-y border-line-soft bg-surface-2 px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <ModulePrice feature={feature} size="lg" />
          {onPrice && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPrice(feature.key)}
              aria-label={`Change the price of ${feature.name}`}
            >
              <IconEdit size={14} /> Edit price
            </Button>
          )}
        </div>
        <p className="mt-1 text-caption text-ink-3">{feature.pricing_note}</p>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <Link
          href={`/modules/${feature.key}`}
          className="text-caption text-ink-3 underline-offset-4 hover:text-ink hover:underline"
        >
          What clinics are shown
        </Link>
        <Button variant="secondary" size="sm" onClick={() => onManage(feature.key)}>
          <IconGrid size={14} /> Manage access
        </Button>
      </div>
    </Card>
  );
}

/* ---- tenant access ---------------------------------------------------------- */

type AccessFilter = "any" | "subscribed" | "trial" | "locked";

/**
 * Every clinic against every paid module, with the switch in the cell.
 *
 * The grid is the point: "which clinics are missing Billing" is a column read
 * rather than ten dialogs opened one at a time. A cell is a button, and it goes
 * through the same confirmation as everywhere else — the grid makes the change
 * quicker to reach, not quicker to make by accident.
 */
function AccessTab({
  rows, paid, focus, onFocus, loading,
}: {
  rows: ConsoleRow[];
  /** the paid modules, priced — the column headers quote the price */
  paid: Feature[];
  focus: FeatureKey | "any";
  onFocus: (key: FeatureKey | "any") => void;
  loading: boolean;
}) {
  const modules = useModuleSwitch();
  const [q, setQ] = React.useState("");
  const [state, setState] = React.useState<AccessFilter>("any");

  const columns = focus === "any"
    ? paid
    : paid.filter((f) => f.key === focus);

  const shown = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !r.tenant.name.toLowerCase().includes(term) && !r.tenant.slug.includes(term)) {
        return false;
      }
      if (state === "any") return true;

      /* With a module in focus the filter asks about that module; without one it
         asks about the clinic as a whole. Both are questions people actually
         have, and which one they mean is decided by what they picked. */
      const lines = focus === "any"
        ? r.subscriptions.filter((s) => !s.feature.is_core)
        : r.subscriptions.filter((s) => s.feature.key === focus);

      if (state === "subscribed") return lines.some((l) => l.status === "active");
      if (state === "trial") return lines.some((l) => l.status === "trial");
      return lines.some((l) => l.status === "inactive");
    });
  }, [rows, q, state, focus]);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<IconLayers size={15} />} tone="violet" title="Module access"
          hint="One cell per clinic per module. Click a cell to change it — you will be asked first."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <AccessLegend />
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-3 border-t border-line-soft bg-surface-2 px-5 py-4 sm:grid-cols-3">
          <Field label="Clinic">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or subdomain"
            />
          </Field>
          <Field label="Module in focus">
            <Select value={focus} onChange={(e) => onFocus(e.target.value as FeatureKey | "any")}>
              <option value="any">All paid modules</option>
              {PAID_FEATURES.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
            </Select>
          </Field>
          <Field
            label="Access"
            help={focus === "any" ? "Asked of any paid module." : "Asked of the module in focus."}
          >
            <Select value={state} onChange={(e) => setState(e.target.value as AccessFilter)}>
              <option value="any">Any access</option>
              <option value="subscribed">Enabled</option>
              <option value="trial">On trial</option>
              <option value="locked">Locked</option>
            </Select>
          </Field>
        </div>

        {shown.length === 0 && !loading ? (
          <EmptyState
            icon={<IconGrid size={20} />}
            title="No clinic matches"
            body="Loosen the filters to see the rest of the platform."
            compact
          />
        ) : (
          <TableWrap>
            <Table>
              <THead sticky>
                <TR>
                  <TH>Clinic</TH>
                  {columns.map((f) => (
                    <TH key={f.key} align="center">
                      <span className="block">{f.name}</span>
                      <span className="tnum block font-mono text-micro font-normal normal-case tracking-normal text-ink-3">
                        {currency(f.price_monthly)}
                      </span>
                    </TH>
                  ))}
                  <TH align="right">Monthly</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((row) => (
                  <TR key={row.tenant.id}>
                    <TD>
                      <Link
                        href={`/platform/tenants/${row.tenant.id}`}
                        className="block min-w-0 hover:underline"
                      >
                        <p className="truncate font-medium text-ink">{row.tenant.name}</p>
                        <p className="tnum truncate font-mono text-caption text-ink-3">
                          {row.tenant.slug}
                        </p>
                      </Link>
                    </TD>
                    {columns.map((f) => {
                      const line = row.subscriptions.find((s) => s.feature.key === f.key)!;
                      return (
                        <TD key={f.key} align="center">
                          <AccessCell
                            line={line}
                            busy={modules.isBusy(row.tenant.id, f.key)}
                            onRequest={modules.request}
                          />
                        </TD>
                      );
                    })}
                    <TD align="right">
                      <span className={cn("tnum font-mono text-label", row.mrr ? "text-ink" : "text-ink-3")}>
                        {row.mrr ? `${currency(row.mrr)}` : "—"}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}

        <p className="border-t border-line-soft px-5 py-2.5 text-caption text-ink-3">
          {shown.length} of {rows.length} clinics ·{" "}
          {currency(shown.reduce((sum, r) => sum + r.mrr, 0))}/mo between them
        </p>
      </Card>

      {modules.dialog}
    </div>
  );
}

/**
 * The grid is a binary map: a module is on or it is not. That is one hue for
 * the positive class and plain surface for the negative — the brand blue, which
 * is the only non-status colour the system spends. Amber and red are left for
 * the two cells that are neither, and stay rare enough to be worth a look.
 */
const CELL_CLASS: Record<BillingState, string> = {
  /* Filled, because the whole point of the grid is scanning a column for what
     is on — two pale tints a shade apart make that a reading exercise. This is
     the same accent-on-white pairing every primary button in the app already
     uses. */
  billed: "border-accent bg-accent text-accent-ink hover:bg-accent-hover",
  trial: "border-warn-border bg-warn-soft text-warn-text hover:brightness-95",
  held: "border-critical-border bg-critical-soft text-critical-text hover:brightness-95",
  dormant: "border-line-strong bg-surface text-ink-3 hover:border-accent hover:text-accent-text",
  included: "border-line bg-surface-2 text-ink-3",
};

const CELL_LABEL: Record<BillingState, string> = {
  billed: "On", trial: "Trial", held: "Hold", dormant: "Off", included: "Core",
};

function AccessCell({
  line, busy, onRequest,
}: {
  line: Subscription;
  busy: boolean;
  onRequest: ReturnType<typeof useModuleSwitch>["request"];
}) {
  const next = line.status === "inactive" ? "active" : "inactive";
  const action = next === "active" ? "enable" : "disable";

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onRequest(line.tenant, line.feature, next, line.status)}
      title={`${line.feature.name} at ${line.tenant.name} — ${BILLING_LABEL[line.state]}. Click to ${action}.`}
      aria-label={`${line.feature.name} at ${line.tenant.name} is ${BILLING_LABEL[line.state]}. Click to ${action}.`}
      className={cn(
        "inline-flex h-6 min-w-14 items-center justify-center rounded-[var(--r-pill)] border",
        "text-micro font-medium transition-[filter,border-color,color] duration-150",
        "disabled:opacity-65",
        CELL_CLASS[line.state],
      )}
    >
      {busy ? "…" : CELL_LABEL[line.state]}
    </button>
  );
}

function AccessLegend() {
  const states: BillingState[] = ["billed", "trial", "held", "dormant"];
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {states.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-micro text-ink-3">
          <span
            className={cn("inline-block h-3 w-6 rounded-[var(--r-pill)] border", CELL_CLASS[s])}
            aria-hidden
          />
          {BILLING_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

