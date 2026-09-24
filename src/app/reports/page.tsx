"use client";

import * as React from "react";
import { useApp, useTenant } from "@/lib/store/app-store";
import * as api from "@/lib/api";
import { openPdfBlob } from "@/lib/pdf";
import { useAnalytics } from "@/lib/query/hooks";
import { CLINICAL_TYPES, FEATURE_BY_KEY } from "@/lib/data/catalog";
import { modulePath } from "@/lib/nav";
import { currency, duration, formatDate, pluralise, weekdayShort } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink, Segmented } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart, RankBar } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { RoleGate } from "@/components/domain/gates";
import { Avatar } from "@/components/ui/misc";
import { PageLoader } from "@/components/ui/loader";
import {
  IconArrowRight, IconChart, IconClock, IconDownload, IconFlask, IconLock, IconPill, IconReceipt,
  IconSpark,
  IconStethoscope, IconUsers
} from "@/components/ui/icons";

export default function ReportsPage() {
  return (
    <RoleGate allow={["doctor"]}>
      <Reports />
    </RoleGate>
  );
}

function Reports() {
  const { hasFeature, notify } = useApp();
  const { tenant } = useTenant();
  const [range, setRange] = React.useState<7 | 14 | 30>(14);
  const [exporting, setExporting] = React.useState(false);

  /* The same window as the page, so the PDF is the page on paper. */
  const exportPdf = async () => {
    setExporting(true);
    try {
      openPdfBlob(await api.getReportPdf(range));
    } catch {
      notify({ tone: "warn", title: "Could not generate the report PDF", body: "Try again in a moment." });
    } finally {
      setExporting(false);
    }
  };

  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;
  const advanced = hasFeature("advanced_reports");

  /**
   * §3.14 — one request, aggregated in the database.
   *
   * Nothing on this page is derived in the browser any more: what a clinic has
   * bought decides which panels come back at all, so the client renders what it
   * is given rather than deciding what it is allowed to compute. It also means
   * the figures here cannot drift from the ones the API reports elsewhere —
   * there is only one implementation of each.
   */
  const { data: analytics, isPending } = useAnalytics(range);

  const core = analytics?.core;
  const modules = analytics?.modules;
  const visits = core?.visits_series ?? [];
  const attendance = core?.attendance_series ?? [];
  const funnel = core?.queue_funnel ?? [];
  const diagnoses = core?.top_diagnoses ?? [];
  const clinicalRows = analytics?.clinical.breakdown ?? [];
  const money = modules?.billing;
  const pharm = modules?.pharmacy;
  const lab = modules?.lab;
  const cohort = modules?.advanced_reports?.age_cohort ?? [];
  const sexSplit = (modules?.advanced_reports?.sex_split ?? []).filter((s) => s.value > 0);
  const clinicians = modules?.advanced_reports?.clinicians ?? [];

  if (isPending || !core) {
    return <PageLoader label="Working out the figures…" />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Everything here is read straight off the transactional collections. What gets computed depends on the modules this clinic runs and the shape of its clinical payloads — nothing is aggregated that the tenant does not own."
        actions={
          <>
            <Segmented
              value={range}
              onChange={setRange}
              options={[{ value: 7, label: "7 days" }, { value: 14, label: "14 days" }, { value: 30, label: "30 days" }]}
            />
            <Button variant="secondary" onClick={() => { void exportPdf(); }} disabled={exporting}>
              <IconDownload size={15} /> {exporting ? "Preparing…" : "Export PDF"}
            </Button>
          </>
        }
        meta={
          <>
            <Badge tone="accent" size="sm">Always computed</Badge>
            {hasFeature("pharmacy") && <Badge tone="neutral" size="sm">Pharmacy</Badge>}
            {hasFeature("lab") && <Badge tone="neutral" size="sm">Lab</Badge>}
            {hasFeature("billing") && <Badge tone="neutral" size="sm">Billing</Badge>}
            {advanced
              ? <Badge tone="accent" size="sm"><IconSpark size={11} /> Advanced reports</Badge>
              : <Badge tone="neutral" size="sm"><IconLock size={11} /> Advanced reports locked</Badge>}
          </>
        }
      />

      {/* always computed */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Registered patients" value={core.patients} icon={<IconUsers size={16} />}
              hint={`${core.new_patients} joined this month`} />
        <Stat label="Encounters" value={core.encounters} icon={<IconChart size={16} />}
              hint={`${core.prescriptions} prescriptions written`} />
        <Stat label="Average wait" value={core.avg_wait_minutes} unit="min"
              tone={core.avg_wait_minutes > 25 ? "warn" : "ok"} icon={<IconClock size={16} />}
              hint={`Consultation averages ${duration(core.avg_consultation_minutes)}`} />
        <Stat label="No-shows" value={core.no_shows} tone={core.no_shows ? "critical" : "ok"}
              icon={<IconUsers size={16} />} hint={`In the last ${range} days`} />
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<IconChart size={15} />} tone="accent" title={`Visits over ${range} days`} hint="Completed appointments and walk-in encounters." />
          <CardBody className="pt-1">
            <LineChart
              labels={visits.map((v) => weekdayShort(v.date))}
              series={[{ name: "Visits", values: visits.map((v) => v.value) }]}
              height={210}
              yLabel="visits per day"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<IconChart size={15} />} tone="accent" title="Attendance" hint="Kept, missed and cancelled bookings per day." />
          <CardBody className="pt-1">
            <BarChart
              labels={attendance.map((a) => weekdayShort(a.date))}
              series={[
                { name: "Kept", values: attendance.map((a) => a.kept) },
                { name: "No show", values: attendance.map((a) => a.missed) },
                { name: "Cancelled", values: attendance.map((a) => a.cancelled) },
              ]}
              stacked
              height={210}
              highlight={attendance.length - 1}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<IconChart size={15} />} tone="accent" title="Most recorded diagnoses" hint="From the encounter rows, not a separate index." />
          <CardBody className="pt-1">
            {diagnoses.length ? <RankBar rows={diagnoses} /> : <EmptyState compact icon={<IconStethoscope size={20} />} title="No encounters yet" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<IconChart size={15} />} tone="accent" title={`${clinical.label} signals`}
            hint={`Driven by clinical_ext — ${clinical.examLabel.toLowerCase()}.`}
          />
          <CardBody className="pt-1">
            {clinicalRows.length
              ? <RankBar rows={clinicalRows} colorAt={() => "var(--series-2)"} />
              : <EmptyState compact icon={<IconChart size={20} />} title="Nothing recorded yet"
                            body="Clinical analytics appear once encounters carry a payload." />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<IconChart size={15} />} tone="accent" title="Queue outcomes"
            subtitle={`${pluralise(core.wait_samples, "measured token")} · longest wait ${duration(core.max_wait_minutes)}`}
          />
          <CardBody className="pt-1 space-y-3">
            {funnel.map((f, i) => (
              <div key={f.label}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-label text-ink">{f.label}</span>
                  <span className="tnum font-mono text-label text-ink-2">{f.value}</span>
                </div>
                <Meter value={f.value} max={Math.max(1, ...funnel.map((x) => x.value))}
                       tone={i === 4 ? "critical" : i === 3 ? "ok" : i === 0 ? "warn" : "accent"} />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<IconChart size={15} />} tone="accent" title="Register composition" hint="Who is on the books." />
          <CardBody className="pt-1 space-y-5">
            <div>
              <p className="mb-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">By age band</p>
              <BarChart
                labels={cohort.map((c) => c.label)}
                series={[{ name: "Patients", values: cohort.map((c) => c.value) }]}
                height={150}
              />
            </div>
            {sexSplit.length > 1 && (
              <div className="border-t border-line-soft pt-4">
                <DonutChart slices={sexSplit} size={130} thickness={18}
                            centreValue={core.patients} centreLabel="patients" />
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* feature-conditional */}
      {(money || pharm || lab) && (
        <>
          <h2 className="mb-4 mt-8 font-display text-title-lg font-semibold text-ink">
            Module analytics
          </h2>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            {money && (
              <Card>
                <CardHeader tone="ok" icon={<IconReceipt size={16} />} title="Billing" hint="Non-void invoices only." />
                <CardBody className="pt-1">
                  <dl className="grid grid-cols-2 gap-x-4">
                    <KV label="Billed" value={<span className="tnum font-mono">{currency(money.billed)}</span>} />
                    <KV label="Collected" value={<span className="tnum font-mono text-ok-text">{currency(money.paid)}</span>} />
                    <KV label="Outstanding" value={<span className="tnum font-mono text-warn-text">{currency(money.outstanding)}</span>} />
                    <KV label="Invoices" value={money.count} />
                  </dl>
                  <div className="mt-4 border-t border-line-soft pt-4">
                    {money.revenue_mix.length ? (
                      <DonutChart slices={money.revenue_mix} size={130} thickness={18}
                                  centreValue={currency(money.billed)} centreLabel="billed"
                                  format={(n) => currency(n)} />
                    ) : <EmptyState compact icon={<IconReceipt size={20} />} title="Nothing billed" />}
                  </div>
                </CardBody>
              </Card>
            )}

            {pharm && (
              <Card>
                <CardHeader tone="ok" icon={<IconPill size={16} />} title="Pharmacy" hint="From dispense transactions." />
                <CardBody className="pt-1">
                  <dl className="grid grid-cols-2 gap-x-4">
                    <KV label="Units out" value={<span className="tnum font-mono">{pharm.dispensed_units}</span>} />
                    <KV label="Value" value={<span className="tnum font-mono">{currency(pharm.dispensed_value)}</span>} />
                    <KV label="At the counter" value={pharm.prescriptions_waiting} />
                    <KV label="Fully dispensed" value={pharm.fully_dispensed} />
                  </dl>
                  <p className="mt-4 border-t border-line-soft pt-3 text-caption leading-relaxed text-ink-3">
                    Consumption is the sum of negative ledger rows — the same number the inventory page shows,
                    because there is only one ledger.
                  </p>
                </CardBody>
              </Card>
            )}

            {lab && (
              <Card>
                <CardHeader tone="info" icon={<IconFlask size={16} />} title="Lab" hint="Orders by state." />
                <CardBody className="pt-1">
                  <BarChart
                    labels={["Ordered", "In lab", "Resulted", "Verified"]}
                    series={[{ name: "Orders", values: [lab.ordered, lab.pending, lab.resulted, lab.verified] }]}
                    height={160}
                  />
                  <p className="mt-3 text-label text-ink-2">
                    {lab.abnormal
                      ? `${pluralise(lab.abnormal, "order")} carries a flagged analyte.`
                      : "No flagged analytes in the current set."}
                  </p>
                </CardBody>
              </Card>
            )}
          </div>
        </>
      )}

      {/* entitlement-gated extras */}
      <h2 className="mb-1 mt-8 font-display text-title-lg font-semibold text-ink">
        Advanced reports
      </h2>
      <p className="mb-4 max-w-2xl text-body text-ink-2">
        {advanced
          ? "Cohort and clinician breakdowns, unlocked for this tenant."
          : "These panels are part of a purchasable module. The data already exists — the entitlement decides whether it is computed."}
      </p>

      {advanced ? (
        <Card className="overflow-hidden">
          <CardHeader icon={<IconChart size={15} />} tone="accent" title="By clinician" hint="Encounters, prescriptions and invoiced value per doctor." />
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Clinician</TH><TH>Speciality</TH><TH align="right">Encounters</TH>
                  <TH align="right">Prescriptions</TH><TH align="right">Invoiced</TH>
                </tr>
              </THead>
              <TBody>
                {clinicians.map((c) => (
                  <TR key={c.user_id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} initials={c.initials} size="sm" tintKey={c.user_id} />
                        <span className="font-medium text-ink">{c.name}</span>
                      </div>
                    </TD>
                    <TD className="text-ink-2">{c.speciality ?? "—"}</TD>
                    <TD align="right" className="tnum font-mono">{c.encounters}</TD>
                    <TD align="right" className="tnum font-mono">{c.prescriptions}</TD>
                    <TD align="right" className="tnum font-mono">{currency(c.revenue)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardBody className="pt-6">
            <EmptyState
              icon={<IconLock size={20} />}
              title={`${FEATURE_BY_KEY.advanced_reports.name} is not enabled`}
              body={FEATURE_BY_KEY.advanced_reports.summary}
              action={
                <ButtonLink href={modulePath("advanced_reports")} variant="primary" size="sm">
                  See what it adds <IconArrowRight size={14} />
                </ButtonLink>
              }
            />
          </CardBody>
        </Card>
      )}

      <p className="mt-6 text-caption leading-relaxed text-ink-3">
        Figures cover {formatDate(analytics.range.to, "long")} and the {range} days before it, and every one of them
        was counted in the database from the rows this clinic owns — nothing on this page is derived in the browser,
        and nothing is estimated. A day with no visits is a day with no visits.
      </p>
    </>
  );
}
