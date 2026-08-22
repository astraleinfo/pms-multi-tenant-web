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
import type { FeatureKey, FieldDefinition, FieldType, User } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardFooter, CardHeader, Legend } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, KV } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Checkbox, Field, Input, Select, Switch } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RoleGate } from "@/components/domain/gates";
import { useTour } from "@/components/onboarding/tour";
import { Monogram } from "@/components/layout/rail";
import {
  IconCheck, IconLayers, IconLock, IconPlus, IconRefresh, IconShield, IconSpark, IconTrash,
  IconUnlock, IconUsers,
} from "@/components/ui/icons";

type Tab = "practice" | "config" | "features" | "fields" | "team" | "isolation";

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
    id: "lock",
    header: "",
    meta: { align: "right", width: 44 },
    cell: ({ row }) => <LockControl user={row.original} />,
  }),
]);

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
    session, hasFeature, purchaseFeature, deactivateFeature,
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
  const [addField, setAddField] = React.useState(false);

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
                        <span className="tnum font-mono text-[0.75rem] text-ink-3">
                          {f.is_core ? "included" : `${currency(f.price_monthly)}/mo`}
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
                <Input type="number" min={0} max={40} step="0.5" value={draft.tax_pct}
                       onChange={(e) => set("tax_pct", Number(e.target.value) || 0)} />
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
