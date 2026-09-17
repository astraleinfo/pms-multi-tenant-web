"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb, useSchema, useAnalytics, useUsers } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { CLINICAL_TYPES, FEATURES } from "@/lib/data/catalog";
import { activeFeatureKeys, selectUsers } from "@/lib/data/repository";
import { ROLE_LABEL } from "@/lib/nav";
import { currency, formatDate, formatTime12, pluralise, titleCase } from "@/lib/format";
import type { FeatureKey, FieldDefinition, FieldType, Role, User } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardFooter, CardHeader, Legend } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, KV } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import {
  ChoiceGroup, Checkbox, Field, Input, NumberInput, Select, Switch,
} from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RoleGate } from "@/components/domain/gates";
import { BillingTab } from "@/components/domain/billing";
import { useBillingSummary } from "@/lib/query/billing";
import { useTour } from "@/components/onboarding/tour";
import { Monogram } from "@/components/layout/rail";
import {
  IconAlert, IconCheck, IconKey, IconLayers, IconLock, IconMail, IconPlus, IconRefresh,
  IconShield, IconSpark, IconTrash, IconUnlock, IconUser, IconUsers,
} from "@/components/ui/icons";

type Tab = "practice" | "config" | "features" | "billing" | "fields" | "team" | "isolation";

const userCol = columnHelperFor<User>();

const teamColumns = userCol.columns([
  userCol.accessor("name", {
    header: "Person",
    cell: ({ row }) => <TeamPerson user={row.original} />,
  }),
  userCol.accessor("role", {
    header: "Role",
    cell: ({ getValue }) => <span className="text-ink-2">{ROLE_LABEL[getValue()]}</span>,
  }),
  userCol.accessor("email", {
    header: "Sign-in",
    cell: ({ row }) => (
      <>
        <span className="tnum block truncate font-mono text-[0.75rem] text-ink-2">{row.original.email}</span>
        {row.original.failed_attempts > 0 && (
          <span className="text-[0.6875rem] text-critical-text">
            {pluralise(row.original.failed_attempts, "failed attempt")}
          </span>
        )}
      </>
    ),
  }),
  userCol.accessor((u) => u.last_sign_in ?? "", {
    id: "last_sign_in",
    header: "Last seen",
    cell: ({ row }) => (
      <span className="text-ink-2">{row.original.last_sign_in ? formatDate(row.original.last_sign_in) : "Never"}</span>
    ),
  }),
  userCol.accessor("status", {
    header: "Account", meta: { align: "right" },
    cell: ({ getValue }) => (
      <Badge tone={getValue() === "active" ? "ok" : getValue() === "invited" ? "warn" : "critical"} size="sm" dot>
        {titleCase(getValue())}
      </Badge>
    ),
  }),
  userCol.display({
    id: "actions",
    header: "",
    meta: { align: "right", width: 210 },
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1.5">
        <PasswordControl user={row.original} />
        <LockControl user={row.original} />
      </div>
    ),
  }),
]);

/**
 * The account's own credential. An invited row has no password at all and the
 * API refuses its sign-in by name, so this is the button that finishes what
 * "Add person" started — and afterwards it is how a forgotten one is replaced.
 */
function PasswordControl({ user }: { user: User }) {
  const [open, setOpen] = React.useState(false);
  const invited = user.status === "invited";
  return (
    <>
      <Button size="sm" variant={invited ? "secondary" : "ghost"} onClick={() => setOpen(true)}>
        <IconKey size={14} /> {invited ? "Set password" : "Reset"}
      </Button>
      <SetPasswordModal user={user} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function TeamPerson({ user }: { user: User }) {
  const { session } = useApp();
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={user.name} initials={user.initials} size="sm" tintKey={user.id} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-medium text-ink">
          {user.name}
          {user.id === session.userId && <Badge tone="accent" size="sm" dot={false}>You</Badge>}
        </p>
        <p className="truncate text-[0.75rem] text-ink-3">{user.speciality ?? user.email}</p>
      </div>
    </div>
  );
}

function LockControl({ user }: { user: User }) {
  const { session, setUserStatus, notify } = useApp();
  if (user.id === session.userId) return <span className="text-[0.6875rem] text-ink-3">—</span>;
  return user.status === "locked" ? (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        setUserStatus(user.id, "active");
        notify({ tone: "ok", title: `${user.name} unlocked`, body: "They can sign in again." });
      }}
    >
      <IconUnlock size={14} /> Unlock
    </Button>
  ) : (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        setUserStatus(user.id, "locked");
        notify({ tone: "warn", title: `${user.name} locked`, body: "Their sign-in is refused until released." });
      }}
    >
      <IconLock size={14} /> Lock
    </Button>
  );
}

export default function SettingsPage(props: PageProps<"/settings">) {
  const sp = React.use(props.searchParams);
  const initial = (typeof sp.tab === "string" ? sp.tab : "practice") as Tab;
  return (
    <RoleGate allow={[]}>
      <Settings initial={initial} />
    </RoleGate>
  );
}

