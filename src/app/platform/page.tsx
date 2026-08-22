"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { usePlatformSnapshot } from "@/lib/query/hooks";
import type { PlatformTenantRow } from "@/lib/api";
import { CLINICAL_TYPES, FEATURE_BY_KEY, FEATURES } from "@/lib/data/catalog";
import { currency, formatDate, titleCase } from "@/lib/format";
import { slugProblem, slugify } from "@/lib/tenancy";
import type { ClinicalTypeKey, Tenant } from "@/lib/types";
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

function TenantAddress({ tenant }: { tenant: Tenant }) {
  const { host, clinicUrl } = useApp();
  return (
    <a href={clinicUrl(tenant.slug)}
       className="tnum inline-flex items-center gap-1.5 font-mono text-[0.8125rem] text-accent-text underline-offset-4 hover:underline">
      {tenant.slug}.{host.root}
      <IconExternal size={12} />
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
  return (
    <Menu
      width={210}
      trigger={({ toggle }) => (
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={`Manage ${tenant.name}`}>
          <IconMore size={16} />
        </Button>
      )}
    >
      {(close) => (
        <>
          <a
            role="menuitem"
            href={clinicUrl(tenant.slug)}
            className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-[0.8438rem] text-ink transition-colors hover:bg-surface-3"
          >
            <IconExternal size={15} className="text-ink-3" />
            Open clinic
          </a>
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
  const { host, platformUser, platformSignOut, clinicUrl } = useApp();
  const { data: snapshot, isPending } = usePlatformSnapshot();
  const [q, setQ] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<{ name: string; slug: string; email: string; password: string } | null>(null);

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

  /* what the platform bills: active paid modules, per live clinic */
  const mrr = tenants
    .filter((r) => r.tenant.status !== "suspended")
    .reduce((sum, r) => sum + paidModules(r).reduce((s, k) => s + FEATURE_BY_KEY[k].price_monthly, 0), 0);

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
              {host.root}{host.port ? `:${host.port}` : ""}
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

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Clinics" value={tenants.length} icon={<IconLayers size={16} />}
                hint={`${counts.active} active · ${counts.trial} trial · ${counts.suspended} suspended`} />
          <Stat label="Patients platform-wide" value={patients} icon={<IconUsers size={16} />}
                hint={`${encounters} encounters recorded`} />
          <Stat label="Module revenue" value={currency(mrr)} unit="/mo" tone="ok" icon={<IconSpark size={16} />}
                hint="Active paid modules across live clinics" />
          <Stat label="Suspended" value={counts.suspended} tone={counts.suspended ? "critical" : "ok"}
                icon={<IconLock size={16} />} hint={counts.suspended ? "Their subdomains serve a notice" : "Every clinic is reachable"} />
        </section>

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
        subtitle="Its subdomain is serving already — the first admin can sign in there now."
        footer={
          created && (
            <>
              <Button variant="ghost" onClick={() => setCreated(null)}>Close</Button>
              <a
                href={clinicUrl(created.slug)}
                className="inline-flex h-9.5 items-center gap-2 rounded-[var(--r)] bg-accent px-3.5 text-[0.8438rem] font-medium text-accent-ink shadow-e1 transition-colors hover:bg-accent-hover"
              >
                Open clinic <IconArrowRight size={15} />
              </a>
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
            <div className="rounded-[var(--r)] border border-accent-border bg-accent-soft p-3.5">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-accent-text">
                First admin credentials
              </p>
              <dl className="mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.75rem] text-ink-2">Email</dt>
                  <dd className="tnum break-all font-mono text-[0.8125rem] text-ink">{created.email}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.75rem] text-ink-2">Password</dt>
                  <dd className="tnum font-mono text-[0.8125rem] text-ink">{created.password}</dd>
                </div>
              </dl>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <KV label="Plan" value="Trial" />
              <KV label="Modules" value="Core loop only" />
            </dl>
            <p className="text-[0.75rem] leading-relaxed text-ink-2">
              Nothing about this clinic can be reached from another clinic's address, and its data starts empty.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateClinic({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: { name: string; slug: string; email: string; password: string }) => void;
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
  const [password, setPassword] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(""); setSlug(""); setSlugTouched(false); setCity("");
      setType("dental"); setAdmin(""); setEmail(""); setPassword(""); setTouched(false);
    }
  }, [open]);

  /* the subdomain follows the name until it is edited by hand */
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const taken = (snapshot?.tenants ?? []).map((r) => r.tenant.slug);
  const slugError = effectiveSlug || touched ? slugProblem(effectiveSlug, taken) : null;
  const nameError = touched && !name.trim() ? "A clinic name is required." : null;
  const adminError = touched && !admin.trim() ? "Name the first admin." : null;
  /* the API will not accept a shorter one, so the form does not pretend it might */
  const passwordError = touched && password.length < 12 ? "At least twelve characters." : null;

  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setTouched(true);
    if (!name.trim() || !admin.trim() || password.length < 12 || slugProblem(effectiveSlug, taken)) return;

    const adminEmail = email.trim() || `admin@${effectiveSlug}.clinic`;
    setBusy(true);
    try {
      /* The subdomain is claimed by the server, not by this form: two people
         creating "harbour" at once means the second one hears about it here. */
      await createTenant({
        name: name.trim(),
        slug: effectiveSlug,
        city: city.trim() || "—",
        clinical_type: type,
        admin_name: admin.trim(),
        admin_email: adminEmail,
        admin_password: password,
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
    notify({ tone: "ok", title: `${name.trim()} created`, body: `Serving at ${effectiveSlug}.${host.root}` });
    onCreated({ name: name.trim(), slug: effectiveSlug, email: adminEmail, password });
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
        <Field label="Admin email" help="This is the username they sign in with.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder={`admin@${effectiveSlug || "clinic"}.test`} />
        </Field>
        <Field label="Temporary password" required className="sm:col-span-2" error={passwordError}
               help={!passwordError ? "Hand this to them out of band; they sign in with it at the new subdomain." : undefined}>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                 placeholder="at least six characters" invalid={!!passwordError} />
        </Field>
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
