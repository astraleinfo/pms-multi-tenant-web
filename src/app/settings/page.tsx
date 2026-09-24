"use client";

import * as React from "react";
import { useRouter } from "@/lib/navigation";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useApp, useTenant } from "@/lib/store/app-store";
import {
  useClinicDb, useFeatureCatalog, useSchema, useSubscription, useUsers,
} from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { cn } from "@/lib/cn";
import { CLINICAL_TYPES, FEATURES } from "@/lib/data/catalog";
import { activeFeatureKeys, selectUsers } from "@/lib/data/repository";
import { ROLE_LABEL, modulePath } from "@/lib/nav";
import { currency, formatDate, formatTime12, pluralise, titleCase } from "@/lib/format";
import type { AppointmentType, FieldDefinition, FieldType, Role, User } from "@/lib/types";
import {
  appointmentTypes, formatLength, newTypeId, slotTimes, TYPE_LENGTHS, typeListProblem,
} from "@/lib/appointment-types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, Legend } from "@/components/ui/card";
import { Button, ButtonLink, Segmented } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import {
  ChoiceGroup, Checkbox, Field, Input, NumberInput, SearchInput, Select, Switch,
} from "@/components/ui/field";
import {
  SettingLinkRow, SettingRow, SettingToggleRow, SettingValueRow, SettingsActions, SettingsSection,
} from "@/components/ui/settings";
import { Tabs } from "@/components/ui/tabs";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RoleGate } from "@/components/domain/gates";
import { useTour } from "@/components/onboarding/tour";
import { Monogram } from "@/components/layout/rail";
import {
  IconAlert, IconCheck, IconChevronRight, IconEdit, IconGrid, IconKey, IconLayers, IconList, IconLock, IconMail,
  IconPlus, IconReceipt, IconRefresh, IconSettings, IconShield, IconSpark, IconTrash, IconUnlock,
  IconUser, IconUsers
} from "@/components/ui/icons";
import { HowToPay, SubscriptionBills, SubscriptionPlan, rentMoney } from "@/components/domain/subscription";
import { SheetExportButton, SheetImportButton, type SheetSource } from "@/components/domain/sheet-io";
import { Stat } from "@/components/ui/stat";
import { InfoHint, Tooltip } from "@/components/ui/info";

type Tab = "practice" | "config" | "features" | "subscription" | "fields" | "team";

const userCol = columnHelperFor<User>();

const teamColumns = userCol.columns([
  userCol.accessor("name", {
    header: "Person",
    cell: ({ row }) => <TeamPerson user={row.original} />,
  }),
  userCol.accessor("role", {
    header: "Role", meta: { hideBelow: "sm" },
    cell: ({ getValue }) => <span className="text-ink-2">{ROLE_LABEL[getValue()]}</span>,
  }),
  userCol.accessor("email", {
    /* on a narrower screen the address moves under the person's name */
    header: "Sign-in", meta: { hideBelow: "lg" },
    cell: ({ row }) => (
      <>
        <span className="tnum block truncate font-mono text-caption text-ink-2">{row.original.email}</span>
        {row.original.failed_attempts > 0 && (
          <span className="text-micro text-critical-text">
            {pluralise(row.original.failed_attempts, "failed attempt")}
          </span>
        )}
      </>
    ),
  }),
  userCol.accessor((u) => u.last_sign_in ?? "", {
    id: "last_sign_in",
    header: "Last seen", meta: { hideBelow: "xl" },
    cell: ({ row }) => (
      <span className="text-ink-2">{row.original.last_sign_in ? formatDate(row.original.last_sign_in) : "Never"}</span>
    ),
  }),
  userCol.accessor("status", {
    header: "Account", meta: { align: "right" },
    /* an active account is the ordinary case; invited and locked are the ones to act on */
    cell: ({ row, getValue }) => getValue() === "active"
      ? <span className="text-caption text-ink-3">Active</span>
      : (
        <span className="inline-flex flex-col items-end gap-0.5">
          <Badge tone={getValue() === "invited" ? "warn" : "critical"} size="sm" dot>
            {titleCase(getValue())}
          </Badge>
          {/* a lock the sign-in put on reads differently from one an admin did */}
          {getValue() === "locked" && row.original.failed_attempts > 0 && (
            <span className="whitespace-nowrap text-micro text-critical-text">
              after {pluralise(row.original.failed_attempts, "wrong password")}
            </span>
          )}
        </span>
      ),
  }),
  userCol.display({
    id: "actions",
    header: "",
    meta: { align: "right", width: 200 },
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <PasswordControl user={row.original} />
        <EditControl user={row.original} />
        <LockControl user={row.original} />
        <DeleteControl user={row.original} />
      </div>
    ),
  }),
]);

const STAFF_SHEET: SheetSource = {
  noun: "staff",
  title: "Import staff",
  subtitle: "Each person is emailed an invitation. Nothing is saved unless every row passes.",
  itemLabel: "Person",
  icon: <IconUsers size={20} />,
  template: api.staffImportTemplate,
  exportSheet: api.exportStaff,
  start: api.startStaffImport,
  get: api.getStaffImport,
  latest: api.latestStaffImport,
  summary: ({ created, invited }) => ({
    title: `${pluralise(created, "person", "people")} added`,
    body: invited === created
      ? "Each has been emailed an invitation to choose their password."
      : `${invited} of ${created} invitations sent — resend the rest from their rows.`,
  }),
};

