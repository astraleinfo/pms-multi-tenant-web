"use client";

import * as React from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/app-store";
import {
  usePlatformSnapshot, usePlatformTenantFeatures, usePlatformTenantUsers,
} from "@/lib/query/hooks";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { currency, formatDate, pluralise, titleCase } from "@/lib/format";
import {
  PAID_FEATURES, consoleRows, type ConsoleRow, type Subscription,
} from "@/lib/platform/subscriptions";
import type { ClinicalTypeKey, TenantFeature, User } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader, CardFooter, Legend } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, KV, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Field, Input, Select } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/loader";
import { Monogram } from "@/components/layout/rail";
import { ConsolePage, TenantAddress, useEnterClinic } from "@/components/platform/chrome";
import { TenantStatusButton } from "@/components/platform/tenant-actions";
import {
  AccountBadge, BillingBadge, ModulePrice, ModuleSwitch, useModuleSwitch,
} from "@/components/platform/module-controls";
import {
  IconChevronLeft, IconLayers, IconReceipt, IconShield, IconUsers,
} from "@/components/ui/icons";

/* ==========================================================================
   One clinic, from above.

   Everything the console knows about a tenant on one screen: its record, the
   modules it holds and what each costs, the people inside it, and the switches
   for all of that. It replaces two dialogs that each showed a third of this and
   neither of which could show the third thing — what the clinic pays.
   ========================================================================== */

export default function TenantPage(props: PageProps<"/platform/tenants/[id]">) {
  const { id } = React.use(props.params);
  return <ConsolePage><TenantConsole id={id} /></ConsolePage>;
}

type Tab = "details" | "modules" | "staff";

function TenantConsole({ id }: { id: string }) {
  const { data: snapshot, isPending } = usePlatformSnapshot();
  const { data: entitlements, isPending: featuresPending } = usePlatformTenantFeatures(id);
  const [tab, setTab] = React.useState<Tab>("details");

  const row = React.useMemo(() => {
    const snapshotRow = snapshot?.tenants.find((r) => r.tenant.id === id);
    if (!snapshotRow) return null;
    const byTenant = new Map<string, TenantFeature[]>();
    if (!featuresPending) byTenant.set(id, entitlements);
    return consoleRows([snapshotRow], byTenant)[0];
  }, [snapshot, id, entitlements, featuresPending]);

  if (isPending) return <PageLoader label="Opening the clinic…" />;
  if (!row) return <NotHere />;

  const paidOn = [...row.billed, ...row.trialing, ...row.held];

  return (
    <>
      <TenantHeader row={row} />

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Monthly subscription" value={currency(row.mrr)} unit={row.mrr ? "/mo" : undefined}
          icon={<IconReceipt size={16} />}
          hint={row.mrr ? `${currency(row.mrr * 12)} a year` : "Nothing is billed for this clinic"}
        />
        <Stat
          label="Paid modules" value={`${paidOn.length} / ${PAID_FEATURES.length}`}
          icon={<IconLayers size={16} />}
          hint={
            row.trialing.length
              ? `${pluralise(row.trialing.length, "on trial", "on trial")}`
              : `${row.locked.length} still locked`
          }
        />
        <Stat
          label="Staff accounts" value={row.users} icon={<IconUsers size={16} />}
          hint={`${row.patients} patients registered`}
        />
        <Stat
          label="Clinic billing" value={currency(row.revenue)} icon={<IconShield size={16} />}
          hint={`${row.invoices} invoices raised — the clinic's own money, not the platform's`}
        />
      </section>

      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: "details", label: "Details" },
          { value: "modules", label: "Modules", count: paidOn.length },
          { value: "staff", label: "Staff", count: row.users },
        ]}
      />

      {tab === "details" && <DetailsTab row={row} />}
      {tab === "modules" && <ModulesTab row={row} loading={featuresPending} />}
      {tab === "staff" && <StaffTab row={row} />}
    </>
  );
}

