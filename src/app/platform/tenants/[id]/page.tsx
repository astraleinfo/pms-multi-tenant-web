"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useQueryClient } from "@tanstack/react-query";
import { isSuperAdmin } from "@/lib/api";
import { qk } from "@/lib/query/keys";
import {
  usePlatformSnapshot, usePlatformSubscription, usePlatformTenantUsers,
} from "@/lib/query/hooks";
import { CLINICAL_TYPES, MODULES } from "@/lib/data/catalog";
import { currency, formatDate, pluralise, titleCase } from "@/lib/format";
import { consoleRows, type ConsoleRow } from "@/lib/platform/subscriptions";
import type { ClinicalTypeKey, User } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader, CardFooter, Legend } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, KV } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Field, Input, Select } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/loader";
import { PageHeader } from "@/components/ui/page-header";
import { Callout } from "@/components/ui/callout";
import { Monogram } from "@/components/layout/rail";
import { ConsolePage, TenantAddress, useEnterClinic } from "@/components/platform/chrome";
import { TenantStatusButton } from "@/components/platform/tenant-actions";
import { ClinicBills } from "@/components/platform/clinic-bills";
import { ImportButton } from "@/components/platform/import-dialog";
import { AccountBadge } from "@/components/platform/account-badge";
import { SubscriptionPlan } from "@/components/domain/subscription";
import {
  IconChevronLeft, IconInfo, IconLayers, IconReceipt, IconShield, IconUsers
} from "@/components/ui/icons";

/* ==========================================================================
   One clinic, from above.

   Everything the console knows about a tenant on one screen: its record, what
   it pays and its bills, and the people inside it. It has every module, as
   every clinic does, so there is nothing about modules to switch here.
   ========================================================================== */

export default function TenantPage(props: PageProps<"/platform/tenants/[id]">) {
  const { id } = React.use(props.params);
  return <ConsolePage><TenantConsole id={id} /></ConsolePage>;
}

type Tab = "details" | "bills" | "staff";

function TenantConsole({ id }: { id: string }) {
  const { data: snapshot, isPending } = usePlatformSnapshot();
  /* The clinic's own plan carries today's fee, so this page needs nothing
     platform-wide to say what the clinic pays. */
  const { data: subscription } = usePlatformSubscription(id);
  const fee = subscription?.plan?.price_monthly ?? 0;
  const [tab, setTab] = React.useState<Tab>("details");

  const row = React.useMemo(() => {
    const snapshotRow = snapshot?.tenants.find((r) => r.tenant.id === id);
    return snapshotRow ? consoleRows([snapshotRow], fee)[0] : null;
  }, [snapshot, id, fee]);

  if (isPending) return <PageLoader label="Opening the clinic…" />;
  if (!row) return <NotHere />;

  const priced = !!subscription;

  return (
    <>
      <TenantHeader row={row} fee={priced ? fee : null} />

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Monthly subscription"
          value={priced ? currency(row.mrr) : "…"}
          unit={row.mrr ? "/mo" : undefined}
          icon={<IconReceipt size={16} />}
          hint={
            !priced ? "reading the plan…"
              : row.mrr ? `${currency(row.mrr * 12)} a year`
                : "Nothing is billed for this clinic"
          }
        />
        <Stat
          label="Modules" value={MODULES.length}
          icon={<IconLayers size={16} />}
          hint="Every module, as every clinic has"
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
          { value: "details", label: "Details", icon: <IconInfo size={15} /> },
          { value: "bills", label: "Subscription", icon: <IconReceipt size={15} /> },
          { value: "staff", label: "Staff", icon: <IconUsers size={15} />, count: row.users },
        ]}
      />

      {tab === "details" && <DetailsTab row={row} />}
      {tab === "bills" && <BillsTab tenantId={row.tenant.id} />}
      {tab === "staff" && <StaffTab row={row} />}
    </>
  );
}

function NotHere() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={<IconLayers size={26} />}
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