type StatusFilter = "all" | User["status"];

/**
 * The clinic's staff: searched by name, email or speciality, narrowed by role
 * and by account state, and taken in and out of a spreadsheet.
 *
 * The filters are over the list the page already holds — a clinic's staff is
 * a few dozen people, not a register — so they answer as you type.
 */
function TeamTable({ staff, loading, canManage, onAdd }: {
  staff: User[];
  loading: boolean;
  canManage: boolean;
  onAdd: () => void;
}) {
  const { session } = useApp();
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState<Role | "all">("all");
  const [status, setStatus] = React.useState<StatusFilter>("all");

  const counts = React.useMemo(() => ({
    all: staff.length,
    active: staff.filter((u) => u.status === "active").length,
    invited: staff.filter((u) => u.status === "invited").length,
    locked: staff.filter((u) => u.status === "locked").length,
  }), [staff]);
  /* only the roles somebody here actually has — an empty option is a dead end */
  const roles = React.useMemo(
    () => (Object.keys(ROLE_LABEL) as Role[]).filter((r) => staff.some((u) => u.role === r)),
    [staff],
  );

  const term = q.trim().toLowerCase();
  const rows = staff.filter((u) =>
    (role === "all" || u.role === role)
    && (status === "all" || u.status === status)
    && (!term || [u.name, u.email, u.speciality ?? ""].some((v) => v.toLowerCase().includes(term))));
  const filtering = !!term || role !== "all" || status !== "all";

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="flex-wrap"
        icon={<IconUsers size={16} />}
        title="Team"
        hint="Role decides which modules a person sees. Locking an account stops them signing in without deleting anything they recorded."
        actions={
          canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <SheetImportButton source={STAFF_SHEET} size="sm" />
              <SheetExportButton source={STAFF_SHEET} size="sm" />
              <Button variant="primary" size="sm" onClick={onAdd}>
                <IconPlus size={14} /> Add person
              </Button>
            </div>
          )
        }
      />
      <DataTable
        columns={teamColumns}
        data={rows}
        getRowId={(u) => u.id}
        loading={loading}
        pageSize={12}
        initialSorting={[{ id: "name", desc: false }]}
        isRowActive={(u) => u.id === session.userId}
        /* narrow screens drop columns rather than scroll — see each column's `hideBelow` */
        minWidth="22rem"
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2.5">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email or speciality"
              aria-label="Search the team"
              wrapperClassName="min-w-[190px] max-w-xs flex-1"
              className="h-8 text-label"
            />
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as Role | "all")}
              aria-label="Filter by role"
              className="h-8 min-w-[10.5rem] text-label"
            >
              <option value="all">Every role</option>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: `All ${counts.all}` },
                { value: "active", label: `Active ${counts.active}` },
                { value: "invited", label: `Invited ${counts.invited}` },
                { value: "locked", label: `Locked ${counts.locked}` },
              ]}
            />
            {filtering && (
              <Button variant="ghost" size="sm" onClick={() => { setQ(""); setRole("all"); setStatus("all"); }}>
                Clear
              </Button>
            )}
            <span className="ml-auto text-caption text-ink-3">
              {filtering ? `${rows.length} of ${staff.length}` : pluralise(staff.length, "person", "people")}
            </span>
          </div>
        }
        empty={
          <EmptyState
            icon={<IconUsers size={20} />}
            title={filtering ? "Nobody matches" : "No staff yet"}
            body={filtering ? "Try another name, or clear the filters." : "Add a person, or import a sheet of them."}
            compact
          />
        }
      />
    </Card>
  );
}

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
      {/* An invited row has no password at all, so that one keeps its words —
          it is the action the row exists for. A reset is a repair on a working
          account and does not need a label taking up a column. */}
      {invited ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <IconKey size={14} /> Set password
        </Button>
      ) : (
        <Tooltip label={`Reset ${user.name}'s password`} side="top">
          <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)}
                  aria-label={`Reset ${user.name}'s password`}>
            <IconKey size={14} />
          </Button>
        </Tooltip>
      )}
      <SetPasswordModal user={user} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function EditControl({ user }: { user: User }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Tooltip label={`Edit ${user.name}`} side="top">
        <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Edit ${user.name}`}>
          <IconEdit size={14} />
        </Button>
      </Tooltip>
      <EditPersonModal user={user} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function DeleteControl({ user }: { user: User }) {
  const { session } = useApp();
  const [open, setOpen] = React.useState(false);
  /* nobody deletes the account they are signed in with */
  if (user.id === session.userId) return <span className="inline-block w-7" aria-hidden />;
  return (
    <>
      <Tooltip label={`Delete ${user.name}`} side="top">
        <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Delete ${user.name}`}
                className="hover:text-critical-text">
          <IconTrash size={14} />
        </Button>
      </Tooltip>
      <DeletePersonDialog user={user} open={open} onClose={() => setOpen(false)} />
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
        {user.speciality && <p className="truncate text-caption text-ink-3">{user.speciality}</p>}
        {/* the Sign-in column's facts, for the screens that hide that column */}
        <p className={cn("truncate text-caption text-ink-3", user.speciality && "lg:hidden")}>
          {user.email}
          <span className="sm:hidden"> · {ROLE_LABEL[user.role]}</span>
        </p>
        {user.failed_attempts > 0 && (
          <p className="text-micro text-critical-text lg:hidden">{pluralise(user.failed_attempts, "failed attempt")}</p>
        )}
      </div>
    </div>
  );
}

