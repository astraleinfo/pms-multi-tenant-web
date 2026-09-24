"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { usePlatformBilling } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { formatDate, pluralise } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ConsolePage } from "@/components/platform/chrome";
import { ClinicBills } from "@/components/platform/clinic-bills";
import { ActivityTab, RevenueTab } from "@/components/platform/revenue-tabs";
import { rentMoney } from "@/components/domain/subscription";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { SearchInput, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  IconAlert, IconChart, IconChevronRight, IconClock, IconLock, IconReceipt, IconRefresh,
} from "@/components/ui/icons";

/* ==========================================================================
   Subscription bills — what each clinic owes the platform, and the hold.

   The run raises a bill per clinic per month, emails reminders as it nears
   and passes its due date, and holds a clinic that is still unpaid after the
   grace period. This screen is where a payment is recorded (which lifts the
   hold at once), a mistaken bill withdrawn, and a clinic exempted.
   ========================================================================== */

type Tab = "bills" | "revenue" | "activity";
const TABS: Tab[] = ["bills", "revenue", "activity"];

export default function BillingPage(props: PageProps<"/platform/billing">) {
  const sp = React.use(props.searchParams);
  const opening = TABS.find((t) => t === sp.tab) ?? "bills";
  return <ConsolePage><BillingConsole opening={opening} /></ConsolePage>;
}

type Standing = "held" | "overdue" | "open" | "clear" | "exempt";

const STANDING: Record<Standing, { label: string; tone: Tone }> = {
  held: { label: "On hold", tone: "critical" },
  overdue: { label: "Overdue", tone: "critical" },
  open: { label: "Bill open", tone: "warn" },
  clear: { label: "Paid up", tone: "neutral" },
  exempt: { label: "Exempt", tone: "neutral" },
};

type Filter = "any" | Standing;

function standingOf(row: api.PlatformBillingRow): Standing {
  if (row.summary.exempt) return "exempt";
  if (row.summary.on_hold) return "held";
  if (row.summary.overdue) return "overdue";
  if (row.summary.open_count) return "open";
  return "clear";
}