function TenantHeader({ row, fee }: { row: ConsoleRow; fee: number | null }) {
  const { enter, entering } = useEnterClinic();
  const tenant = row.tenant;

  return (
    <>
      {/* the same header the clinic-side record pages use: this one used to be
          a hand-built copy of it, and drifted a size and a gap away from them */}
      <PageHeader
        back={{ href: "/platform/tenants", label: "All tenants" }}
        leading={<Monogram name={tenant.name} size={46} />}
        title={tenant.name}
        status={
          <Badge
            tone={tenant.status === "active" ? "ok" : tenant.status === "trial" ? "warn" : "critical"}
            size="sm"
            dot
          >
            {titleCase(tenant.status)}
          </Badge>
        }
        meta={
          <>
            <AccountBadge state={row.state} />
            <TenantAddress tenant={tenant} />
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              disabled={entering === tenant.id}
              onClick={() => { void enter(tenant); }}
            >
              <IconShield size={15} /> {entering === tenant.id ? "Opening…" : "Open as support"}
            </Button>
            <ImportButton tenant={tenant} />
            <TenantStatusButton tenant={tenant} />
          </>
        }
        className={tenant.status === "suspended" ? "mb-3" : undefined}
      />

      {tenant.status === "suspended" && (
        <Callout tone="critical" title="Suspended" className="mb-6">
          Its subdomain serves a notice rather than the app, nobody can sign in, and its{" "}
          {fee === null ? "" : `${currency(fee)}/mo `}subscription is not billed until it is reactivated.
        </Callout>
      )}
    </>
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
          icon={<IconUsers size={15} />} tone="accent" title="Clinic record"
          hint="What this clinic is called and how it is set up. Its address and its status are changed elsewhere."
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Clinic name" required className="sm:col-span-2" error={nameError}>
              <Input value={name} onChange={(e) => setName(e.target.value)} invalid={!!nameError} />
            </Field>

            <Field label="City">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Manchester" />
            </Field>
            <Field label="Plan" help="A label for the commercial arrangement. It grants nothing and limits nothing — every clinic has every module.">
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
          <p className="text-caption text-ink-3">
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
          <CardHeader icon={<IconInfo size={15} />} tone="neutral" title="Facts" hint="Set when the clinic was created, and fixed for its life." />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4">
              <KV
                label="Subdomain"
                mono
                value={`${tenant.slug}.${host.root}${host.port ? `:${host.port}` : ""}`}
                className="col-span-2"
              />
              <KV label="Tenant id" value={tenant.id} mono className="col-span-2" />
              <KV label="On the platform since" value={formatDate(tenant.since, "long")} />
              <KV label="Timezone" value={tenant.timezone} />
              <KV label="Local date" value={formatDate(tenant.today, "long")} />
              <KV
                label="Last activity"
                value={row.last_activity ? formatDate(row.last_activity, "long") : "—"}
              />
            </dl>
            <p className="mt-4 border-t border-line-soft pt-3 text-caption leading-relaxed text-ink-3">
              The subdomain cannot be changed. It is inside every live session token, so renaming it
              would sign the whole practice out and break every bookmark at once.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<IconLayers size={15} />} tone="violet" title="What this clinic holds" hint="Its own data, counted by the API one tenant at a time." />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4">
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
        icon={<IconUsers size={15} />} tone="accent" title="Staff accounts"
        hint="Everyone with a sign-in at this clinic. Support sessions are not accounts and are not listed."
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
                        <p className="truncate text-caption text-ink-3">{u.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="text-ink-2">{ROLE_LABEL[u.role]}</span>
                    {u.speciality && <span className="ml-1.5 text-caption text-ink-3">{u.speciality}</span>}
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
                      <span className="ml-2 text-caption text-ink-3">
                        {pluralise(u.failed_attempts, "failed attempt")}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <span className={cn("tnum font-mono text-label", u.last_sign_in ? "text-ink-2" : "text-ink-3")}>
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
        <p className="text-caption leading-relaxed text-ink-3">
          Staff are a clinic's own business: its practice admin invites colleagues from inside its
          settings, and the invitation goes to an inbox the platform never reads. The console
          creates exactly one account per clinic — the first admin — because until that exists
          nobody can create the rest.
        </p>
      </div>
    </Card>
  );
}


/** What this clinic owes the platform — the same list the Bills section shows. */
function BillsTab({ tenantId }: { tenantId: string }) {
  const { platformUser } = useApp();
  const queryClient = useQueryClient();
  const { data: tenant } = usePlatformSnapshot();
  const { data, isPending } = usePlatformSubscription(tenantId);
  const clinic = tenant?.tenants.find((r) => r.tenant.id === tenantId)?.tenant;

  if (isPending || !data || !clinic) return <PageLoader label="Reading the bills…" minHeight="30vh" />;
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<IconLayers size={15} />} tone="violet" title="Plan"
          hint="One fee for the whole product, the same for every clinic. It is set in the console's settings."
        />
        <SubscriptionPlan subscription={data} />
      </Card>
      <Card>
        <CardHeader icon={<IconReceipt size={15} />} tone="ok" title="Subscription bills" hint="Monthly bills for the subscription fee, and whether they are holding the clinic." />
        <CardBody>
          <ClinicBills
            row={{ tenant: clinic, invoices: data.invoices, summary: data.summary }}
            superAdmin={isSuperAdmin(platformUser)}
            onChanged={() => { void queryClient.invalidateQueries({ queryKey: qk.platformRoot() }); }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