function LockControl({ user }: { user: User }) {
  const { session, setUserStatus, notify } = useApp();
  if (user.id === session.userId) return <span className="inline-block w-7 text-center text-micro text-ink-3">—</span>;
  /* A locked row keeps its words: releasing it — most often after too many
     wrong passwords — is the thing that row is waiting for. */
  return user.status === "locked" ? (
    <Button
      size="sm"
      variant="secondary"
      aria-label={`Unlock ${user.name}`}
      onClick={() => {
        setUserStatus(user.id, "active");
        notify({
          tone: "ok",
          title: `${user.name} unlocked`,
          body: "The wrong-password count is cleared — they can sign in again.",
        });
      }}
    >
      <IconUnlock size={14} /> Unlock
    </Button>
  ) : (
    <Tooltip label={`Lock ${user.name} out`} side="top">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Lock ${user.name} out`}
        onClick={() => {
          setUserStatus(user.id, "locked");
          notify({ tone: "warn", title: `${user.name} locked`, body: "Their sign-in is refused until released." });
        }}
      >
        <IconLock size={14} />
      </Button>
    </Tooltip>
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
    session, can, hasFeature,
    removeFieldDefinition, notify,
  } = useApp();
  const db = useClinicDb();
  const catalog = useFeatureCatalog();
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
            <span className="text-label text-ink-2">Since {formatDate(tenant.since, "long")}</span>
          </>
        }
      />

      <Tabs
        className="mb-block"
        value={tab}
        onChange={setTabAndUrl}
        tabs={[
          { value: "practice", label: "Practice", icon: <IconGrid size={15} /> },
          { value: "config", label: "Configuration", icon: <IconSettings size={15} /> },
          { value: "features", label: "Modules", icon: <IconLayers size={15} />, count: active.filter((k) => !FEATURES.find((f) => f.key === k)?.is_core).length },
          { value: "subscription", label: "Subscription", icon: <IconReceipt size={15} /> },
          { value: "fields", label: "Custom fields", icon: <IconList size={15} />, count: customFields.length },
          { value: "team", label: "Team", icon: <IconUsers size={15} />, count: staff.length },
        ]}
      />

      {tab === "practice" && (
        <div className="grid grid-cols-1 gap-block lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0 space-y-block">
            <SettingsSection
              title="Practice profile"
              hint="Your clinic’s name and where it is."
            >
              {/* who this is, once, at the top — not repeated in the header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <Monogram name={tenant.name} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-ink">{tenant.name}</p>
                  <p className="truncate text-caption text-ink-3">{tenant.city} · {tenant.plan}</p>
                </div>
              </div>

              <SettingRow label="Clinic name" htmlFor="pr-name">
                <Input id="pr-name" defaultValue={tenant.name} />
              </SettingRow>
              <SettingRow label="City" htmlFor="pr-city" width="md">
                <Input id="pr-city" defaultValue={tenant.city} />
              </SettingRow>
              <SettingRow
                label="Clinical type"
                htmlFor="pr-type"
                hint="Changing this would re-resolve every dynamic form in the clinic, so it is fixed for the demo."
              >
                <Select id="pr-type" value={tenant.clinical_type} disabled>
                  {CLINICAL_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </Select>
              </SettingRow>
              <SettingRow
                label="Status"
                htmlFor="pr-status"
                hint="Trial, active or suspended. Only the platform console can move a clinic between them."
              >
                <Select id="pr-status" defaultValue={tenant.status} disabled>
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </SettingRow>
            </SettingsSection>

            <SettingsSection title="This workspace">
              <SettingLinkRow
                label="Guided tour"
                hint="Six stops through the four ideas this product is built on. Everyone here sees it once; you can run it again whenever you like."
              >
                <Button variant="secondary" size="sm" onClick={() => tour.start()}>
                  <IconSpark size={14} /> Take the tour
                </Button>
              </SettingLinkRow>
              <SettingLinkRow
                label="Where this data lives"
                hint={`On the server, in this clinic's own rows. Every change you make here is a request, and every row it touches carries ${tenant.name}'s id — no other clinic can read it, and nothing is kept in this browser.`}
              >
                <Button variant="secondary" size="sm" onClick={() => { void refetchEverything(); }}>
                  <IconRefresh size={14} /> Refresh
                </Button>
              </SettingLinkRow>
            </SettingsSection>
          </div>

          <aside className="space-y-block">
            <SettingsSection
              title="Clinical type"
              hint={`${clinical.blurb} A clinical type never gates a module: a dental clinic without a pharmacy still prescribes, and an eye clinic with a lab still uses the same encounter table.`}
            >
              <SettingValueRow label="Workflow" value={clinical.label} />
              <SettingValueRow label="Exam" value={clinical.examLabel} />
              <SettingValueRow
                label="Patient fields added"
                value={db.fieldDefinitions.filter((f) => f.scope === "clinical_type" && f.clinical_type === tenant.clinical_type && f.entity === "patient").length}
              />
              <SettingValueRow
                label="Encounter fields added"
                value={db.fieldDefinitions.filter((f) => f.scope === "clinical_type" && f.clinical_type === tenant.clinical_type && f.entity === "encounter").length}
              />
            </SettingsSection>
          </aside>
        </div>
      )}

      {tab === "config" && <ConfigurationTab />}

      {tab === "features" && (
        <div className="space-y-block">
          {/* One row per module rather than one card per module. Twenty-odd
              cards in a grid is a page you read; a list with a state badge and
              a price on a shared right edge is a page you scan. */}
          <SettingsSection
            title="Modules"
            hint="Core modules ship with every tenant. The rest are entitlements the Astrale team grants — open a locked one to see what it does, what it costs, and how to ask for it."
            className="[&>div]:divide-line-soft"
          >
            <div data-tour="settings-features" className="divide-y divide-line-soft">
              {FEATURES.map((f) => {
                const on = hasFeature(f.key);
                return (
                  <div key={f.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-row">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-label font-medium text-ink">{f.name}</span>
                      <InfoHint label={`About ${f.name}`}>
                        {f.summary}
                        {f.unlocks.length > 0 && (
                          <span className="mt-1.5 block text-ink-3">Unlocks {f.unlocks.join(", ")}.</span>
                        )}
                      </InfoHint>
                      {f.is_core && <Badge tone="neutral" size="sm">Core</Badge>}
                    </div>
                    <span className="tnum shrink-0 font-mono text-caption text-ink-3">
                      {f.is_core
                        ? "included"
                        : catalog.priced ? `${currency(catalog.byKey[f.key].price_monthly)}/mo` : "…"}
                    </span>
                    <span className="w-[5.5rem] shrink-0 text-right">
                      {on ? (
                        <Badge tone="ok" size="sm" dot>On</Badge>
                      ) : (
                        <Badge tone="neutral" size="sm"><IconLock size={11} /> Locked</Badge>
                      )}
                    </span>
                    <span className="w-[5.5rem] shrink-0 text-right">
                      {!f.is_core && (
                        <ButtonLink href={modulePath(f.key)} size="sm" variant="ghost">
                          Details <IconChevronRight size={13} />
                        </ButtonLink>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </SettingsSection>

          <SettingsSection
            title="What the guard actually does"
            hint="Hiding a nav item is a courtesy; the server check is the enforcement, which is why every gated page renders through the same FeatureGate rather than each module inventing its own locked state. Which row exists is not a practice admin's decision — a module is switched on for this clinic by a super admin in the platform console, and a padlock leads to that module's page, where support can be asked for it."
          >
            <div className="px-4 py-3">
              <pre className="overflow-x-auto rounded-[var(--r-sm)] border border-line bg-surface-inset p-3 font-mono text-caption leading-relaxed text-ink-2">
{`if not TenantFeature.is_active(tenant_id, feature_key):
    return 403 "Feature not enabled"`}
              </pre>
            </div>
          </SettingsSection>
        </div>
      )}

      {tab === "fields" && (
        <div className="grid grid-cols-1 gap-block lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<IconLayers size={15} />} tone="violet" title="Custom fields"
              hint="Added by this clinic, layered on top of the common and clinical-type sets."
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
                        <TD className="tnum font-mono text-caption text-ink-2">{f.field_key}</TD>
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
        <div className="space-y-block">
          <TeamTable
            staff={staff}
            loading={usersPending}
            canManage={can("user:manage")}
            onAdd={() => setAddPerson(true)}
          />

          <Card>
            <CardHeader
              tone="neutral" icon={<IconLock size={16} />}
              title="Locking an account"
              hint="Suspending a whole clinic is the platform's job, not a practice admin's — that switch lives in the console and takes the subdomain offline."
            />
            <CardBody className="pt-0">
              {/* full width under the table, so the four points sit side by side */}
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-label leading-snug text-ink-2 sm:grid-cols-2 xl:grid-cols-4">
                <li className="flex gap-2"><span className="text-ink-3">·</span> Five wrong passwords lock an account automatically.</li>
                <li className="flex gap-2"><span className="text-ink-3">·</span> A locked person is signed out of this browser straight away.</li>
                <li className="flex gap-2"><span className="text-ink-3">·</span> Unlocking clears the failed-attempt counter.</li>
                <li className="flex gap-2"><span className="text-ink-3">·</span> Everything they recorded stays exactly where it is.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "subscription" && <SubscriptionTab today={tenant.today} />}


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
 * What the clinic pays the platform, and every bill it has been sent.
 *
 * One bill a month for the paid modules switched on, due a few days after it
 * is raised. Left unpaid past the grace period, the clinic goes on hold until
 * it is settled — this tab says exactly when, so nobody finds out by being
 * locked out.
 */
function SubscriptionTab({ today }: { today: string }) {
  const { data, isPending, isError } = useSubscription();

  if (isPending) return <p className="py-10 text-center text-label text-ink-3">Reading the bills…</p>;
  if (isError || !data) {
    return <p className="py-10 text-center text-label text-ink-3">The bills could not be read. Try again in a moment.</p>;
  }
  const { summary } = data;
  const paidModules = data.plan?.modules.filter((m) => m.billed).length ?? 0;

  return (
    <div className="space-y-block">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Monthly" value={rentMoney(data.plan?.monthly_total ?? 0, summary.currency)}
          icon={<IconLayers size={16} />}
          hint={summary.exempt ? "Not billed by the platform" : pluralise(paidModules, "paid module")}
        />
        <Stat
          label="Outstanding" value={rentMoney(summary.outstanding, summary.currency)}
          icon={<IconReceipt size={16} />}
          hint={summary.open_count ? `${summary.open_count} open bill${summary.open_count === 1 ? "" : "s"}` : "Nothing to pay"}
        />
        <Stat
          label="Next due" value={summary.next_due_on ? formatDate(summary.next_due_on) : "—"}
          icon={<IconCheck size={16} />}
          hint={summary.overdue ? "Overdue" : `Bills are due ${summary.due_days} days after they are raised`}
        />
        <Stat
          label="Grace period" value={`${summary.grace_days} days`}
          icon={<IconShield size={16} />}
          hint={summary.next_hold_on && summary.open_count ? `On hold from ${formatDate(summary.next_hold_on)} if unpaid` : "After the due date, before a hold"}
        />
      </section>

      {summary.exempt && (
        <p className="rounded-[var(--r)] border border-line bg-surface-2 px-4 py-3 text-label text-ink-2">
          This clinic is not billed by the platform.
        </p>
      )}

      <SettingsSection
        title="Your plan"
        hint="Every module switched on for this clinic, what each costs a month today, and whether the next bill charges for it. Core modules are included; a module on trial is not billed until the trial ends."
      >
        <SubscriptionPlan subscription={data} />
      </SettingsSection>

      <SettingsSection
        title="Bills"
        hint="Raised at the start of each month for the paid modules switched on that day, at that day's price."
      >
        <SubscriptionBills subscription={data} today={today} />
      </SettingsSection>

      <HowToPay />
    </div>
  );
}

/**
 * §3.3 — tenant configuration. Not entitlements (what the clinic may use) and
 * not custom fields (what it collects): this is how it has set the product up,
 * and every value below changes behaviour elsewhere in the app.
 *
 * Laid out as a list rather than as a form of stacked cards: five sections,
 * each a run of rows, each row a label on the left and its control on a shared
 * right-hand edge. Everything that used to be a sentence under a field is on
 * the ⓘ beside its label, so the column of controls is unbroken from the top
 * of the page to the save bar.
 */
function ConfigurationTab() {
  const { config, updateConfig, notify } = useApp();
  const { tenant } = useTenant();
  const [draft, setDraft] = React.useState(config);
  React.useEffect(() => { setDraft(config); }, [config]);

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const types = appointmentTypes(draft);
  const typeProblem = typeListProblem(types);
  const setTypes = (next: AppointmentType[]) => set("appointment_types", next);
  const editType = (id: string, patch: Partial<AppointmentType>) =>
    setTypes(types.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const save = () => {
    if (typeProblem) return;
    /* the first type is what a new booking starts as, so the old single
       "default length" follows it rather than drifting away from it */
    const cleaned = types.map((t) => ({ ...t, name: t.name.trim() }));
    updateConfig({ ...draft, appointment_types: cleaned, default_duration: cleaned[0].minutes });
    notify({ tone: "ok", title: "Configuration saved", body: "Numbering, the diary and billing follow it from now on." });
  };

  return (
    <div className="grid grid-cols-1 gap-block lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 space-y-block">
        <SettingsSection
          title="Contact"
          hint="How this clinic is reached, and what is printed at the top of its invoices."
        >
          <SettingRow label="Phone" htmlFor="cfg-phone">
            <Input id="cfg-phone" value={draft.contact_phone} placeholder="+44 …"
                   onChange={(e) => set("contact_phone", e.target.value)} />
          </SettingRow>
          <SettingRow label="Email" htmlFor="cfg-email">
            <Input id="cfg-email" type="email" value={draft.contact_email} placeholder="hello@clinic.example"
                   onChange={(e) => set("contact_email", e.target.value)} />
          </SettingRow>
          <SettingRow label="Address" htmlFor="cfg-address" hint="Printed on every invoice.">
            <Input id="cfg-address" value={draft.address} onChange={(e) => set("address", e.target.value)} />
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="Records">
          <SettingRow
            label="Record number prefix"
            htmlFor="cfg-mrn" width="sm"
            hint="New patients are numbered from this. Existing record numbers keep the prefix they were issued with."
          >
            <Input id="cfg-mrn" value={draft.mrn_prefix} maxLength={4} className="tnum font-mono"
                   onChange={(e) => set("mrn_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          </SettingRow>
          <SettingRow
            label="Queue token prefix"
            htmlFor="cfg-token" width="sm"
            hint="Shown on the waiting-room screen and on the token itself."
          >
            <Input id="cfg-token" value={draft.token_prefix} maxLength={2} className="tnum font-mono"
                   onChange={(e) => set("token_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          </SettingRow>
          <SettingToggleRow
            label="Call urgent tokens first"
            hint="Off, and the board is strictly first come, first served."
          >
            <Switch checked={draft.urgent_first} onChange={(v) => set("urgent_first", v)} />
          </SettingToggleRow>
        </SettingsSection>

        <SettingsSection title="Appointments">
          <SettingRow label="Day starts" htmlFor="cfg-start" width="md">
            <Input id="cfg-start" type="time" value={draft.day_start}
                   onChange={(e) => set("day_start", e.target.value)} />
          </SettingRow>
          <SettingRow label="Day ends" htmlFor="cfg-end" width="md">
            <Input id="cfg-end" type="time" value={draft.day_end}
                   onChange={(e) => set("day_end", e.target.value)} />
          </SettingRow>
        </SettingsSection>

        <SettingsSection
          title="Appointment types"
          hint="Each type's length is also its slot interval — a 45-minute visit is offered every 45 minutes. The first type is what a new booking starts as."
          actions={
            <Button size="sm" variant="secondary" disabled={types.length >= 20}
                    onClick={() => setTypes([...types, { id: newTypeId(), name: "", minutes: 30 }])}>
              <IconPlus size={14} /> Add type
            </Button>
          }
        >
          <div className="hidden grid-cols-[minmax(0,1fr)_10rem_5.5rem_2rem] gap-3 px-4 pt-2.5 text-caption font-medium text-ink-2 sm:grid">
            <span>Name</span><span>Length and slot interval</span><span className="text-right">Slots a day</span><span />
          </div>
          {types.map((t, i) => {
            const perDay = slotTimes(draft.day_start, draft.day_end, t.minutes).length;
            return (
              <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_10rem_5.5rem_2rem]">
                <Input
                  aria-label={`Name of appointment type ${i + 1}`}
                  value={t.name}
                  placeholder="e.g. Root canal"
                  maxLength={60}
                  invalid={!t.name.trim()}
                  onChange={(e) => editType(t.id, { name: e.target.value })}
                />
                <Select
                  aria-label={`Length of ${t.name || "this type"}`}
                  className="col-start-1 sm:col-start-auto"
                  value={String(t.minutes)}
                  onChange={(e) => editType(t.id, { minutes: Number(e.target.value) })}
                >
                  {Array.from(new Set([...TYPE_LENGTHS, t.minutes])).sort((a, b) => a - b).map((m) => (
                    <option key={m} value={m}>{formatLength(m)}</option>
                  ))}
                </Select>
                <span className={cn("tnum text-label sm:text-right", perDay ? "text-ink-2" : "text-critical-text")}>
                  {perDay ? perDay : "Doesn’t fit"}
                </span>
                <Button
                  size="icon-sm" variant="ghost"
                  className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
                  disabled={types.length === 1}
                  aria-label={`Remove ${t.name || "this type"}`}
                  onClick={() => setTypes(types.filter((x) => x.id !== t.id))}
                >
                  <IconTrash size={15} />
                </Button>
              </div>
            );
          })}
          {typeProblem && (
            <p role="alert" className="px-4 py-2.5 text-label text-critical-text">{typeProblem}</p>
          )}
        </SettingsSection>

        <SettingsSection title="Billing">
          <SettingRow label="Invoice prefix" htmlFor="cfg-inv" width="sm">
            <Input id="cfg-inv" value={draft.invoice_prefix} className="tnum font-mono"
                   onChange={(e) => set("invoice_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
          </SettingRow>
          {/* Astrale bills in rupees only, so this is a fact, not a choice */}
          <SettingValueRow label="Currency" value="Indian rupee (₹)" />
          <SettingRow label="Tax rate" htmlFor="cfg-tax" hint="Applied to new invoice lines. Invoices already raised keep the rate they were raised at." suffix="%" width="sm">
            <NumberInput id="cfg-tax" min={0} max={40} step="0.5" value={draft.tax_pct}
                         onChange={(n) => set("tax_pct", n)} />
          </SettingRow>
          <SettingRow label="Payment terms" htmlFor="cfg-terms" width="md">
            <Select id="cfg-terms" value={String(draft.payment_terms_days)}
                    onChange={(e) => set("payment_terms_days", Number(e.target.value))}>
              {[0, 7, 14, 30].map((d) => (
                <option key={d} value={d}>{d === 0 ? "Due immediately" : `${d} days`}</option>
              ))}
            </Select>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title="Inventory">
          <SettingRow
            label="Expiry alert threshold"
            htmlFor="cfg-expiry"
            hint="A batch expiring within this many days shows up as a warning on the inventory board."
            suffix="days"
            width="sm"
          >
            <NumberInput id="cfg-expiry" min={1} max={730} value={draft.expiry_alert_days}
                         onChange={(n) => set("expiry_alert_days", n)} />
          </SettingRow>
        </SettingsSection>

        {/* The save bar follows the sections rather than sitting inside the
            last one — it commits all five, not Inventory. */}
        <SettingsActions note={dirty ? "Unsaved changes" : "Saved — every module reads these values."}>
          <Button variant="ghost" onClick={() => setDraft(config)} disabled={!dirty}>Discard</Button>
          <Button variant="primary" disabled={!dirty || !!typeProblem} onClick={save}>
            <IconCheck size={15} /> Save changes
          </Button>
        </SettingsActions>
      </div>

      <aside className="space-y-block">
        <SettingsSection
          title="What this changes"
          hint="Previewed from the values on the left, before they are saved."
        >
          <SettingValueRow label="Next record number"
                           value={<span className="tnum font-mono">{draft.mrn_prefix || "AS"}-1502</span>} />
          <SettingValueRow label="Next invoice"
                           value={<span className="tnum font-mono">{draft.invoice_prefix || "INV"}-2045</span>} />
          <SettingValueRow label="Payment due"
                           value={draft.payment_terms_days === 0 ? "On issue" : `${draft.payment_terms_days} days after issue`} />
          <SettingValueRow label="Tax on new lines" value={`${draft.tax_pct}%`} />
          <SettingValueRow label="Money shown as" value={currency(1234.5)} />
        </SettingsSection>

        <SettingsSection
          title="Diary shape"
          hint="The start times the booking dialog offers for each type, from the day's opening and closing times."
        >
          {types.map((t) => {
            const times = slotTimes(draft.day_start, draft.day_end, t.minutes);
            return (
              <div key={t.id} className="px-4 py-row">
                <p className="flex items-baseline justify-between gap-2 text-label">
                  <span className="truncate font-medium text-ink">{t.name.trim() || "Unnamed type"}</span>
                  <span className="shrink-0 text-caption text-ink-2">every {formatLength(t.minutes)}</span>
                </p>
                {times.length === 0 ? (
                  <p className="mt-1.5 text-caption text-critical-text">The day is shorter than one of these.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {times.slice(0, 6).map((time) => (
                      <span key={time} className="tnum rounded-[var(--r-sm)] border border-line bg-surface-2 px-2 py-1 text-micro text-ink-2">
                        {formatTime12(time)}
                      </span>
                    ))}
                    {times.length > 6 && (
                      <span className="self-center text-caption text-ink-2">+{times.length - 6} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </SettingsSection>

        <SettingsSection title="Not configuration">
          <div className="px-4 py-row">
            <p className="text-caption leading-relaxed text-ink-2">
              What {tenant.name} is <em>allowed</em> to use is an entitlement, and what it <em>collects</em> is a
              field definition. Both are deliberately separate tabs — conflating them is what makes multi-tenant
              products hard to reason about.
            </p>
          </div>
        </SettingsSection>
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
          <li key={f.id} className="flex items-center justify-between gap-2 text-label">
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
      <CardHeader
        icon={<IconLayers size={15} />} title="Fields on your forms"
        hint="What staff see on the patient and consultation forms right now, including the fields your clinic added."
      />
      <CardBody className="space-y-block pt-0">
        {row(`Patient · ${pluralise(patient.length, "field")}`, patient)}
        {row(`Encounter · ${pluralise(encounter.length, "field")}`, encounter)}
      </CardBody>
    </Card>
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
      subtitle="It appears straight away on registration, the patient record and the consultation."
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
                  description="Staff can’t save the form without filling it in." />
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
              <p className="truncate text-caption text-ink-3">
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
              <p className="text-micro font-semibold uppercase tracking-[0.09em] text-accent-text">
                Sign-in credentials
              </p>
              <dl className="mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-caption text-ink-2">Email</dt>
                  <dd className="tnum break-all font-mono text-label text-ink">{person.email}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-caption text-ink-2">Password</dt>
                  <dd className="tnum font-mono text-label text-ink">{created.password}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex gap-2.5 rounded-[var(--r)] border border-line bg-surface-2 p-3.5">
              <IconMail size={16} className="mt-px shrink-0 text-ink-3" />
              <p className="text-label leading-relaxed text-ink-2">
                Invited accounts are refused at sign-in until they have a password. There is no invitation
                email yet, so give <span className="text-ink">{person.name}</span> a password from this form
                instead when they are ready to start.
              </p>
            </div>
          )}

          <p className="text-caption leading-relaxed text-ink-3">
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
            <p className="text-label leading-snug text-critical-text">{refused}</p>
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

        <p className="flex gap-2.5 border-t border-line-soft pt-3 text-caption leading-relaxed text-ink-3">
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

/**
 * A colleague's details, corrected. Only what changed is sent. The role is
 * read-only on your own row — the server refuses that change, because an admin
 * who demotes themselves cannot undo it — and a new email is a new username,
 * so the form says what happens to a link already sent.
 */
function EditPersonModal({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const { session, updateUser, notify } = useApp();
  const { data: staff } = useUsers();
  const own = user.id === session.userId;

  const [name, setName] = React.useState(user.name);
  const [email, setEmail] = React.useState(user.email);
  const [role, setRole] = React.useState<Role>(user.role);
  const [speciality, setSpeciality] = React.useState(user.speciality ?? "");
  const [busy, setBusy] = React.useState(false);
  const [refused, setRefused] = React.useState<string | null>(null);

  /* each opening starts from the row as it is now */
  React.useEffect(() => {
    if (!open) return;
    setName(user.name); setEmail(user.email); setRole(user.role); setSpeciality(user.speciality ?? "");
    setBusy(false); setRefused(null);
  }, [open, user]);

  const trimmedName = name.trim();
  const address = email.trim().toLowerCase();
  const emailChanged = address !== user.email.toLowerCase();
  const duplicate = emailChanged && staff.some((u) => u.id !== user.id && u.email.toLowerCase() === address);
  const nameError = trimmedName.length < 2 ? "At least two characters." : null;
  const emailError = !EMAIL_SHAPE.test(address)
    ? "An address they can be reached at — it is also their username."
    : duplicate ? "Someone here already signs in with that." : null;

  const changes: api.UserChanges = {};
  if (trimmedName !== user.name) changes.name = trimmedName;
  if (emailChanged) changes.email = address;
  if (role !== user.role) changes.role = role;
  if (speciality.trim() !== (user.speciality ?? "")) changes.speciality = speciality.trim();
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    if (nameError || emailError || !dirty) return;
    setBusy(true);
    setRefused(null);
    try {
      const saved = await updateUser(user.id, changes);
      notify({
        tone: "ok",
        title: `${saved.name} updated`,
        body: changes.role
          ? `Now ${ROLE_LABEL[saved.role].toLowerCase()} — it applies from their next click.`
          : changes.email && saved.status === "invited"
            ? `A fresh invitation has gone to ${saved.email}.`
            : undefined,
      });
      onClose();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That change was not saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${user.name}`}
      subtitle="Their details in this clinic. What they recorded keeps the name it was recorded under."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => { void save(); }}
                  disabled={busy || !dirty || !!nameError || !!emailError}>
            <IconCheck size={15} /> {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {refused && (
          <div role="alert" className="flex gap-2.5 rounded-[var(--r)] border border-critical-border bg-critical-soft p-3">
            <IconAlert size={16} className="mt-px shrink-0 text-critical-text" />
            <p className="text-label leading-snug text-critical-text">{refused}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} invalid={!!nameError} />
          </Field>
          <Field label="Email" required error={emailError}
                 help={!emailError && emailChanged
                   ? user.status === "invited"
                     ? "Their invitation moves to this address."
                     : "They sign in with this from now on."
                   : undefined}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!emailError} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Role" help={own ? "Another practice admin can change your role." : "Applies from their next click."}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={own}>
              {ROLE_CHOICES.map((r) => <option key={r.value} value={r.value}>{ROLE_LABEL[r.value]}</option>)}
            </Select>
          </Field>
          <Field label="Speciality" help="Shown under their name, and on the diary for a clinician.">
            <Input value={speciality} onChange={(e) => setSpeciality(e.target.value)} placeholder="Endodontics" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Removing someone. Only an account that never recorded anything can go —
 * the server counts what their name is on and refuses otherwise, and this
 * dialog turns that refusal into the thing to do instead: lock the account.
 */
function DeletePersonDialog({ user, open, onClose }: { user: User; open: boolean; onClose: () => void }) {
  const { deleteUser, setUserStatus, notify } = useApp();
  const [busy, setBusy] = React.useState(false);
  const [refused, setRefused] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) { setBusy(false); setRefused(null); } }, [open]);

  const remove = async () => {
    setBusy(true);
    try {
      await deleteUser(user.id);
      notify({ tone: "ok", title: `${user.name} removed`, body: "Their account is gone from this clinic." });
      onClose();
    } catch (error) {
      setRefused(error instanceof Error ? error.message : "That account was not removed.");
    } finally {
      setBusy(false);
    }
  };

  const lockInstead = () => {
    setUserStatus(user.id, "locked");
    notify({ tone: "warn", title: `${user.name} locked`, body: "Their sign-in is refused; what they recorded stays." });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      width="sm"
      title={refused ? `${user.name} can't be deleted` : `Delete ${user.name}?`}
      subtitle={refused ? undefined : "For an account that was added by mistake. This cannot be undone."}
      footer={
        refused ? (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {user.status !== "locked" && (
              <Button variant="primary" onClick={lockInstead}>
                <IconLock size={15} /> Lock instead
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={() => { void remove(); }} disabled={busy}>
              <IconTrash size={15} /> {busy ? "Deleting…" : "Delete"}
            </Button>
          </>
        )
      }
    >
      {refused ? (
        <p className="flex items-start gap-2 rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2.5 text-label leading-snug text-warn-text">
          <IconAlert size={15} className="mt-px shrink-0" /> {refused}
        </p>
      ) : (
        <div className="flex items-center gap-3 rounded-[var(--r)] border border-line bg-surface-2 p-3.5">
          <Avatar name={user.name} initials={user.initials} tintKey={user.id} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{user.name}</p>
            <p className="truncate text-caption text-ink-3">{ROLE_LABEL[user.role]} · {user.email}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

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
            <p className="text-micro font-semibold uppercase tracking-[0.09em] text-accent-text">
              Sign-in credentials
            </p>
            <dl className="mt-2 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-caption text-ink-2">Email</dt>
                <dd className="tnum break-all font-mono text-label text-ink">{user.email}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-caption text-ink-2">Password</dt>
                <dd className="tnum font-mono text-label text-ink">{password}</dd>
              </div>
            </dl>
          </div>
          {locked && (
            <p className="flex gap-2.5 rounded-[var(--r)] border border-warn-border bg-warn-soft p-3 text-label leading-snug text-warn-text">
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
              <p className="text-label leading-snug text-critical-text">{refused}</p>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <Avatar name={user.name} initials={user.initials} size="sm" tintKey={user.id} />
            <div className="min-w-0">
              <p className="truncate text-label font-medium text-ink">{user.name}</p>
              <p className="tnum truncate font-mono text-caption text-ink-3">{user.email}</p>
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

          <ul className="space-y-2 border-t border-line-soft pt-3 text-caption leading-snug text-ink-3">
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