function Settings({ initial }: { initial: Tab }) {
  const router = useRouter();
  const {
    session, can, hasFeature, purchaseFeature, deactivateFeature,
    removeFieldDefinition, notify,
  } = useApp();
  const db = useClinicDb();
  const { tenant } = useTenant();
  const t = session.tenantId;
  const queryClient = useQueryClient();
  const tour = useTour();
  /* re-read this clinic's whole subtree — the same thing every write does */
  const refetchEverything = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.tenant(t) }),
    [queryClient, t],
  );
  const [tab, setTab] = React.useState<Tab>(initial);
  /* Whether modules are *billed* for this practice. Until it has a
     subscription they are a plain entitlement switch, which is what every
     deployment not using platform billing keeps. */
  const { data: billingSummary } = useBillingSummary();
  const billed = !!billingSummary?.subscription;
  const [addField, setAddField] = React.useState(false);
  const [addPerson, setAddPerson] = React.useState(false);

  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;
  const staff = selectUsers(db, t);
  const { isPending: usersPending } = useUsers();
  const active = activeFeatureKeys(db, t);
  const customFields = db.fieldDefinitions.filter((f) => f.scope === "tenant" && f.tenant_id === t);

  const setTabAndUrl = (next: Tab) => {
    setTab(next);
    router.replace(`/settings?tab=${next}`, { scroll: false });
  };

  return (
    <>
      <PageHeader
        eyebrow="Practice admin"
        title="Settings"
        description="The four axes are managed separately here on purpose: what the clinic treats, what it has bought, what it added itself, and who works there."
        meta={
          <>
            <Badge tone="accent" size="sm">{clinical.label}</Badge>
            <Badge tone={tenant.status === "trial" ? "warn" : "ok"} size="sm">{titleCase(tenant.status)}</Badge>
            <span className="text-[0.8125rem] text-ink-2">Since {formatDate(tenant.since, "long")}</span>
          </>
        }
      />

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTabAndUrl}
        tabs={[
          { value: "practice", label: "Practice" },
          { value: "config", label: "Configuration" },
          { value: "features", label: "Modules", count: active.filter((k) => !FEATURES.find((f) => f.key === k)?.is_core).length },
          { value: "billing", label: "Billing" },
          { value: "fields", label: "Custom fields", count: customFields.length },
          { value: "team", label: "Team", count: staff.length },
          { value: "isolation", label: "Isolation" },
        ]}
      />

      {tab === "practice" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardHeader title="Practice profile" subtitle="Identity of the tenant everything else hangs off." />
            <CardBody className="space-y-5">
              <div className="flex items-center gap-4">
                <Monogram name={tenant.name} size={56} />
                <div>
                  <p className="font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-ink">{tenant.name}</p>
                  <p className="text-[0.8125rem] text-ink-2">{tenant.city} · {tenant.plan}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Clinic name"><Input defaultValue={tenant.name} /></Field>
                <Field label="City"><Input defaultValue={tenant.city} /></Field>
                <Field label="Clinical type" help="Changing this would re-resolve every dynamic form. Fixed for the demo.">
                  <Select value={tenant.clinical_type} disabled>
                    {CLINICAL_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </Select>
                </Field>
                <Field label="Status">
                  <Select defaultValue={tenant.status} disabled>
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </Select>
                </Field>
              </div>

              <p className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-2">
                Profile edits are cosmetic in this demo. The two things that genuinely change the app —
                entitlements and custom fields — are on the next two tabs and are wired end to end.
              </p>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r)] border border-line-strong bg-surface-2 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-[0.8438rem] font-medium text-ink">The guided tour</p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-2">
                    Six stops through the four ideas this product is built on. Everyone here sees it once; you can
                    run it again whenever you like.
                  </p>
                </div>
                <Button variant="secondary" onClick={() => tour.start()}>
                  <IconSpark size={15} /> Take the tour
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r)] border border-line-strong bg-surface-2 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-[0.8438rem] font-medium text-ink">Where this data lives</p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-2">
                    On the server, in this clinic&rsquo;s own rows. Every change you make here is a request, and every
                    row it touches carries {tenant.name}&rsquo;s id — no other clinic can read it, and nothing is
                    kept in this browser.
                  </p>
                </div>
                <Button variant="secondary" onClick={() => { void refetchEverything(); }}>
                  <IconRefresh size={15} /> Refresh
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconLayers size={16} />} title="Clinical type" subtitle={clinical.label} />
            <CardBody className="pt-0">
              <p className="text-[0.875rem] leading-relaxed text-ink-2">{clinical.blurb}</p>
              <dl className="mt-4 space-y-3 border-t border-line-soft pt-4">
                <KV label="Exam payload" value={clinical.examLabel} />
                <KV label="Patient fields added" value={db.fieldDefinitions.filter((f) => f.scope === "clinical_type" && f.clinical_type === tenant.clinical_type && f.entity === "patient").length} />
                <KV label="Encounter fields added" value={db.fieldDefinitions.filter((f) => f.scope === "clinical_type" && f.clinical_type === tenant.clinical_type && f.entity === "encounter").length} />
              </dl>
              <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">
                Clinical type never gates a module. A dental clinic without a pharmacy still prescribes;
                an eye clinic with a lab still uses the same encounter table.
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "config" && <ConfigurationTab />}

      {tab === "features" && (
        <div className="space-y-5">
          <Card data-tour="settings-features">
            <CardHeader
              icon={<IconSpark size={16} />}
              title="Modules"
              subtitle="Core modules ship with every tenant and cannot be switched off. The rest are entitlements — turning one on lights up its nav item and its analytics immediately."
            />
            <CardBody className="pt-0">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FEATURES.map((f) => {
                  const on = hasFeature(f.key);
                  return (
                    <div
                      key={f.key}
                      className={[
                        "rounded-[var(--r)] border p-4 transition-colors",
                        on ? "border-accent-border bg-accent-soft/40" : "border-line bg-surface",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                            {f.name}
                            {f.is_core && <Badge tone="neutral" size="sm">Core</Badge>}
                          </p>
                          <p className="mt-1 text-[0.8125rem] leading-snug text-ink-2">{f.summary}</p>
                        </div>
                        {f.is_core ? (
                          <Badge tone="ok" size="sm" dot>On</Badge>
                        ) : billed ? (
                          /* Once the practice has a subscription this module
                             costs money, and a switch that charges without
                             saying so is a switch nobody should trust. The
                             state stays visible here; buying and removing
                             happen where the price and the dates are. */
                          <Badge tone={on ? "ok" : "neutral"} size="sm" dot={on}>
                            {on ? "On" : "Off"}
                          </Badge>
                        ) : (
                          <Switch
                            checked={on}
                            onChange={(v) => {
                              if (v) {
                                purchaseFeature(f.key as FeatureKey);
                                notify({ tone: "ok", title: `${f.name} enabled`, body: "The nav, dashboard and reports pick it up straight away." });
                              } else {
                                deactivateFeature(f.key as FeatureKey);
                                notify({ tone: "warn", title: `${f.name} switched off`, body: "Its routes now render the locked state." });
                              }
                            }}
                          />
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
                        <span className="flex flex-wrap gap-1.5">
                          {f.unlocks.map((u) => (
                            <span key={u} className="rounded-[var(--r-pill)] border border-line-strong bg-surface px-2 py-px text-[0.6875rem] text-ink-2">
                              {u}
                            </span>
                          ))}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tnum font-mono text-[0.75rem] text-ink-3">
                            {f.is_core ? "included" : `${currency(f.price_monthly)}/mo`}
                          </span>
                          {billed && !f.is_core && (
                            <button
                              type="button"
                              onClick={() => setTabAndUrl("billing")}
                              className="rounded-[var(--r-pill)] border border-line-strong bg-surface px-2 py-px text-[0.6875rem] font-medium text-accent-text transition-colors hover:bg-accent-soft"
                            >
                              {on ? "Manage" : "Add"} in Billing
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconShield size={16} />} title="What the guard actually does" />
            <CardBody className="pt-0">
              <pre className="overflow-x-auto rounded-[var(--r)] border border-line bg-surface-inset p-3.5 font-mono text-[0.75rem] leading-relaxed text-ink-2">
{`if not TenantFeature.is_active(tenant_id, feature_key):
    return 403 "Feature not enabled"`}
              </pre>
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-2">
                Hiding a nav item is a courtesy. The server check is the enforcement — which is why every gated
                page in this app renders through the same <span className="font-mono text-[0.75rem]">FeatureGate</span>{" "}
                rather than each module inventing its own locked state.
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "billing" && <BillingTab />}

      {tab === "fields" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="overflow-hidden">
            <CardHeader
              title="Custom fields"
              subtitle="Added by this clinic, layered on top of the common and clinical-type sets."
              actions={<Button size="sm" variant="primary" onClick={() => setAddField(true)}><IconPlus size={14} /> Add field</Button>}
            />
            {customFields.length === 0 ? (
              <EmptyState
                icon={<IconLayers size={20} />}
                title="No custom fields yet"
                body="Anything this practice asks for that the standard record does not carry belongs here — an insurance number, a referral source, a consent flag."
                action={<Button size="sm" variant="primary" onClick={() => setAddField(true)}>Add the first field</Button>}
              />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr><TH>Label</TH><TH>Key</TH><TH>Entity</TH><TH>Type</TH><TH>Required</TH><TH align="right" /></tr>
                  </THead>
                  <TBody>
                    {customFields.map((f) => (
                      <TR key={f.id}>
                        <TD className="font-medium">{f.label}</TD>
                        <TD className="tnum font-mono text-[0.75rem] text-ink-2">{f.field_key}</TD>
                        <TD className="text-ink-2">{titleCase(f.entity)}</TD>
                        <TD className="text-ink-2">{titleCase(f.type)}</TD>
                        <TD>{f.required ? <Badge tone="warn" size="sm" dot={false}>Required</Badge> : <span className="text-ink-3">Optional</span>}</TD>
                        <TD align="right">
                          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.label}`}
                                  onClick={() => { removeField(f); }}>
                            <IconTrash size={14} />
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </Card>

          <SchemaPreview />
        </div>
      )}

      {tab === "team" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<IconUsers size={16} />}
              title="Team"
              subtitle="Role decides which modules a person sees. Locking an account stops them signing in without deleting anything they recorded."
              actions={
                can("user:manage") && (
                  <Button variant="primary" size="sm" onClick={() => setAddPerson(true)}>
                    <IconPlus size={14} /> Add person
                  </Button>
                )
              }
            />
            <DataTable
              columns={teamColumns}
              data={staff}
              getRowId={(u) => u.id}
              loading={usersPending}
              pageSize={12}
              initialSorting={[{ id: "name", desc: false }]}
              isRowActive={(u) => u.id === session.userId}
              minWidth="48rem"
            />
          </Card>

          <Card>
            <CardHeader icon={<IconLock size={16} />} title="Locking an account" />
            <CardBody className="pt-0">
              <ul className="space-y-2.5 text-[0.8125rem] leading-snug text-ink-2">
                <li className="flex gap-2"><span className="text-ink-3">·</span> Five wrong passwords lock an account automatically.</li>
                <li className="flex gap-2"><span className="text-ink-3">·</span> A locked person is signed out of this browser straight away.</li>
                <li className="flex gap-2"><span className="text-ink-3">·</span> Unlocking clears the failed-attempt counter.</li>
                <li className="flex gap-2"><span className="text-ink-3">·</span> Everything they recorded stays exactly where it is.</li>
              </ul>
              <p className="mt-4 border-t border-line-soft pt-3 text-[0.75rem] leading-relaxed text-ink-3">
                Suspending a whole clinic is the platform's job, not a practice admin's — that switch lives in the
                console and takes the subdomain offline.
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "isolation" && <IsolationTab />}

      <AddFieldModal open={addField} onClose={() => setAddField(false)} />
      <AddPersonModal open={addPerson} onClose={() => setAddPerson(false)} />
    </>
  );

  function removeField(f: FieldDefinition) {
    removeFieldDefinition(f.id);
    notify({ tone: "warn", title: `${f.label} removed`, body: "It disappears from every form that resolved it." });
  }
}

/**
 * §3.3 — tenant configuration. Not entitlements (what the clinic may use) and
 * not custom fields (what it collects): this is how it has set the product up,
 * and every value below changes behaviour elsewhere in the app.
 */
function ConfigurationTab() {
  const { config, updateConfig, notify } = useApp();
  const { tenant } = useTenant();
  const [draft, setDraft] = React.useState(config);
  React.useEffect(() => { setDraft(config); }, [config]);

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const slots = React.useMemo(() => {
    const out: string[] = [];
    const [sh, sm] = draft.day_start.split(":").map(Number);
    const [eh, em] = draft.day_end.split(":").map(Number);
    for (let m = sh * 60 + sm; m + draft.default_duration <= eh * 60 + em; m += draft.slot_minutes) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
    return out;
  }, [draft.day_start, draft.day_end, draft.slot_minutes, draft.default_duration]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader
          title="Configuration"
          subtitle="Wired end to end — changing these changes how records are numbered, how the diary is laid out and how invoices are raised."
        />
        <CardBody className="space-y-6">
          <section>
            <Legend>Contact</Legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <Input value={draft.contact_phone} onChange={(e) => set("contact_phone", e.target.value)}
                       placeholder="+44 …" />
              </Field>
              <Field label="Email">
                <Input type="email" value={draft.contact_email} onChange={(e) => set("contact_email", e.target.value)}
                       placeholder="hello@clinic.example" />
              </Field>
              <Field label="Address" className="sm:col-span-2" help="Printed on every invoice.">
                <Input value={draft.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <Legend>Records</Legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Record number prefix" required help="New patients are numbered from this.">
                <Input value={draft.mrn_prefix} maxLength={4}
                       onChange={(e) => set("mrn_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
              </Field>
              <Field label="Queue token prefix" help="Shown on the waiting-room screen.">
                <Input value={draft.token_prefix} maxLength={2}
                       onChange={(e) => set("token_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
              </Field>
            </div>
            <Checkbox
              className="mt-3"
              checked={draft.urgent_first}
              onChange={(v) => set("urgent_first", v)}
              label="Call urgent tokens before routine ones"
              description="Turn this off and the board is strictly first come, first served."
            />
          </section>

          <section>
            <Legend>Appointments</Legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Day starts" required>
                <Input type="time" value={draft.day_start} onChange={(e) => set("day_start", e.target.value)} />
              </Field>
              <Field label="Day ends" required>
                <Input type="time" value={draft.day_end} onChange={(e) => set("day_end", e.target.value)} />
              </Field>
              <Field label="Slot interval" required>
                <Select value={String(draft.slot_minutes)}
                        onChange={(e) => set("slot_minutes", Number(e.target.value) as 15 | 20 | 30)}>
                  {[15, 20, 30].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </Select>
              </Field>
              <Field label="Default appointment length" required>
                <Select value={String(draft.default_duration)}
                        onChange={(e) => set("default_duration", Number(e.target.value))}>
                  {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <Legend>Billing</Legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Invoice prefix" required>
                <Input value={draft.invoice_prefix}
                       onChange={(e) => set("invoice_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
              </Field>
              <Field label="Currency" required help="Every figure in the app follows this.">
                <Select value={draft.currency}
                        onChange={(e) => set("currency", e.target.value as typeof draft.currency)}>
                  <option value="INR">Indian rupee (₹)</option>
                  <option value="GBP">Pound sterling (£)</option>
                  <option value="EUR">Euro (€)</option>
                  <option value="USD">US dollar ($)</option>
                </Select>
              </Field>
              <Field label="Tax rate" help="Applied to new invoice lines.">
                <NumberInput min={0} max={40} step="0.5" value={draft.tax_pct}
                             onChange={(n) => set("tax_pct", n)} />
              </Field>
              <Field label="Payment terms" required>
                <Select value={String(draft.payment_terms_days)}
                        onChange={(e) => set("payment_terms_days", Number(e.target.value))}>
                  {[0, 7, 14, 30].map((d) => (
                    <option key={d} value={d}>{d === 0 ? "Due immediately" : `${d} days`}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <Legend>Inventory</Legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Expiry alert threshold (days)" help="Batches expiring within this many days show up as a warning.">
                <NumberInput min={1} max={730} value={draft.expiry_alert_days}
                             onChange={(n) => set("expiry_alert_days", n)} />
              </Field>
            </div>
          </section>
        </CardBody>
        <CardFooter>
          <p className="text-[0.75rem] text-ink-3">
            {dirty ? "Unsaved changes" : "Saved — every module reads these values."}
          </p>
          <div className="flex items-center gap-2.5">
            <Button variant="ghost" onClick={() => setDraft(config)} disabled={!dirty}>Discard</Button>
            <Button
              variant="primary"
              disabled={!dirty}
              onClick={() => {
                updateConfig(draft);
                notify({ tone: "ok", title: "Configuration saved", body: "Numbering, the diary and billing follow it from now on." });
              }}
            >
              <IconCheck size={15} /> Save configuration
            </Button>
          </div>
        </CardFooter>
      </Card>

      <aside className="space-y-5">
        <Card>
          <CardHeader title="What this changes" subtitle="Previewed from the values on the left." />
          <CardBody className="space-y-3 pt-0">
            <KV label="Next record number" value={<span className="tnum font-mono">{draft.mrn_prefix || "AS"}-1502</span>} />
            <KV label="Next invoice" value={<span className="tnum font-mono">{draft.invoice_prefix || "INV"}-2045</span>} />
            <KV
              label="Payment due"
              value={draft.payment_terms_days === 0 ? "On issue" : `${draft.payment_terms_days} days after issue`}
            />
            <KV label="Tax on new lines" value={`${draft.tax_pct}%`} />
            <KV label="Money shown as" value={currency(1234.5)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Diary shape" subtitle={`${slots.length} bookable slots a day`} />
          <CardBody className="pt-0">
            {slots.length === 0 ? (
              <p className="text-[0.8125rem] text-critical-text">
                The day ends before a {draft.default_duration}-minute appointment fits.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {slots.slice(0, 14).map((t) => (
                  <span key={t} className="tnum rounded-[var(--r-sm)] border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[0.6875rem] text-ink-2">
                    {formatTime12(t)}
                  </span>
                ))}
                {slots.length > 14 && (
                  <span className="self-center text-[0.75rem] text-ink-3">+{slots.length - 14} more</span>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Not configuration" />
          <CardBody className="pt-0">
            <p className="text-[0.8125rem] leading-relaxed text-ink-2">
              What {tenant.name} is <em>allowed</em> to use is an entitlement, and what it <em>collects</em> is a field
              definition. Both are deliberately separate tabs — conflating them is what makes multi-tenant products
              hard to reason about.
            </p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function SchemaPreview() {
  const { data: patient } = useSchema("patient");
  const { data: encounter } = useSchema("encounter");

  const row = (label: string, fields: FieldDefinition[]) => (
    <div>
      <Legend>{label}</Legend>
      <ul className="space-y-1.5">
        {fields.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 text-[0.8125rem]">
            <span className="min-w-0 truncate text-ink">{f.label}</span>
            <Badge
              tone={f.scope === "tenant" ? "accent" : f.scope === "clinical_type" ? "accent" : "neutral"}
              size="sm" dot={false}
            >
              {f.scope === "clinical_type" ? "clinical" : f.scope}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <Card>
      <CardHeader title="Resolved schema" subtitle="What the dynamic forms will render right now." />
      <CardBody className="space-y-5 pt-0">
        {row(`Patient · ${pluralise(patient.length, "field")}`, patient)}
        {row(`Encounter · ${pluralise(encounter.length, "field")}`, encounter)}
        <p className="border-t border-line-soft pt-3 text-[0.75rem] leading-relaxed text-ink-3">
          Order is common → clinical type → clinic, and a later scope wins on a key collision. Nothing downstream
          knows which scope a field came from.
        </p>
      </CardBody>
    </Card>
  );
}

function IsolationTab() {
  const { session } = useApp();
  const db = useClinicDb();
  const { tenant } = useTenant();

  /* Every row this session holds belongs to this clinic — there is nothing to
     compare against, because another clinic's rows never left the database. */
  const { data: analytics } = useAnalytics(30);
  const counts = [
    { label: "Patients", n: analytics?.core.patients ?? 0, note: "counted in the database" },
    { label: "Appointments", n: db.appointments.length, note: "loaded for this clinic" },
    { label: "Queue entries", n: db.queue.length, note: "loaded for this clinic" },
    { label: "Encounters", n: db.encounters.length, note: "loaded for this clinic" },
    { label: "Prescriptions", n: db.prescriptions.length, note: "loaded for this clinic" },
    { label: "Lab orders", n: db.labOrders.length, note: "loaded for this clinic" },
    { label: "Stock movements", n: db.inventoryTx.length, note: "loaded for this clinic" },
    { label: "Invoices", n: db.invoices.length, note: "loaded for this clinic" },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader
          icon={<IconShield size={16} />}
          title="What this session can see"
          subtitle={`Signed in to ${tenant.name}. These are the rows this session holds — and they are all of the rows it could ever hold, because another clinic's never leave the database.`}
        />
        <CardBody className="pt-0">
          <TableWrap>
            <Table>
              <THead>
                <tr><TH>Collection</TH><TH align="right">Rows</TH><TH align="right">Where the filter runs</TH></tr>
              </THead>
              <TBody>
                {counts.map((c) => (
                  <TR key={c.label}>
                    <TD>{c.label}</TD>
                    <TD align="right" className="tnum font-mono font-medium text-ink">{c.n}</TD>
                    <TD align="right" className="text-[0.75rem] text-ink-3">{c.note}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<IconLock size={16} />} title="Where scoping happens" />
        <CardBody className="pt-0">
          <ol className="space-y-3">
            {[
              { n: 1, t: "Auth", d: "Resolves tenant, user and role from the token." },
              { n: 2, t: "Isolation guard", d: "Injects the tenant filter into every query." },
              { n: 3, t: "Feature guard", d: "Blocks gated routes when the entitlement is inactive." },
              { n: 4, t: "RBAC guard", d: "Checks the role against the route." },
              { n: 5, t: "Schema resolver", d: "Merges the three field scopes for dynamic forms." },
            ].map((s) => (
              <li key={s.n} className="flex items-start gap-3">
                <span className="tnum mt-0.5 w-4 shrink-0 font-mono text-[0.75rem] text-accent-text">{s.n}</span>
                <div className="min-w-0">
                  <p className="text-[0.8438rem] font-medium text-ink">{s.t}</p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-2">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-line-soft pt-3 text-[0.75rem] leading-relaxed text-ink-3">
            The tenant is never read from a body or query parameter. In this front end that is mirrored by the
            repository layer: no selector reads a collection without being handed the tenant it belongs to.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

const FIELD_TYPES: FieldType[] = ["text", "textarea", "number", "date", "select", "multiselect", "boolean", "phone", "email"];

function AddFieldModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addFieldDefinition, notify } = useApp();
  const [label, setLabel] = React.useState("");
  const [entity, setEntity] = React.useState<"patient" | "encounter">("patient");
  const [type, setType] = React.useState<FieldType>("text");
  const [required, setRequired] = React.useState(false);
  const [group, setGroup] = React.useState("Clinic fields");
  const [options, setOptions] = React.useState("");
  const [help, setHelp] = React.useState("");

  React.useEffect(() => {
    if (open) { setLabel(""); setEntity("patient"); setType("text"); setRequired(false); setGroup("Clinic fields"); setOptions(""); setHelp(""); }
  }, [open]);

  const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a custom field"
      subtitle="It joins the resolved schema immediately — registration, the record and the consultation all pick it up."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!key) { notify({ tone: "warn", title: "Give the field a label" }); return; }
              addFieldDefinition({
                entity, field_key: key, label: label.trim(), type, required,
                order: 300, span: type === "textarea" ? 2 : 1, group: group.trim() || "Clinic fields",
                options: (type === "select" || type === "multiselect")
                  ? options.split(",").map((o) => o.trim()).filter(Boolean)
                  : undefined,
                help: help.trim() || undefined,
              });
              notify({ tone: "ok", title: `${label.trim()} added`, body: `Every ${entity} form now renders it.` });
              onClose();
            }}
          >
            <IconCheck size={15} /> Create field
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Label" required help={key ? `Stored as ${key}` : "Used as the form label."}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Insurance number" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Appears on" required>
            <Select value={entity} onChange={(e) => setEntity(e.target.value as "patient" | "encounter")}>
              <option value="patient">Patient record</option>
              <option value="encounter">Consultation</option>
            </Select>
          </Field>
          <Field label="Type" required>
            <Select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{titleCase(ft)}</option>)}
            </Select>
          </Field>
        </div>
        {(type === "select" || type === "multiselect") && (
          <Field label="Options" required help="Comma separated.">
            <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Self-funded, Insurance, NHS" />
          </Field>
        )}
        <Field label="Group" help="Fields sharing a group are drawn under one heading.">
          <Input value={group} onChange={(e) => setGroup(e.target.value)} />
        </Field>
        <Field label="Helper text">
          <Input value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Shown under the input." />
        </Field>
        <Checkbox checked={required} onChange={setRequired} label="Required"
                  description="Validation is generated from the schema, so this is enforced without touching the form." />
      </div>
    </Modal>
  );
}

/* ==========================================================================
   Adding a colleague.

   The only write on the Team tab that makes a row rather than changing one.
   Role is the whole point of it: it decides what the person sees in the rail,
   and the server's guard reads the same table — so getting it wrong here is
   visible immediately and enforced regardless.

   Two kinds of account come out of this form. With a password the person is
   active and can sign in now; without one the row is `invited`, and the API
   refuses their sign-in until a password exists.
   ========================================================================== */

const ROLE_CHOICES: Array<{ value: Role; description: string }> = [
  { value: "doctor", description: "Consultations, prescriptions, lab orders." },
  { value: "receptionist", description: "Registration, the diary, the queue, billing." },
  { value: "pharmacist", description: "Dispensing, and the stock ledger behind it." },
  { value: "lab_tech", description: "Results and verification on the bench." },
  { value: "tenant_admin", description: "Everything above, plus this page." },
];

/** A password nobody has to invent. Glyphs that read alike are left out. */
function suggestPassword() {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const draw = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(draw, (n) => alphabet[n % alphabet.length]).join("");
}

/* deliberately loose: the server owns the real check, this only catches typos */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function AddPersonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createUser, notify } = useApp();
  const { data: staff } = useUsers();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("doctor");
  const [speciality, setSpeciality] = React.useState("");
  const [withPassword, setWithPassword] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [refused, setRefused] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ user: User; password: string | null } | null>(null);

  const reset = React.useCallback(() => {
    setName(""); setEmail(""); setRole("doctor"); setSpeciality("");
    setWithPassword(true); setPassword(suggestPassword());
    setTouched(false); setBusy(false); setRefused(null); setCreated(null);
  }, []);

  React.useEffect(() => { if (open) reset(); }, [open, reset]);

  const trimmedName = name.trim();
  const address = email.trim().toLowerCase();
  const duplicate = staff.some((u) => u.email.toLowerCase() === address);
  const shapeOk = EMAIL_SHAPE.test(address);
  const valid =
    trimmedName.length >= 2 && shapeOk && !duplicate && (!withPassword || password.length >= 12);

  const nameError = touched && trimmedName.length < 2 ? "At least two characters." : null;
  const emailError = touched
    ? !shapeOk
      ? "An address they can be reached at — it is also their username."
      : duplicate
        ? "Someone here already signs in with that."
        : null
    : null;
  /* the API will not accept a shorter one, so the form does not pretend it might */
  const passwordError =
    touched && withPassword && password.length < 12 ? "At least twelve characters." : null;

  const submit = async () => {
    setTouched(true);
    setRefused(null);
    if (!valid) return;

    setBusy(true);
    try {
      /* The email is unique within the clinic, and the server is what decides
         that: two admins adding the same person at once means the second one
         hears about it here rather than getting a duplicate account. */
      const user = await createUser({
        name: trimmedName,
        email: address,
        role,
        speciality: role === "doctor" ? speciality.trim() || undefined : undefined,
        password: withPassword ? password : undefined,
      });
      setCreated({ user, password: withPassword ? password : null });
      notify({
        tone: "ok",
        title: `${user.name} added`,
        body: withPassword
          ? `They can sign in as ${ROLE_LABEL[role].toLowerCase()} now.`
          : "The account is invited — it cannot sign in until it has a password.",
      });
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That account was not created.");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const person = created.user;
    return (
      <Modal
        open={open}
        onClose={onClose}
        width="sm"
        title={`${person.name} is on the team`}
        subtitle={
          created.password
            ? "Hand these over out of band — the password is shown once and never stored where it can be read back."
            : "The account exists, but nothing can sign in with it yet."
        }
        footer={
          <>
            <Button variant="ghost" onClick={reset}>Add another</Button>
            <Button variant="primary" onClick={onClose}><IconCheck size={15} /> Done</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-[var(--r)] border border-line bg-surface-2 p-3.5">
            <Avatar name={person.name} initials={person.initials} tintKey={person.id} />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{person.name}</p>
              <p className="truncate text-[0.75rem] text-ink-3">
                {ROLE_LABEL[person.role]}{person.speciality ? ` · ${person.speciality}` : ""}
              </p>
            </div>
            <Badge
              className="ml-auto"
              tone={person.status === "active" ? "ok" : "warn"}
              size="sm"
              dot
            >
              {titleCase(person.status)}
            </Badge>
          </div>

          {created.password ? (
            <div className="rounded-[var(--r)] border border-accent-border bg-accent-soft p-3.5">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-accent-text">
                Sign-in credentials
              </p>
              <dl className="mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.75rem] text-ink-2">Email</dt>
                  <dd className="tnum break-all font-mono text-[0.8125rem] text-ink">{person.email}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.75rem] text-ink-2">Password</dt>
                  <dd className="tnum font-mono text-[0.8125rem] text-ink">{created.password}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex gap-2.5 rounded-[var(--r)] border border-line bg-surface-2 p-3.5">
              <IconMail size={16} className="mt-px shrink-0 text-ink-3" />
              <p className="text-[0.8125rem] leading-relaxed text-ink-2">
                Invited accounts are refused at sign-in until they have a password. There is no invitation
                email yet, so give <span className="text-ink">{person.name}</span> a password from this form
                instead when they are ready to start.
              </p>
            </div>
          )}

          <p className="text-[0.75rem] leading-relaxed text-ink-3">
            They see only what {ROLE_LABEL[person.role].toLowerCase()} may see, on this clinic&apos;s address and
            no other. Locking the account later stops the sign-in without touching anything they recorded.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add someone to the team"
      subtitle="Creates their account in this clinic. The role decides what they can reach — here and on the server."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { void submit(); }} disabled={busy}>
            <IconSpark size={15} /> {busy ? "Adding…" : "Add person"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {refused && (
          <div role="alert" className="flex gap-2.5 rounded-[var(--r)] border border-critical-border bg-critical-soft p-3">
            <IconAlert size={16} className="mt-px shrink-0 text-critical-text" />
            <p className="text-[0.8125rem] leading-snug text-critical-text">{refused}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aparna Iyer"
                   invalid={!!nameError} />
          </Field>
          <Field label="Email" required error={emailError}
                 help={!emailError ? "This is the username they sign in with." : undefined}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="a.iyer@clinic.example" invalid={!!emailError} />
          </Field>
        </div>

        <Field label="Role" required help="Changes what appears in their sidebar, and what the API will answer.">
          <ChoiceGroup
            columns={2}
            value={role}
            onChange={setRole}
            options={ROLE_CHOICES.map((r) => ({
              value: r.value,
              label: ROLE_LABEL[r.value],
              description: r.description,
            }))}
          />
        </Field>

        {role === "doctor" && (
          <Field label="Speciality" help="Shown under their name in the team list and on the diary.">
            <Input value={speciality} onChange={(e) => setSpeciality(e.target.value)}
                   placeholder="Endodontics" />
          </Field>
        )}

        <div className="rounded-[var(--r)] border border-line bg-surface-2 p-3.5">
          <Checkbox
            checked={withPassword}
            onChange={setWithPassword}
            label="Give them a password now"
            description="Off creates an invited account instead — it exists in the list, but sign-in is refused until it has one."
          />
          {withPassword && (
            <Field className="mt-3.5" label="Temporary password" required error={passwordError}
                   help={!passwordError ? "Shown once, on the next screen. Hand it over out of band." : undefined}>
              <div className="flex items-stretch gap-2">
                <Input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="tnum font-mono"
                  invalid={!!passwordError}
                />
                <Button variant="secondary" onClick={() => setPassword(suggestPassword())}
                        aria-label="Suggest another password">
                  <IconRefresh size={15} /> Suggest
                </Button>
              </div>
            </Field>
          )}
        </div>

        <p className="flex gap-2.5 border-t border-line-soft pt-3 text-[0.75rem] leading-relaxed text-ink-3">
          <IconUser size={14} className="mt-px shrink-0" />
          <span>
            The account belongs to this clinic and is reachable only at its address. Nothing here can grant
            access to another clinic, or to the platform console — those are a different table entirely.
          </span>
        </p>
      </div>
    </Modal>
  );
}

/* ==========================================================================
   Giving someone a password.

   An admin does not know theirs, so nothing here asks for the current one —
   the route is guarded by the role instead. Three consequences are worth
   saying out loud in the dialog, because none of them are guessable:

     · the first password an invited account gets is what activates it;
     · every session opened with the old password ends, and the browser doing
       the resetting is spared only when you are resetting your own;
     · it is not an unlock. A locked account stays locked.
   ========================================================================== */

function SetPasswordModal({
  user, open, onClose,
}: {
  user: User;
  open: boolean;
  onClose: () => void;
}) {
  const { setUserPassword, session, notify } = useApp();
  const [password, setPassword] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [refused, setRefused] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPassword(suggestPassword());
    setTouched(false); setBusy(false); setRefused(null); setDone(false);
  }, [open]);

  const invited = user.status === "invited";
  const locked = user.status === "locked";
  const own = user.id === session.userId;
  const error = touched && password.length < 12 ? "At least twelve characters." : null;

  const submit = async () => {
    setTouched(true);
    setRefused(null);
    if (password.length < 12) return;

    setBusy(true);
    try {
      await setUserPassword(user.id, password);
      setDone(true);
      notify({
        tone: "ok",
        title: invited ? `${user.name} can sign in` : `${user.name}'s password replaced`,
        body: invited
          ? "The invitation is accepted and the account is active."
          : own
            ? "Your other sessions are signed out; this one is not."
            : "They are signed out everywhere and need the new password.",
      });
    } catch (error_) {
      setRefused(error_ instanceof Error ? error_.message : "That password was not set.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title={done
        ? "Hand this over"
        : invited ? `Set a password for ${user.name}` : `Reset ${user.name}'s password`}
      subtitle={done
        ? "It is shown once. The server keeps only a hash, and will never give it back."
        : invited
          ? "An invited account has no password at all, which is why it cannot sign in yet."
          : "You do not need their current one — the role you hold is what permits this."}
      footer={done ? (
        <Button variant="primary" onClick={onClose}><IconCheck size={15} /> Done</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { void submit(); }} disabled={busy}>
            <IconKey size={15} /> {busy ? "Saving…" : invited ? "Set password" : "Replace password"}
          </Button>
        </>
      )}
    >
      {done ? (
        <div className="space-y-4">
          <div className="rounded-[var(--r)] border border-accent-border bg-accent-soft p-3.5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-accent-text">
              Sign-in credentials
            </p>
            <dl className="mt-2 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[0.75rem] text-ink-2">Email</dt>
                <dd className="tnum break-all font-mono text-[0.8125rem] text-ink">{user.email}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[0.75rem] text-ink-2">Password</dt>
                <dd className="tnum font-mono text-[0.8125rem] text-ink">{password}</dd>
              </div>
            </dl>
          </div>
          {locked && (
            <p className="flex gap-2.5 rounded-[var(--r)] border border-warn-border bg-warn-soft p-3 text-[0.8125rem] leading-snug text-warn-text">
              <IconLock size={16} className="mt-px shrink-0" />
              <span>
                This account is still locked, so the new password will not get them in. Unlock it from
                the team list when they should be let back.
              </span>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {refused && (
            <div role="alert" className="flex gap-2.5 rounded-[var(--r)] border border-critical-border bg-critical-soft p-3">
              <IconAlert size={16} className="mt-px shrink-0 text-critical-text" />
              <p className="text-[0.8125rem] leading-snug text-critical-text">{refused}</p>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <Avatar name={user.name} initials={user.initials} size="sm" tintKey={user.id} />
            <div className="min-w-0">
              <p className="truncate text-[0.8438rem] font-medium text-ink">{user.name}</p>
              <p className="tnum truncate font-mono text-[0.75rem] text-ink-3">{user.email}</p>
            </div>
            <Badge className="ml-auto" tone={user.status === "active" ? "ok" : user.status === "invited" ? "warn" : "critical"} size="sm" dot>
              {titleCase(user.status)}
            </Badge>
          </div>

          <Field label="New password" required error={error}
                 help={!error ? "Hand it over out of band, not by email." : undefined}>
            <div className="flex items-stretch gap-2">
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                     className="tnum font-mono" invalid={!!error} />
              <Button variant="secondary" onClick={() => setPassword(suggestPassword())}
                      aria-label="Suggest another password">
                <IconRefresh size={15} /> Suggest
              </Button>
            </div>
          </Field>

          <ul className="space-y-2 border-t border-line-soft pt-3 text-[0.75rem] leading-snug text-ink-3">
            {invited && (
              <li className="flex gap-2">
                <span>·</span> This accepts the invitation — the account becomes active straight away.
              </li>
            )}
            <li className="flex gap-2">
              <span>·</span>{" "}
              {own
                ? "Every other session you hold is signed out. This browser stays signed in."
                : `Every session ${user.name.split(" ")[0]} has open is signed out.`}
            </li>
            {locked && (
              <li className="flex gap-2 text-warn-text">
                <span>·</span> The account stays locked. Unlocking is a separate decision.
              </li>
            )}
          </ul>
        </div>
      )}
    </Modal>
  );
}
