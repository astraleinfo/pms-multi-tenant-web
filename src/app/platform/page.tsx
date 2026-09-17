"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { usePlatformSnapshot } from "@/lib/query/hooks";
import * as api from "@/lib/api";
import type { PlatformTenantRow } from "@/lib/api";
import { CLINICAL_TYPES, FEATURE_BY_KEY, FEATURES } from "@/lib/data/catalog";
import { currency, formatDate, titleCase } from "@/lib/format";
import { slugProblem, slugify } from "@/lib/tenancy";
import type { ClinicalTypeKey, FeatureKey, Id, Tenant, TenantFeature } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, KV } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Modal, Menu, MenuItem, MenuSep } from "@/components/ui/modal";
import { Field, Input, SearchInput, Select } from "@/components/ui/field";
import { StageLoader } from "@/components/ui/loader";
import { Monogram } from "@/components/layout/rail";
import {
  IconArrowRight, IconCheck, IconExternal, IconLayers, IconLock, IconLogout,
  IconMore, IconPlus, IconShield, IconSpark, IconUsers,
} from "@/components/ui/icons";
import { BillingMetricsConsole } from "@/components/domain/billing-metrics";
import { useBillingMetrics } from "@/lib/query/billing";
import { Tabs } from "@/components/ui/tabs";

/* The console's row is a clinic *plus the counts the API gathered for it* —
   one clinic at a time, each with that clinic bound to the connection. */
const col = columnHelperFor<PlatformTenantRow>();

const tenantColumns = col.columns([
  col.accessor((r) => r.tenant.name, {
    id: "name",
    header: "Clinic",
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <Monogram name={row.original.tenant.name} size={30} />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.original.tenant.name}</p>
          <p className="truncate text-[0.75rem] text-ink-3">{row.original.tenant.city}</p>
        </div>
      </div>
    ),
  }),
  col.accessor((r) => r.tenant.slug, {
    id: "slug", header: "Subdomain", cell: ({ row }) => <TenantAddress tenant={row.original.tenant} />,
  }),
  col.accessor((r) => r.tenant.clinical_type, {
    id: "clinical_type",
    header: "Clinical type",
    cell: ({ getValue }) => (
      <span className="text-ink-2">{CLINICAL_TYPES.find((c) => c.key === getValue())!.label}</span>
    ),
  }),
  col.accessor((r) => r.active_features.length, {
    id: "modules", header: "Modules", enableSorting: false,
    cell: ({ row }) => <TenantModules row={row.original} />,
  }),
  col.accessor((r) => r.patients, {
    id: "data", header: "Data", enableSorting: false,
    cell: ({ row }) => <TenantData row={row.original} />,
  }),
  col.accessor((r) => r.tenant.since, {
    id: "since",
    header: "Since",
    cell: ({ getValue }) => <span className="text-ink-2">{formatDate(getValue())}</span>,
  }),
  col.accessor((r) => r.tenant.status, {
    id: "status", header: "Status", meta: { align: "right" },
    cell: ({ getValue }) => (
      <Badge tone={getValue() === "active" ? "ok" : getValue() === "trial" ? "warn" : "critical"} size="sm" dot>
        {titleCase(getValue())}
      </Badge>
    ),
  }),
  col.display({
    id: "manage",
    header: "",
    meta: { align: "right", width: 44 },
    cell: ({ row }) => <TenantActions tenant={row.original.tenant} />,
  }),
]);

/**
 * Open a clinic from the console, already signed in.
 *
 * This is what "navigate to a clinic" means for platform staff. They have no
 * account inside any clinic and never will, so without a support session the
 * only thing a clinic address can show them is its sign-in screen — which is
 * a dead end, because there is nothing they could type into it.
 *
 * The token is handed to the clinic tab in the URL fragment. Browsers do not
 * send a fragment to a server, so it never reaches a proxy or an access log;
 * the clinic tab reads it once, wipes it from the address bar, and holds it in
 * memory like any other access token.
 *
 * Opening one is an audit line in that clinic's trail, and so is everything it
 * goes on to do. That is the trade being made every time this runs, which is
 * why it is one function rather than a thing each call site improvises.
 */