function NotHere() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        title="No such clinic"
        body="It is not on this platform, or it has been removed. The console reads the snapshot, so a clinic created elsewhere appears here as soon as that refreshes."
        action={
          <ButtonLink href="/platform/tenants" variant="secondary" size="sm">
            <IconChevronLeft size={14} /> Back to tenants
          </ButtonLink>
        }
      />
    </Card>
  );
}

/* ---- header ---------------------------------------------------------------- */

function TenantHeader({ row }: { row: ConsoleRow }) {
  const { enter, entering } = useEnterClinic();
  const tenant = row.tenant;

  return (
    <header className="mb-6">
      <Link
        href="/platform/tenants"
        className="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-2 transition-colors hover:text-ink"
      >
        <IconChevronLeft size={14} /> All tenants
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <Monogram name={tenant.name} size={46} />
          <div className="min-w-0">
            <h1 className="font-display text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
              {tenant.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge
                tone={tenant.status === "active" ? "ok" : tenant.status === "trial" ? "warn" : "critical"}
                size="sm"
                dot
              >
                {titleCase(tenant.status)}
              </Badge>
              <AccountBadge state={row.state} />
              <TenantAddress tenant={tenant} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={entering === tenant.id}
            onClick={() => { void enter(tenant); }}
          >
            <IconShield size={15} /> {entering === tenant.id ? "Opening…" : "Open as support"}
          </Button>
          <TenantStatusButton tenant={tenant} />
        </div>
      </div>

      {tenant.status === "suspended" && (
        <p className="mt-4 rounded-[var(--r)] border border-critical-border bg-critical-soft px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-critical-text">
          This clinic is suspended. Its subdomain serves a notice rather than the app, nobody can
          sign in, and the {currency(row.held.reduce((t, s) => t + s.feature.price_monthly, 0))}/mo of
          modules it holds is collected by nobody until it is reactivated.
        </p>
      )}
    </header>
  );
}

/* ---- details --------------------------------------------------------------- */

/**
 * The clinic's record.
 *
 * The subdomain is shown and cannot be changed. It is the clinic's address, it
 * is inside every live session token, and renaming it would sign the whole
 * practice out and break every bookmark at once — so it is rendered as a fact
 * rather than a field, which is what it is.
 *
 * Status is not here either: suspending a clinic takes its subdomain offline,
 * which is not an edit. That is in the header, behind its own confirmation.
 */
function DetailsTab({ row }: { row: ConsoleRow }) {
  const { host, updateTenant, notify } = useApp();
  const tenant = row.tenant;

  const [name, setName] = React.useState(tenant.name);
  const [city, setCity] = React.useState(tenant.city);
  const [plan, setPlan] = React.useState(tenant.plan);
  const [type, setType] = React.useState<ClinicalTypeKey>(tenant.clinical_type);
  const [busy, setBusy] = React.useState(false);

  /* the snapshot can refresh under us — re-seed the form when it does */
  React.useEffect(() => {
    setName(tenant.name); setCity(tenant.city);
    setPlan(tenant.plan); setType(tenant.clinical_type);
  }, [tenant]);

  const nameError = !name.trim() ? "A clinic name is required." : null;
  const dirty =
    name !== tenant.name || city !== tenant.city
    || plan !== tenant.plan || type !== tenant.clinical_type;

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
    } catch (error) {
      notify({
        tone: "critical",
        title: "Not saved",
        body: error instanceof Error ? error.message : "Try again.",
      });
    }
    setBusy(false);
  };

  const reset = () => {
    setName(tenant.name); setCity(tenant.city);
    setPlan(tenant.plan); setType(tenant.clinical_type);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title="Clinic record"
          subtitle="What this clinic is called and how it is set up. Its address and its status are changed elsewhere."
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Clinic name" required className="sm:col-span-2" error={nameError}>
              <Input value={name} onChange={(e) => setName(e.target.value)} invalid={!!nameError} />
            </Field>

            <Field label="City">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Manchester" />
            </Field>
            <Field label="Plan" help="A label for the commercial arrangement; it grants nothing on its own.">
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
        </CardBody>
        <CardFooter>
          <p className="text-[0.75rem] text-ink-3">
            {dirty ? "Unsaved changes." : "Everything here matches the server."}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={reset} disabled={!dirty || busy}>Discard</Button>
            <Button
              variant="primary"
              onClick={() => { void save(); }}
              disabled={busy || !dirty || !!nameError}
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Facts" subtitle="Set when the clinic was created, and fixed for its life." />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <KV
                label="Subdomain"
                mono
                value={`${tenant.slug}.${host.root}${host.port ? `:${host.port}` : ""}`}
                className="col-span-2"
              />
              <KV label="Tenant id" value={tenant.id} mono className="col-span-2" />
              <KV label="On the platform since" value={formatDate(tenant.since, "long")} />
              <KV label="Timezone" value={tenant.timezone} />
              <KV label="Its today" value={formatDate(tenant.today, "long")} />
              <KV
                label="Last activity"
                value={row.last_activity ? formatDate(row.last_activity, "long") : "—"}
              />
            </dl>
            <p className="mt-4 border-t border-line-soft pt-3 text-[0.75rem] leading-relaxed text-ink-3">
              The subdomain cannot be changed. It is inside every live session token, so renaming it
              would sign the whole practice out and break every bookmark at once.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What this clinic holds" subtitle="Its own data, counted by the API one tenant at a time." />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <KV label="Patients" value={row.patients} mono />
              <KV label="Encounters" value={row.encounters} mono />
              <KV label="Appointments" value={row.appointments} mono />
              <KV label="Invoices" value={row.invoices} mono />
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ---- modules & billing ------------------------------------------------------ */

/**
 * Which modules this clinic has, what each costs, and the platform's own switch
 * for every one of them.
 *
 * Entitlement, not configuration: switching one off closes its routes, it does
 * not delete anything. The core five have no switch, because the product does
 * not work without them and the server refuses anyway.
 */
function ModulesTab({ row, loading }: { row: ConsoleRow; loading: boolean }) {
  const modules = useModuleSwitch();
  const tenant = row.tenant;

  const core = row.subscriptions.filter((s) => s.feature.is_core);
  const paid = row.subscriptions.filter((s) => !s.feature.is_core);
  const trialValue = row.trialing.reduce((t, s) => t + s.feature.price_monthly, 0);
  const lockedValue = row.locked.reduce((t, s) => t + s.feature.price_monthly, 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Subscription"
          subtitle="What this clinic is charged a month, and what it is charged for."
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
            <KV label="Billed now" value={`${currency(row.mrr)}/mo`} />
            <KV label="On trial" value={trialValue ? `${currency(trialValue)}/mo` : "—"} />
            <KV label="On hold" value={row.held.length ? `${currency(row.held.reduce((t, s) => t + s.feature.price_monthly, 0))}/mo` : "—"} />
            <KV label="Not yet sold" value={lockedValue ? `${currency(lockedValue)}/mo` : "—"} />
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.75rem]">
              <span className="text-ink-2">Paid modules held</span>
              <span className="tnum font-mono text-ink-3">
                {paid.length - row.locked.length} of {paid.length}
              </span>
            </div>
            <Meter
              value={paid.length - row.locked.length}
              max={paid.length}
              tone="accent"
            />
          </div>

          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">
            Figures are the catalogue price of what is switched on, not an invoice — the platform
            has no billing service behind it yet. Enabling a module starts counting it from today;
            a suspended clinic is held rather than billed.
          </p>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Paid modules"
          subtitle="The switch is the platform's. Nobody inside a clinic can throw it."
          actions={loading ? <span className="text-[0.75rem] text-ink-3">Reading entitlements…</span> : undefined}
        />
        <div className="divide-y divide-line-soft border-t border-line-soft">
          {paid.map((line) => (
            <ModuleRow
              key={line.feature.key}
              line={line}
              busy={modules.isBusy(tenant.id, line.feature.key)}
              onRequest={modules.request}
            />
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Core modules"
          subtitle="Seeded when the clinic was created. In every plan, and not switchable."
        />
        <div className="divide-y divide-line-soft border-t border-line-soft">
          {core.map((line) => (
            <ModuleRow
              key={line.feature.key}
              line={line}
              busy={false}
              onRequest={modules.request}
            />
          ))}
        </div>
      </Card>

      {modules.dialog}
    </div>
  );
}

function ModuleRow({
  line, busy, onRequest,
}: {
  line: Subscription;
  busy: boolean;
  onRequest: ReturnType<typeof useModuleSwitch>["request"];
}) {
  const { feature } = line;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        {/* A core row said "Included", "Core", "Included in every plan" and
            "Always on" — four chips for one fact. It keeps the one word that
            names what it is; the switch column says the rest. */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[0.875rem] font-medium text-ink">{feature.name}</p>
          {feature.is_core
            ? <Badge tone="neutral" size="sm" dot={false}>Core</Badge>
            : <BillingBadge state={line.state} />}
        </div>
        <p className="mt-1 max-w-xl text-[0.75rem] leading-snug text-ink-3">{feature.summary}</p>
        {/* The activation date is only true of a module that is on: the server
            keeps `activated_at` when one is switched off, so a dormant row
            would otherwise claim to have been running since the day it was
            last deactivated. */}
        <p className="mt-1.5 text-[0.75rem] text-ink-3">
          Unlocks {feature.unlocks.join(", ")}
          {line.since && line.state !== "dormant" && <> · on since {formatDate(line.since)}</>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {!feature.is_core && <ModulePrice feature={feature} size="sm" />}
        <ModuleSwitch
          tenant={line.tenant}
          feature={feature}
          status={line.status}
          onRequest={onRequest}
          busy={busy}
          withTrial={!feature.is_core && line.status === "inactive"}
        />
      </div>
    </div>
  );
}

/* ---- staff ------------------------------------------------------------------ */

const ROLE_LABEL: Record<User["role"], string> = {
  tenant_admin: "Practice admin",
  receptionist: "Reception",
  doctor: "Clinician",
  pharmacist: "Pharmacy",
  lab_tech: "Lab",
};

function StaffTab({ row }: { row: ConsoleRow }) {
  const { data: users, isPending } = usePlatformTenantUsers(row.tenant.id);

  if (isPending) return <PageLoader label="Reading this clinic's staff…" minHeight="30vh" />;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Staff accounts"
        subtitle="Everyone with a sign-in at this clinic. Support sessions are not accounts and are not listed."
      />
      {users.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={20} />}
          title="No staff accounts"
          body="Not even the first admin — which means nobody can sign in to this clinic yet."
          compact
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH>Role</TH>
                <TH>Account</TH>
                <TH>Last sign-in</TH>
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} initials={u.initials} size="sm" tintKey={u.id} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{u.name}</p>
                        <p className="truncate text-[0.75rem] text-ink-3">{u.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="text-ink-2">{ROLE_LABEL[u.role]}</span>
                    {u.speciality && <span className="ml-1.5 text-[0.75rem] text-ink-3">{u.speciality}</span>}
                  </TD>
                  <TD>
                    <Badge
                      tone={u.status === "active" ? "ok" : u.status === "invited" ? "warn" : "critical"}
                      size="sm"
                      dot
                    >
                      {titleCase(u.status)}
                    </Badge>
                    {u.status === "locked" && (
                      <span className="ml-2 text-[0.75rem] text-ink-3">
                        {pluralise(u.failed_attempts, "failed attempt")}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <span className={cn("tnum font-mono text-[0.8125rem]", u.last_sign_in ? "text-ink-2" : "text-ink-3")}>
                      {u.last_sign_in ? formatDate(u.last_sign_in) : "never"}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <div className="border-t border-line-soft px-5 py-3">
        <Legend>Why there is no "add staff" here</Legend>
        <p className="text-[0.75rem] leading-relaxed text-ink-3">
          Staff are a clinic's own business: its practice admin invites colleagues from inside its
          settings, and the invitation goes to an inbox the platform never reads. The console
          creates exactly one account per clinic — the first admin — because until that exists
          nobody can create the rest.
        </p>
      </div>
    </Card>
  );
}