function BillingConsole({ opening }: { opening: Tab }) {
  const { platformUser, notify } = useApp();
  const superAdmin = api.isSuperAdmin(platformUser);
  const queryClient = useQueryClient();
  const { data, isPending, isError } = usePlatformBilling();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("any");
  const [open, setOpen] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>(opening);
  const openTab = (next: Tab) => {
    setTab(next);
    router.replace(`/platform/billing?tab=${next}`, { scroll: false });
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.platformRoot() });

  const run = async () => {
    setRunning(true);
    try {
      const result = await api.runBilling();
      await refresh();
      notify({
        tone: result.failed.length ? "warn" : "ok",
        title: "Billing run finished",
        body: [
          `${pluralise(result.raised.length, "bill")} raised`,
          `${pluralise(result.reminded.length, "reminder")} sent`,
          result.held.length ? `${result.held.join(", ")} put on hold` : null,
          result.lifted.length ? `${result.lifted.join(", ")} released` : null,
          result.failed.length ? `${result.failed.length} failed — see the API log` : null,
        ].filter(Boolean).join(" · "),
      });
    } catch (error) {
      notify({ tone: "critical", title: "The run did not complete", body: error instanceof Error ? error.message : "Try again." });
    }
    setRunning(false);
  };

  const rows = data?.clinics ?? [];
  const shown = rows.filter((row) => {
    const term = q.trim().toLowerCase();
    if (term && !row.tenant.name.toLowerCase().includes(term) && !row.tenant.slug.includes(term)) return false;
    return filter === "any" || standingOf(row) === filter;
  });

  const currency = data?.currency ?? "INR";
  const outstanding = rows.reduce((sum, r) => sum + r.summary.outstanding, 0);
  const held = rows.filter((r) => r.summary.on_hold).length;
  const overdue = rows.filter((r) => !r.summary.on_hold && r.summary.overdue).length;
  const openBills = rows.reduce((sum, r) => sum + r.summary.open_count, 0);

  return (
    <>
      <PageHeader
        eyebrow="Commercial"
        title="Billing & revenue"
        description="What every clinic owes the platform, what the platform has billed, and what has come in. Bills are raised monthly and reminders go to each clinic's practice admins; a clinic still unpaid after the grace period is put on hold until the bill is settled here."
        meta={
          data && (
            <>
              <Badge tone={data.enabled ? "ok" : "neutral"} size="sm" dot={data.enabled}>
                {data.enabled ? "Runs automatically" : "Manual runs only"}
              </Badge>
              <span className="text-label text-ink-2">
                Due {data.due_days} days after raising · {data.grace_days}-day grace · reminder {data.reminder_days_before_due} days before
              </span>
            </>
          )
        }
        actions={
          superAdmin && (
            <Button variant="primary" onClick={() => { void run(); }} disabled={running}>
              <IconRefresh size={15} /> {running ? "Running…" : "Run billing now"}
            </Button>
          )
        }
      />

      <Tabs
        value={tab}
        onChange={openTab}
        className="my-5"
        tabs={[
          { value: "bills", label: "Bills", icon: <IconReceipt size={15} />, count: rows.length },
          { value: "revenue", label: "Revenue", icon: <IconChart size={15} /> },
          { value: "activity", label: "Activity", icon: <IconReceipt size={15} /> },
        ]}
      />

      {tab === "revenue" && data && <RevenueTab billing={data} />}
      {tab === "activity" && data && <ActivityTab billing={data} />}

      {tab === "bills" && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Outstanding" value={rentMoney(outstanding, currency)} icon={<IconReceipt size={16} />} hint={`${pluralise(openBills, "open bill")}`} />
            <Stat label="On hold" value={held} icon={<IconLock size={16} />} hint="Unpaid past the grace period" />
            <Stat label="Overdue" value={overdue} icon={<IconAlert size={16} />} hint="Past due, still in grace" />
            <Stat label="Clinics" value={rows.length} icon={<IconClock size={16} />} hint={`${rows.filter((r) => r.summary.exempt).length} exempt`} />
          </section>

          {!data?.enabled && data && (
            <p className="mt-5 rounded-[var(--r)] border border-line bg-surface-2 px-4 py-3 text-label leading-relaxed text-ink-2">
              Automatic billing is off (<code className="font-mono text-caption">RENT_BILLING_ENABLED=false</code>), so
              bills are raised and reminders sent only when somebody presses <strong className="font-medium text-ink">Run billing now</strong>.
              Turn it on in the API&apos;s environment once the run does what you expect.
            </p>
          )}

          <Card className="mt-5 overflow-hidden">
            <CardHeader
              icon={<IconReceipt size={15} />} tone="ok" title="Clinics"
              hint="Open a clinic to see its bills, record a payment or withdraw a bill."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Clinic or subdomain" className="h-8 w-44" />
                  <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-8 text-label">
                    <option value="any">Any standing</option>
                    {(Object.keys(STANDING) as Standing[]).map((s) => <option key={s} value={s}>{STANDING[s].label}</option>)}
                  </Select>
                </div>
              }
            />

            {isPending ? (
              <p className="px-5 py-10 text-center text-label text-ink-3">Reading every clinic&apos;s bills…</p>
            ) : isError ? (
              <p className="px-5 py-10 text-center text-label text-ink-3">The bills could not be read. Try again in a moment.</p>
            ) : shown.length === 0 ? (
              <EmptyState icon={<IconReceipt size={20} />} title="No clinic matches" body="Loosen the filters to see the rest." compact />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <TR>
                      <TH>Clinic</TH>
                      <TH>Standing</TH>
                      <TH>Next due</TH>
                      <TH>Hold from</TH>
                      <TH align="right">Outstanding</TH>
                      <TH align="right"><span className="sr-only">Open</span></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {shown.map((row) => {
                      const standing = STANDING[standingOf(row)];
                      const expanded = open === row.tenant.id;
                      return (
                        <React.Fragment key={row.tenant.id}>
                          <TR>
                            <TD>
                              <Link href={`/platform/tenants/${row.tenant.id}`} className="block min-w-0 hover:underline">
                                <span className="block truncate font-medium text-ink">{row.tenant.name}</span>
                                <span className="tnum block truncate font-mono text-caption text-ink-3">{row.tenant.slug}</span>
                              </Link>
                            </TD>
                            <TD><Badge tone={standing.tone} size="sm" dot={standing.tone === "critical"}>{standing.label}</Badge></TD>
                            <TD><span className="tnum text-ink-2">{row.summary.next_due_on ? formatDate(row.summary.next_due_on) : "—"}</span></TD>
                            <TD><span className="tnum text-ink-2">{row.summary.open_count && row.summary.next_hold_on ? formatDate(row.summary.next_hold_on) : "—"}</span></TD>
                            <TD align="right">
                              <span className={cn("tnum font-mono text-label", row.summary.outstanding ? "font-medium text-ink" : "text-ink-3")}>
                                {row.summary.outstanding ? rentMoney(row.summary.outstanding, row.summary.currency) : "—"}
                              </span>
                            </TD>
                            <TD align="right">
                              <Button
                                variant="ghost" size="sm" aria-expanded={expanded}
                                onClick={() => setOpen(expanded ? null : row.tenant.id)}
                              >
                                {row.invoices.length} {row.invoices.length === 1 ? "bill" : "bills"}
                                <IconChevronRight size={14} className={cn("transition-transform", expanded && "rotate-90")} />
                              </Button>
                            </TD>
                          </TR>
                          {expanded && (
                            <TR>
                              <TD colSpan={6} className="bg-surface-2">
                                <ClinicBills row={row} superAdmin={superAdmin} onChanged={refresh} />
                              </TD>
                            </TR>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </>
      )}
    </>
  );
}