function useEnterClinic() {
  const { openSupportSession, notify } = useApp();
  const [entering, setEntering] = React.useState<Id | null>(null);

  const enter = React.useCallback(async (tenant: Tenant, path = "/dashboard") => {
    setEntering(tenant.id);
    try {
      const opened = await openSupportSession(tenant.id);
      window.open(
        `${opened.url}${path}#support_token=${encodeURIComponent(opened.access_token)}`,
        "_blank",
        "noopener,noreferrer",
      );
      notify({
        tone: "warn",
        title: `Support session opened in ${tenant.name}`,
        body: "Recorded against you, not against this clinic's staff. It expires on its own.",
      });
    } catch (error) {
      notify({
        tone: "critical",
        title: `Could not open ${tenant.name}`,
        body: error instanceof Error ? error.message : "Try again.",
      });
    }
    setEntering(null);
  }, [openSupportSession, notify]);

  return { enter, entering };
}

function TenantAddress({ tenant }: { tenant: Tenant }) {
  const { host, clinicUrl } = useApp();
  const { enter, entering } = useEnterClinic();

  /* Still an anchor, and its href is still the clinic's real address, so
     middle-click and "open in new tab" behave the way the underline promises.
     The click handler is what upgrades an ordinary visit into a signed-in one;
     the fallback is the sign-in screen, which is where those gestures land. */
  return (
    <a
      href={clinicUrl(tenant.slug)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        void enter(tenant);
      }}
      title={`Open ${tenant.name} as platform support`}
      className="tnum inline-flex items-center gap-1.5 font-mono text-[0.8125rem] text-accent-text underline-offset-4 hover:underline"
    >
      {tenant.slug}.{host.root}
      {entering === tenant.id
        ? <span className="text-[0.6875rem] text-ink-3">opening…</span>
        : <IconExternal size={12} />}
    </a>
  );
}

function paidModules(row: PlatformTenantRow) {
  return row.active_features.filter((k) => !FEATURE_BY_KEY[k].is_core);
}

function TenantModules({ row }: { row: PlatformTenantRow }) {
  const paid = paidModules(row);
  if (!paid.length) return <span className="text-[0.8125rem] text-ink-3">Core only</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {paid.map((k) => <Badge key={k} tone="neutral" size="sm" dot={false}>{FEATURE_BY_KEY[k].name}</Badge>)}
    </span>
  );
}

function TenantData({ row }: { row: PlatformTenantRow }) {
  return (
    <span className="tnum font-mono text-[0.8125rem] text-ink-2">
      {row.patients} patients · {row.encounters} visits
    </span>
  );
}

function TenantActions({ tenant }: { tenant: Tenant }) {
  const { clinicUrl, setTenantStatus, notify } = useApp();
  const { enter, entering } = useEnterClinic();
  const [editing, setEditing] = React.useState(false);
  const [modules, setModules] = React.useState(false);

  return (
    <>
    <Menu
      width={230}
      trigger={({ toggle }) => (
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={`Manage ${tenant.name}`}>
          <IconMore size={16} />
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={<IconShield size={15} />}
            onClick={() => { void enter(tenant); close(); }}
            disabled={entering === tenant.id}
          >
            {entering === tenant.id ? "Opening…" : "Open as support"}
          </MenuItem>
          {/* The bare address, for the rare time you want to see what a member
              of this clinic's staff sees when they arrive — the sign-in screen
              itself, with no session attached. */}
          <a
            role="menuitem"
            href={clinicUrl(tenant.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-[0.8438rem] text-ink transition-colors hover:bg-surface-3"
          >
            <IconExternal size={15} className="text-ink-3" />
            Open sign-in page
          </a>
          <MenuSep />
          <MenuItem icon={<IconSpark size={15} />} onClick={() => { setEditing(true); close(); }}>
            Edit clinic
          </MenuItem>
          <MenuItem icon={<IconLayers size={15} />} onClick={() => { setModules(true); close(); }}>
            Modules
          </MenuItem>
          <MenuSep />
          {tenant.status === "suspended" ? (
            <MenuItem
              icon={<IconCheck size={15} />}
              onClick={() => {
                setTenantStatus(tenant.id, "active");
                notify({ tone: "ok", title: `${tenant.name} reactivated`, body: "Its subdomain serves the app again." });
                close();
              }}
            >
              Reactivate
            </MenuItem>
          ) : (
            <MenuItem
              tone="critical"
              icon={<IconLock size={15} />}
              onClick={() => {
                setTenantStatus(tenant.id, "suspended");
                notify({ tone: "warn", title: `${tenant.name} suspended`, body: "Nobody can sign in on that subdomain now." });
                close();
              }}
            >
              Suspend clinic
            </MenuItem>
          )}
        </>
      )}
    </Menu>

    <EditClinic tenant={tenant} open={editing} onClose={() => setEditing(false)} />
    <ClinicModules tenant={tenant} open={modules} onClose={() => setModules(false)} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Edit a clinic's record.
 *
 * The subdomain is shown and cannot be changed. It is the clinic's address, it
 * is inside every live session token, and renaming it would sign the whole
 * practice out and break every bookmark at once — so it is rendered as a fact
 * rather than a field, which is what it is.
 *
 * Status is not here either: suspending a clinic takes its subdomain offline,
 * which is not an edit. That stays in the menu, with its own confirmation.
 */
function EditClinic({
  tenant, open, onClose,
}: {
  tenant: Tenant;
  open: boolean;
  onClose: () => void;
}) {
  const { host, updateTenant, notify } = useApp();
  const [name, setName] = React.useState(tenant.name);
  const [city, setCity] = React.useState(tenant.city);
  const [plan, setPlan] = React.useState(tenant.plan);
  const [type, setType] = React.useState<ClinicalTypeKey>(tenant.clinical_type);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(tenant.name); setCity(tenant.city);
      setPlan(tenant.plan); setType(tenant.clinical_type);
    }
  }, [open, tenant]);

  const nameError = !name.trim() ? "A clinic name is required." : null;

  const save = async () => {
    if (nameError) return;
    setBusy(true);
    try {
      await updateTenant(tenant.id, {
        name: name.trim(),
        city: city.trim() || "—",
        plan: plan.trim() || "Trial",
        clinical_type: type,
      });
      notify({ tone: "ok", title: `${name.trim()} updated` });
      onClose();
    } catch (error) {
      notify({
        tone: "critical",
        title: "Not saved",
        body: error instanceof Error ? error.message : "Try again.",
      });
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${tenant.name}`}
      subtitle="Its record, not its address and not its status."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { void save(); }} disabled={busy || !!nameError}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Clinic name" required className="sm:col-span-2" error={nameError}>
          <Input value={name} onChange={(e) => setName(e.target.value)} invalid={!!nameError} />
        </Field>

        <Field
          label="Subdomain"
          className="sm:col-span-2"
          help="Fixed for the life of the clinic — every live session token carries it."
        >
          <div className="tnum flex h-9.5 items-center rounded-[var(--r)] border border-line bg-surface-2 px-3 font-mono text-[0.8125rem] text-ink-3">
            {tenant.slug}.{host.root}{host.port ? `:${host.port}` : ""}
          </div>
        </Field>

        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Manchester" />
        </Field>
        <Field label="Plan">
          <Input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Trial" />
        </Field>

        <Field
          label="Clinical type"
          className="sm:col-span-2"
          help="Decides the exam fields new encounters get. Records already written keep the fields they were written with."
        >
          <Select value={type} onChange={(e) => setType(e.target.value as ClinicalTypeKey)}>
            {CLINICAL_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Which modules this clinic has, and the platform's own switch for each.
 *
 * The clinic-side screen records a clinic buying something; this is the same
 * row seen from above — for onboarding, for a trial, and for switching off
 * what was never paid for. The core five have no switch, because the product
 * does not work without them and the server refuses anyway.
 */
function ClinicModules({
  tenant, open, onClose,
}: {
  tenant: Tenant;
  open: boolean;
  onClose: () => void;
}) {
  const { setTenantFeature, notify } = useApp();
  const [rows, setRows] = React.useState<TenantFeature[] | null>(null);
  const [pending, setPending] = React.useState<FeatureKey | null>(null);

  React.useEffect(() => {
    if (!open) { setRows(null); return; }
    let cancelled = false;
    api.tenantFeatures(tenant.id)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [open, tenant.id]);

  const statusOf = (key: FeatureKey) =>
    rows?.find((r) => r.feature_key === key)?.status ?? "inactive";

  const toggle = async (key: FeatureKey) => {
    const next = statusOf(key) === "active" ? "inactive" : "active";
    setPending(key);
    try {
      const saved = await setTenantFeature(tenant.id, key, next);
      setRows((current) => {
        const others = (current ?? []).filter((r) => r.feature_key !== key);
        return [...others, saved];
      });
      notify({
        tone: next === "active" ? "ok" : "warn",
        title: `${FEATURE_BY_KEY[key].name} ${next === "active" ? "enabled" : "disabled"}`,
        body: next === "active"
          ? `${tenant.name} can use it now.`
          : `Its routes are shut for ${tenant.name} again.`,
      });
    } catch (error) {
      notify({
        tone: "critical",
        title: "Not changed",
        body: error instanceof Error ? error.message : "Try again.",
      });
    }
    setPending(null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${tenant.name} — modules`}
      subtitle="Entitlement, not configuration. Switching one off closes its routes, it does not delete anything."
      footer={<Button variant="ghost" onClick={onClose}>Done</Button>}
    >
      {rows === null ? (
        <p className="py-6 text-center text-[0.8125rem] text-ink-3">Loading…</p>
      ) : (
        <div className="divide-y divide-line-soft">
          {FEATURES.map((feature) => {
            const active = statusOf(feature.key) === "active";
            return (
              <div key={feature.key} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[0.875rem] font-medium text-ink">
                    {feature.name}
                    {feature.is_core && <Badge tone="neutral" size="sm" dot={false}>Core</Badge>}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-3">{feature.summary}</p>
                </div>

                {feature.is_core ? (
                  <span className="shrink-0 self-center text-[0.75rem] text-ink-3">Always on</span>
                ) : (
                  <Button
                    variant={active ? "ghost" : "primary"}
                    size="sm"
                    className="shrink-0 self-center"
                    disabled={pending === feature.key}
                    onClick={() => { void toggle(feature.key); }}
                  >
                    {pending === feature.key ? "…" : active ? "Disable" : "Enable"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default function PlatformPage() {
  const router = useRouter();
  const { platformSession, ready } = useApp();

  React.useEffect(() => {
    if (ready && !platformSession.signedIn) router.replace("/platform/login");
  }, [ready, platformSession.signedIn, router]);

  if (!ready || !platformSession.signedIn) return <StageLoader />;
  return <Console />;
}

/* -------------------------------------------------------------------------- */

function Console() {
  const { host, platformUser, platformSignOut } = useApp();
  const { enter, entering } = useEnterClinic();
  const { data: snapshot, isPending } = usePlatformSnapshot();
  const [q, setQ] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<CreatedClinic | null>(null);
  const [view, setView] = React.useState<"clinics" | "billing">("clinics");

  const tenants = React.useMemo(() => snapshot?.tenants ?? [], [snapshot]);
  const rows = tenants.filter((r) => {
    const term = q.trim().toLowerCase();
    const t = r.tenant;
    return !term || t.name.toLowerCase().includes(term) || t.slug.includes(term) || t.city.toLowerCase().includes(term);
  });

  const counts = {
    active: tenants.filter((r) => r.tenant.status === "active").length,
    trial: tenants.filter((r) => r.tenant.status === "trial").length,
    suspended: tenants.filter((r) => r.tenant.status === "suspended").length,
  };
  const patients = tenants.reduce((sum, r) => sum + r.patients, 0);
  const encounters = tenants.reduce((sum, r) => sum + r.encounters, 0);

  /* What the platform bills, from the platform's own ledger.
     This used to be added up here, in the browser, out of a feature catalogue —
     which was right until the first plan bundled a module or discounted one.
     The server works it out over the invoices it actually raised, so the
     console and the invoices cannot drift apart. */
  const { data: billing } = useBillingMetrics();

  return (
    <div className="min-h-dvh bg-ground">
      {/* platform chrome — deliberately not the clinic chrome */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-stage text-stage-ink">
        <div className="mx-auto flex h-[var(--topbar-h)] w-full max-w-[1360px] items-center gap-3 px-4 sm:px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-accent-ink" aria-hidden>
            <IconShield size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[0.9375rem] font-semibold leading-tight tracking-[-0.01em]">
              Astrale Platform
            </p>
            <p className="tnum truncate font-mono text-[0.6875rem] text-stage-dim">
              admin.{host.root}{host.port ? `:${host.port}` : ""}
            </p>
          </div>

          <Badge tone="accent" size="sm">Super admin</Badge>

          {platformUser && (
            <Menu
              width={230}
              trigger={({ toggle }) => (
                <button onClick={toggle} className="flex items-center gap-2 rounded-[var(--r)] px-1.5 py-1 transition-colors hover:bg-white/10">
                  <Avatar name={platformUser.name} initials={platformUser.initials} size="xs" tintKey={platformUser.id} />
                  <span className="hidden text-[0.8125rem] font-medium sm:block">{platformUser.name}</span>
                </button>
              )}
            >
              {() => (
                <>
                  <div className="px-2.5 py-2">
                    <p className="text-[0.8438rem] font-semibold text-ink">{platformUser.name}</p>
                    <p className="mt-0.5 text-[0.75rem] text-ink-3">{platformUser.email}</p>
                  </div>
                  <MenuSep />
                  <MenuItem icon={<IconLogout size={15} />} onClick={platformSignOut}>Sign out</MenuItem>
                </>
              )}
            </Menu>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] px-4 py-7 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.13em] text-accent-text">Tenancy</p>
            <h1 className="font-display text-[1.625rem] font-semibold leading-tight tracking-[-0.025em] text-ink">
              Clinics on this platform
            </h1>
            <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-ink-2">
              This is the only screen that reads across tenants, and it is the only place a clinic can be created.
              Each one is handed its own subdomain — that address is what binds every later request to its data.
            </p>
          </div>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <IconPlus size={15} /> Create clinic
          </Button>
        </div>

        <Tabs
          className="mb-5"
          value={view}
          onChange={setView}
          tabs={[
            { value: "clinics", label: "Clinics", count: tenants.length },
            { value: "billing", label: "Billing" },
          ]}
        />

        {view === "clinics" && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Clinics" value={tenants.length} icon={<IconLayers size={16} />}
                hint={`${counts.active} active · ${counts.trial} trial · ${counts.suspended} suspended`} />
          <Stat label="Patients platform-wide" value={patients} icon={<IconUsers size={16} />}
                hint={`${encounters} encounters recorded`} />
          <Stat label="Recurring revenue" value={billing ? currency(billing.mrr) : "—"} unit="/mo" tone="ok"
                icon={<IconSpark size={16} />}
                hint={billing
                  ? `${billing.subscriptions_active} active · ${currency(billing.outstanding_total)} outstanding`
                  : "Reading the billing ledger…"} />
          <Stat label="Suspended" value={counts.suspended} tone={counts.suspended ? "critical" : "ok"}
                icon={<IconLock size={16} />} hint={counts.suspended ? "Their subdomains serve a notice" : "Every clinic is reachable"} />
        </section>
        )}

        {view === "billing" && <BillingMetricsConsole />}

        {view === "clinics" && (
        <>
        <Card className="mt-5 overflow-hidden">
          <CardHeader
            title="Tenants"
            subtitle="Name, address, entitlements and the data each one owns."
            actions={
              <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, subdomain or city"
                           wrapperClassName="w-56" className="h-8 text-[0.8125rem]" />
            }
          />
          <DataTable
            columns={tenantColumns}
            data={rows}
            getRowId={(r) => r.tenant.id}
            loading={isPending}
            pageSize={12}
            initialSorting={[{ id: "name", desc: false }]}
            minWidth="62rem"
            empty={
              <EmptyState
                icon={<IconLayers size={20} />}
                title="No clinic matches"
              />
            }
          />
        </Card>

        <div className="mt-5 max-w-3xl space-y-2 text-[0.75rem] leading-relaxed text-ink-3">
          <p>
            Creating a clinic seeds the five core modules, clones the field set for its clinical type and creates its
            first admin — §3.1 of the workflow document, performed by the platform rather than by a self-service form
            inside a tenant. Paid modules stay off until that clinic buys them in its own settings.
          </p>
          {host.root === "localhost" && (
            <p className="rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2 text-warn-text">
              Local development note: a console session is not a clinic session. Opening a clinic from here lands you
              on its sign-in screen, which is exactly right — platform staff have no account inside any clinic, and the
              API refuses a console token at a clinic address.
            </p>
          )}
        </div>
        </>
        )}
      </main>

      <CreateClinic
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(next) => { setCreating(false); setCreated(next); }}
      />

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        width="sm"
        title={created ? `${created.name} is live` : ""}
        subtitle={
          created?.invitationSent
            ? "Its subdomain is serving already, and its first admin has been invited."
            : "Its subdomain is serving, but the invitation did not send."
        }
        footer={
          created && (
            <>
              <Button variant="ghost" onClick={() => setCreated(null)}>Close</Button>
              {/* As support, not as a link. This clinic's admin has not chosen
                  a password yet, so its sign-in screen is a door nobody can
                  open — including whoever just created it. */}
              <Button
                variant="primary"
                disabled={entering === created.tenantId}
                onClick={() => { void enter({ ...created.tenant }); }}
              >
                {entering === created.tenantId ? "Opening…" : "Open clinic"}
                <IconArrowRight size={15} />
              </Button>
            </>
          )
        }
      >
        {created && (
          <div className="space-y-4">
            <div className="rounded-[var(--r)] border border-line bg-surface-2 p-3.5 text-center">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">Address</p>
              <p className="tnum mt-1.5 break-all font-mono text-[0.9375rem] font-medium text-ink">
                {created.slug}.{host.root}{host.port ? `:${host.port}` : ""}
              </p>
            </div>
            <InvitationPanel created={created} onResent={setCreated} />
            <dl className="grid grid-cols-2 gap-4">
              <KV label="Plan" value="Trial" />
              <KV label="Modules" value="Core loop only" />
            </dl>
            <p className="text-[0.75rem] leading-relaxed text-ink-2">
              Nothing about this clinic can be reached from another clinic's address, and its data starts empty.
              Until its administrator follows the link, the account has no password at all — so there is
              nothing to guess and nothing to leak.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** What the console is told after a clinic is created — never a password. */
interface CreatedClinic {
  name: string;
  slug: string;
  email: string;
  /** false means the clinic exists but nobody can sign into it yet */
  invitationSent: boolean;
  /** only under the development mail transport; otherwise it is in an inbox */
  invitationUrl: string | null;
  tenantId: Id;
  userId: Id;
  /** the row itself, so the console can enter the clinic it just made */
  tenant: Tenant;
}

function CreateClinic({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: CreatedClinic) => void;
}) {
  const { host, createTenant, notify } = useApp();
  const { data: snapshot } = usePlatformSnapshot();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [city, setCity] = React.useState("");
  const [type, setType] = React.useState<ClinicalTypeKey>("dental");
  const [admin, setAdmin] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(""); setSlug(""); setSlugTouched(false); setCity("");
      setType("dental"); setAdmin(""); setEmail(""); setTouched(false);
    }
  }, [open]);

  /* the subdomain follows the name until it is edited by hand */
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const taken = (snapshot?.tenants ?? []).map((r) => r.tenant.slug);

  /* Two checks, and they answer different questions. The local one is instant
     and covers shape and the clinics this console already knows about; the
     server's is authoritative and knows about the ones it does not. Neither
     reserves anything — the unique index settles a real race. */
  const localSlugProblem = effectiveSlug || touched ? slugProblem(effectiveSlug, taken) : null;
  const remote = useSlugCheck(localSlugProblem ? "" : effectiveSlug);
  const slugError = localSlugProblem ?? remote.problem;

  const nameError = touched && !name.trim() ? "A clinic name is required." : null;
  const adminError = touched && !admin.trim() ? "Name the first admin." : null;
  const emailError =
    touched && !email.trim() ? "An address to send the invitation to." : null;

  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setTouched(true);
    if (!name.trim() || !admin.trim() || !email.trim() || slugProblem(effectiveSlug, taken)) return;

    const adminEmail = email.trim();
    setBusy(true);
    let result;
    try {
      /* The subdomain is claimed by the server, not by this form: two people
         creating "harbour" at once means the second one hears about it here. */
      result = await createTenant({
        name: name.trim(),
        slug: effectiveSlug,
        city: city.trim() || "—",
        clinical_type: type,
        admin_name: admin.trim(),
        admin_email: adminEmail,
      });
    } catch (error) {
      setBusy(false);
      notify({
        tone: "critical",
        title: "That clinic was not created",
        body: error instanceof Error ? error.message : "Try again.",
      });
      return;
    }
    setBusy(false);

    /* A clinic whose admin never got the link exists but cannot be signed
       into, so that is not a success message. */
    notify(
      result.invitationSent
        ? { tone: "ok", title: `${name.trim()} created`, body: `Invitation sent to ${adminEmail}.` }
        : {
            tone: "warn",
            title: `${name.trim()} created, but the invitation did not send`,
            body: "Nobody can sign in until it does. Try Resend.",
          },
    );
    onCreated({
      name: name.trim(),
      slug: effectiveSlug,
      email: adminEmail,
      invitationSent: result.invitationSent,
      invitationUrl: result.invitationUrl,
      tenantId: result.tenantId,
      userId: result.userId,
      tenant: result.tenant,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a clinic"
      subtitle="Creates the tenant, claims its subdomain, seeds the core modules and makes its first admin."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { void submit(); }} disabled={busy}>
            <IconSpark size={15} /> {busy ? "Creating…" : "Create clinic"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Clinic name" required className="sm:col-span-2" error={nameError}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Harbourside Dental" />
        </Field>

        <Field
          label="Subdomain"
          required
          className="sm:col-span-2"
          error={slugError}
          help={!slugError ? "This is the address the clinic signs in at." : undefined}
        >
          <div className="flex items-stretch">
            <Input
              value={effectiveSlug}
              onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
              placeholder="harbourside"
              invalid={!!slugError}
              className="rounded-r-none"
            />
            <span className="tnum inline-flex items-center rounded-r-[var(--r)] border border-l-0 border-line-strong bg-surface-2 px-3 font-mono text-[0.8125rem] text-ink-3">
              .{host.root}{host.port ? `:${host.port}` : ""}
            </span>
          </div>
        </Field>

        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Manchester" />
        </Field>
        <Field label="Clinical type" required help="Decides the exam fields every encounter gets.">
          <Select value={type} onChange={(e) => setType(e.target.value as ClinicalTypeKey)}>
            {CLINICAL_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </Field>

        <Field label="First admin" required error={adminError}>
          <Input value={admin} onChange={(e) => setAdmin(e.target.value)} placeholder="Their name" />
        </Field>
        <Field label="Admin email" required error={emailError}
               help={!emailError ? "Their username, and where the invitation goes." : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder={`admin@${effectiveSlug || "clinic"}.test`} invalid={!!emailError} />
        </Field>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-[var(--r)] border border-accent-border bg-accent-soft px-3 py-2.5 text-[0.75rem] leading-relaxed text-accent-text">
        <IconLock size={13} className="mt-0.5 shrink-0" />
        <span>
          No password is set here, by anyone. The account is created without one and this
          person is emailed a single-use link to choose their own — so the password their
          clinic runs on is one nobody at the platform has ever seen.
        </span>
      </div>

      <div className="mt-4 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">Seeded on creation</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FEATURES.filter((f) => f.is_core).map((f) => (
            <Badge key={f.key} tone="accent" size="sm" dot={false}>{f.name}</Badge>
          ))}
          <span className={cn("text-[0.75rem] text-ink-3", "self-center")}>
            — paid modules stay off until the clinic buys them
          </span>
        </div>
      </div>
    </Modal>
  );
}


/* -------------------------------------------------------------------------- */

/**
 * Is this subdomain free?
 *
 * Asked of the server while somebody types, debounced so a name typed at speed
 * is one question rather than twelve. The answer is advisory — it reserves
 * nothing — but it is the same rule the create path enforces, so what the form
 * says here is what the submit will do.
 */
function useSlugCheck(slug: string) {
  const [problem, setProblem] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (!slug) { setProblem(null); setChecking(false); return; }

    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      api.checkSlug(slug)
        .then((answer) => { if (!cancelled) setProblem(answer.available ? null : answer.problem); })
        .catch(() => { if (!cancelled) setProblem(null); })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [slug]);

  return { problem, checking };
}

/**
 * What happened to the invitation, and how to send it again.
 *
 * The link itself only appears under the development mail transport, where
 * there is no inbox to check. With a real transport it exists in exactly one
 * place, which is the point of the whole arrangement.
 */
function InvitationPanel({
  created, onResent,
}: {
  created: CreatedClinic;
  onResent: (next: CreatedClinic) => void;
}) {
  const { resendTenantInvitation, notify } = useApp();
  const [busy, setBusy] = React.useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      const again = await resendTenantInvitation(created.tenantId, created.userId);
      onResent({ ...created, invitationSent: again.invitationSent, invitationUrl: again.invitationUrl });
      notify(
        again.invitationSent
          ? { tone: "ok", title: "Invitation sent", body: `Another link is on its way to ${created.email}.` }
          : { tone: "critical", title: "Still could not send", body: "Check the mail transport." },
      );
    } catch (error) {
      notify({
        tone: "critical",
        title: "Could not resend",
        body: error instanceof Error ? error.message : "Try again.",
      });
    }
    setBusy(false);
  };

  return (
    <div
      className={cn(
        "rounded-[var(--r)] border p-3.5",
        created.invitationSent
          ? "border-accent-border bg-accent-soft"
          : "border-critical-border bg-critical-soft",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[0.6875rem] font-semibold uppercase tracking-[0.09em]",
              created.invitationSent ? "text-accent-text" : "text-critical-text",
            )}
          >
            {created.invitationSent ? "Invitation sent" : "Invitation not sent"}
          </p>
          <p className="tnum mt-1 break-all font-mono text-[0.8125rem] text-ink">{created.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { void resend(); }} disabled={busy}>
          {busy ? "Sending…" : "Resend"}
        </Button>
      </div>

      <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-2">
        {created.invitationSent
          ? "They choose their own password from the link. It works once and expires."
          : "Nobody can sign in to this clinic until a link reaches them."}
      </p>

      {created.invitationUrl && (
        <div className="mt-2.5 border-t border-line-soft pt-2.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">
            Development link
          </p>
          <p className="mt-1 text-[0.6875rem] leading-snug text-ink-3">
            Shown only because mail is going to the log. Configure a real transport and this
            disappears — the link then exists in one inbox and nowhere else.
          </p>
          <a
            href={created.invitationUrl}
            className="tnum mt-1.5 block break-all font-mono text-[0.75rem] text-accent-text underline-offset-4 hover:underline"
          >
            {created.invitationUrl}
          </a>
        </div>
      )}
    </div>
  );
}
