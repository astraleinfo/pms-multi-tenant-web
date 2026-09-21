"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { usePlatformJob, usePlatformJobs } from "@/lib/query/hooks";
import { useApp } from "@/lib/store/app-store";
import { pluralise } from "@/lib/format";
import {
  JOB_LABEL, JOB_STATUSES, JOB_TONE,
  agoOf, durationOf, lastEventOf, localInputToUtc, momentOf, shortTaskName,
} from "@/lib/platform/jobs";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/modal";
import { Field, Input, SearchInput, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/loader";
import { ConsolePage } from "@/components/platform/chrome";
import {
  IconAlert, IconCheck, IconClock, IconExternal, IconFilter, IconLayers, IconList, IconMonitor,
  IconPulse, IconRefresh
} from "@/components/ui/icons";

/* ==========================================================================
   Background jobs.

   The platform's own machinery, which is why this is the one console section
   the support desk cannot open. Celery runs the work, Flower watches the event
   stream and keeps the history, and this reads Flower through the API — which
   checks the role before it relays anything, so the section missing from the
   rail is a courtesy rather than the lock.

   Two views of the same monitor, deliberately. This page answers the questions
   worth asking every day — what is running, what failed, which worker — in the
   console's own vocabulary and design. Flower's own interface is one tab away
   for everything else, proxied through the same check.
   ========================================================================== */

const PAGE_SIZE = 25;

export default function JobsPage() {
  return (
    <ConsolePage superAdmin>
      <JobsConsole />
    </ConsolePage>
  );
}

type Tab = "jobs" | "workers" | "flower";

interface Filters {
  status: api.JobStatus | "any";
  task: string;
  worker: string;
  since: string;
  until: string;
  q: string;
}

const NO_FILTERS: Filters = { status: "any", task: "", worker: "", since: "", until: "", q: "" };

function activeCount(f: Filters) {
  return [f.status !== "any", !!f.task, !!f.worker, !!f.since, !!f.until, !!f.q.trim()]
    .filter(Boolean).length;
}

function JobsConsole() {
  const [tab, setTab] = React.useState<Tab>("jobs");
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [page, setPage] = React.useState(0);
  const [open, setOpen] = React.useState<string | null>(null);

  /* The query the server is asked for, rebuilt only when a filter really
     changes — it is the cache key, so a new object each render would refetch
     on every tick of the poll. */
  const query = React.useMemo<api.JobQuery>(() => ({
    status: filters.status === "any" ? undefined : filters.status,
    task: filters.task || undefined,
    worker: filters.worker || undefined,
    since: localInputToUtc(filters.since),
    until: localInputToUtc(filters.until),
    search: filters.q.trim() || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [filters, page]);

  /* Flower's own tab is a live interface of its own; polling behind it is
     work nobody is looking at. */
  const { data, isPending, isFetching, refetch } = usePlatformJobs(query, {
    poll: tab !== "flower",
  });

  const summary = data?.summary;
  const available = data?.available ?? true;
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  const active = activeCount(filters);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Background jobs"
        description="Everything Celery runs away from a request: the support desk's email, the sweep that re-queues whatever the broker lost, and anything a clinic's action hands off. The figures are taken over the monitor's window rather than over all time, because that is as far back as it can see."
        meta={
          <>
            <span className="text-label text-ink-2">
              {summary
                ? `${pluralise(summary.window, "job")} in the monitor's window`
                : "Reading the monitor…"}
            </span>
            {isFetching && !isPending && (
              <span className="flex items-center gap-1.5 text-caption text-ink-3">
                <Spinner size={12} /> refreshing
              </span>
            )}
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              <IconRefresh size={15} /> Refresh
            </Button>
            <OpenFlowerButton />
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Active" value={summary?.active ?? "—"} tone="accent"
          icon={<IconPulse size={16} />}
          hint={summary?.active ? "running right now" : "nothing in flight"}
        />
        <Stat
          label="Pending" value={summary?.pending ?? "—"}
          tone={summary?.pending ? "warn" : "ink"}
          icon={<IconClock size={16} />}
          hint="queued, not started"
        />
        <Stat
          label="Completed" value={summary?.completed ?? "—"} tone="ok"
          icon={<IconCheck size={16} />}
          hint={summary ? `${summary.retried} retried` : undefined}
        />
        <Stat
          label="Failed" value={summary?.failed ?? "—"}
          tone={summary?.failed ? "critical" : "ink"}
          icon={<IconAlert size={16} />}
          hint={
            summary?.failed
              ? "each one is a job that gave up"
              : "nothing has failed in the window"
          }
        />
        <Stat
          label="Workers online" value={summary?.workers_online ?? "—"}
          tone={summary && summary.workers_online === 0 ? "critical" : "ink"}
          icon={<IconMonitor size={16} />}
          hint={summary ? `of ${summary.workers_total} known` : undefined}
        />
      </section>

      {!available && <MonitorDown problem={data?.problem} />}

      <Tabs
        value={tab}
        onChange={setTab}
        className="my-5"
        tabs={[
          { value: "jobs", label: "Jobs", icon: <IconList size={15} />, count: data?.total },
          { value: "workers", label: "Workers", icon: <IconPulse size={15} />, count: data?.workers.length },
          { value: "flower", label: "Flower", icon: <IconExternal size={15} /> },
        ]}
      />

      {tab === "jobs" && (
        <JobsTab
          data={data}
          loading={isPending}
          filters={filters}
          onFilter={set}
          onClear={() => { setFilters(NO_FILTERS); setPage(0); }}
          activeFilters={active}
          page={page}
          onPage={setPage}
          onOpen={setOpen}
        />
      )}
      {tab === "workers" && <WorkersTab workers={data?.workers ?? []} loading={isPending} />}
      {tab === "flower" && <FlowerTab />}

      <JobDrawer taskId={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* ---- the monitor itself being down ----------------------------------------- */

function MonitorDown({ problem }: { problem?: string | null }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[var(--r-lg)] border border-warn-border bg-warn-soft px-4 py-3">
      <IconAlert size={17} className="mt-0.5 shrink-0 text-warn-text" />
      <div className="min-w-0">
        <p className="text-label font-semibold text-warn-text">The job monitor is not answering</p>
        <p className="mt-0.5 text-caption leading-relaxed text-ink-2">
          {problem ?? "Flower could not be reached."}{" "}
          Jobs are still queued and still running — Celery does not depend on
          the monitor. What is missing is the view, and the history Flower held
          in memory does not survive its restart.
        </p>
      </div>
    </div>
  );
}

/* ---- jobs ------------------------------------------------------------------ */

const col = columnHelperFor<api.Job>();

function jobColumns(onOpen: (id: string) => void) {
  return col.columns([
    col.accessor((j) => j.name, {
      id: "task",
      header: "Task",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink" title={row.original.name}>
            {shortTaskName(row.original.name)}
          </p>
          <p className="tnum truncate font-mono text-micro text-ink-3" title={row.original.id}>
            {row.original.id.slice(0, 8)}
          </p>
        </div>
      ),
    }),
    col.accessor((j) => j.status, {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={JOB_TONE[row.original.status]} size="sm" dot pulse={row.original.running}>
            {JOB_LABEL[row.original.status]}
          </Badge>
          {row.original.retries > 0 && (
            <span className="text-micro text-ink-3">
              after {pluralise(row.original.retries, "retry", "retries")}
            </span>
          )}
        </div>
      ),
    }),
    col.accessor((j) => j.worker ?? "", {
      id: "worker",
      header: "Worker",
      cell: ({ row }) => (
        <span className="tnum font-mono text-label text-ink-2">
          {row.original.worker ?? <span className="text-ink-3">unassigned</span>}
        </span>
      ),
    }),
    col.accessor((j) => j.started_at ?? "", {
      id: "started",
      header: "Started",
      cell: ({ row }) => (
        <div className="tnum font-mono text-label leading-snug text-ink-2">
          <p>{momentOf(row.original.started_at ?? row.original.received_at)}</p>
          <p className="text-micro text-ink-3">{agoOf(lastEventOf(row.original))}</p>
        </div>
      ),
    }),
    col.accessor((j) => j.runtime_seconds ?? -1, {
      id: "duration",
      header: "Duration",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span
          className={cn(
            "tnum font-mono text-label",
            row.original.running ? "text-accent-text" : "text-ink-2",
          )}
        >
          {durationOf(row.original.runtime_seconds)}
          {row.original.running && "…"}
        </span>
      ),
    }),
    col.accessor((j) => j.args, {
      id: "args",
      header: "Arguments",
      cell: ({ row }) => <Arguments job={row.original} />,
    }),
    col.display({
      id: "open",
      header: "",
      meta: { align: "right", width: 90 },
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => onOpen(row.original.id)}>
          Details
        </Button>
      ),
    }),
  ]);
}

/** The call, or the error — whichever is the more useful thing to show. */
function Arguments({ job }: { job: api.Job }) {
  if (job.exception) {
    return (
      <p className="truncate font-mono text-micro text-critical-text" title={job.exception}>
        {job.exception}
      </p>
    );
  }
  const call = [job.args, job.kwargs].filter((p) => p && p !== "{}" && p !== "()").join(" ");
  return call
    ? <p className="truncate font-mono text-micro text-ink-3" title={call}>{call}</p>
    : <span className="text-micro text-ink-3">no arguments</span>;
}

function JobsTab({
  data, loading, filters, onFilter, onClear, activeFilters, page, onPage, onOpen,
}: {
  data?: api.JobsPage;
  loading: boolean;
  filters: Filters;
  onFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onClear: () => void;
  activeFilters: number;
  page: number;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
}) {
  const columns = React.useMemo(() => jobColumns(onOpen), [onOpen]);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        tone="neutral" icon={<IconFilter size={16} />}
        title="Filters"
        hint="Narrow by what the job is, where it ran and when. The tiles above are counted before any of this, so they stay true while a filter is on."
        actions={
          activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear {activeFilters === 1 ? "filter" : `${activeFilters} filters`}
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-3 border-t border-line-soft bg-surface-2 px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Status">
          <Select
            value={filters.status}
            onChange={(e) => onFilter("status", e.target.value as Filters["status"])}
          >
            <option value="any">Any status</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>{JOB_LABEL[s]}</option>
            ))}
          </Select>
        </Field>

        <Field label="Task">
          <Select value={filters.task} onChange={(e) => onFilter("task", e.target.value)}>
            <option value="">Any task</option>
            {(data?.task_names ?? []).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Worker">
          <Select value={filters.worker} onChange={(e) => onFilter("worker", e.target.value)}>
            <option value="">Any worker</option>
            {(data?.worker_names ?? []).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        </Field>

        <Field label="From" hint="your time">
          <Input
            type="datetime-local"
            value={filters.since}
            max={filters.until || undefined}
            onChange={(e) => onFilter("since", e.target.value)}
          />
        </Field>

        <Field label="To" hint="your time">
          <Input
            type="datetime-local"
            value={filters.until}
            min={filters.since || undefined}
            onChange={(e) => onFilter("until", e.target.value)}
          />
        </Field>

        <Field label="Search">
          <SearchInput
            value={filters.q}
            onChange={(e) => onFilter("q", e.target.value)}
            placeholder="Task, id, arguments or error"
          />
        </Field>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        getRowId={(j) => j.id}
        minWidth="76rem"
        onRowClick={(j) => onOpen(j.id)}
        server={{
          total: data?.total ?? 0,
          page,
          onPageChange: onPage,
          /* The search box lives in the filter panel with the rest of them,
             so the table's own is switched off rather than duplicated. */
          search: "",
          onSearchChange: () => {},
          loading,
        }}
        pageSize={PAGE_SIZE}
        empty={
          <EmptyState
            icon={<IconLayers size={20} />}
            title={activeFilters ? "No job matches those filters" : "No jobs in the window"}
            body={
              activeFilters
                ? "Loosen one of them, or clear them all to see everything the monitor is holding."
                : "Nothing has run recently — or the monitor was restarted, which empties the history it keeps in memory."
            }
            action={
              activeFilters
                ? <Button variant="secondary" size="sm" onClick={onClear}>Clear filters</Button>
                : undefined
            }
          />
        }
      />
    </Card>
  );
}

/* ---- workers --------------------------------------------------------------- */

function WorkersTab({ workers, loading }: { workers: api.JobWorker[]; loading: boolean }) {
  if (loading && !workers.length) {
    return (
      <Card><CardBody><div className="flex justify-center py-10"><Spinner /></div></CardBody></Card>
    );
  }

  if (!workers.length) {
    return (
      <Card>
        <EmptyState
          icon={<IconMonitor size={20} />}
          title="No worker is reporting"
          body="Celery workers announce themselves to the monitor by heartbeat. None has, which means either none is running or none can reach the broker — and in both cases queued work is waiting rather than being lost."
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {workers.map((worker) => (
        <Card key={worker.name}>
          <CardHeader
            icon={<IconMonitor size={16} />}
            title={<span className="font-mono">{worker.name}</span>}
            subtitle={
              worker.queues.length
                ? `listening on ${worker.queues.join(", ")}`
                : "no queue reported"
            }
            actions={
              <Badge tone={worker.online ? "ok" : "critical"} size="sm" dot pulse={worker.online}>
                {worker.online ? "Online" : "Offline"}
              </Badge>
            }
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
              <KV label="Running" value={worker.active} mono />
              <KV label="Processed" value={worker.processed} mono />
              <KV
                label="Failed"
                mono
                value={
                  <span className={worker.failed ? "text-critical-text" : undefined}>
                    {worker.failed}
                  </span>
                }
              />
              <KV label="Retried" value={worker.retried} mono />
              <KV label="Concurrency" value={worker.concurrency ?? "—"} mono />
              <KV
                label="Load"
                mono
                value={
                  worker.load_average.length
                    ? worker.load_average.map((n) => n.toFixed(2)).join(" · ")
                    : "—"
                }
              />
              <KV label="Succeeded" value={worker.succeeded} mono className="sm:col-span-2" />
            </dl>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

/* ---- Flower's own interface ------------------------------------------------ */

/**
 * Open Flower, having first asked for the cookie that lets a browser load it.
 *
 * Flower's port is not published anywhere. The only route to it is through the
 * API, and the API wants proof on every request — including the stylesheet and
 * the scripts, which cannot carry an `Authorization` header. So: mint the
 * cookie, then point at the path the API hands back.
 */
function useFlower() {
  const { notify } = useApp();
  const [url, setUrl] = React.useState<string | null>(null);
  const [opening, setOpening] = React.useState(false);

  const openSession = React.useCallback(async () => {
    setOpening(true);
    try {
      const session = await api.openFlowerSession();
      setUrl(session.url);
      return session.url;
    } catch (error) {
      notify({
        tone: "critical",
        title: "Could not open Flower",
        body: error instanceof Error ? error.message : "Try again.",
      });
      return null;
    } finally {
      setOpening(false);
    }
  }, [notify]);

  return { url, opening, openSession };
}

function OpenFlowerButton() {
  const { opening, openSession } = useFlower();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={opening}
      onClick={async () => {
        const url = await openSession();
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
    >
      <IconExternal size={15} /> {opening ? "Opening…" : "Open Flower"}
    </Button>
  );
}

function FlowerTab() {
  const { url, opening, openSession } = useFlower();

  React.useEffect(() => { void openSession(); }, [openSession]);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<IconExternal size={16} />}
        title="Flower"
        hint="Flower's own interface, relayed through this API. Its port is not published: every request for it — this frame, its stylesheet, each of its polls — is checked against your console session first."
        subtitle="For the questions this page does not answer"
        actions={
          url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              <IconExternal size={14} /> New tab
            </Button>
          )
        }
      />
      {url ? (
        <iframe
          src={url}
          title="Flower"
          className="h-[calc(100dvh-22rem)] min-h-[32rem] w-full border-t border-line bg-surface"
        />
      ) : (
        <div className="flex items-center justify-center gap-2 border-t border-line py-16 text-label text-ink-3">
          {opening ? <><Spinner size={15} /> Opening Flower…</> : "Flower could not be opened."}
        </div>
      )}
    </Card>
  );
}

/* ---- one job --------------------------------------------------------------- */

function JobDrawer({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { data: job, isPending, isError } = usePlatformJob(taskId);

  return (
    <Drawer
      open={!!taskId}
      onClose={onClose}
      title="Job"
      subtitle={job ? job.name : undefined}
      width="lg"
    >
      {isPending && (
        <div className="flex justify-center py-12"><Spinner /></div>
      )}

      {isError && (
        <EmptyState
          icon={<IconAlert size={20} />}
          title="That job is no longer in the monitor's history"
          body="Flower holds a bounded window in memory and drops the oldest as new work arrives. A restart empties it entirely."
        />
      )}

      {job && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={JOB_TONE[job.status]} dot pulse={job.running}>
              {JOB_LABEL[job.status]}
            </Badge>
            <span className="font-mono text-caption text-ink-3">{job.state}</span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            <KV label="Job id" value={job.id} mono className="col-span-2 sm:col-span-3" />
            <KV label="Worker" value={job.worker ?? "unassigned"} mono />
            <KV label="Queue" value={job.queue ?? "—"} mono />
            <KV label="Retries" value={job.retries} mono />
            <KV label="Received" value={momentOf(job.received_at)} mono />
            <KV label="Started" value={momentOf(job.started_at)} mono />
            <KV label="Finished" value={momentOf(job.finished_at)} mono />
            <KV
              label="Duration"
              mono
              value={`${durationOf(job.runtime_seconds)}${job.running ? " so far" : ""}`}
            />
            {job.eta && <KV label="Scheduled for" value={momentOf(job.eta)} mono />}
          </dl>

          <Block label="Arguments" value={[job.args, job.kwargs].filter(Boolean).join("\n")} />
          {job.result && <Block label="Result" value={job.result} />}
          {job.exception && <Block label="Error" value={job.exception} tone="critical" />}
          {job.traceback && <Block label="Traceback" value={job.traceback} tone="critical" />}
        </div>
      )}
    </Drawer>
  );
}

function Block({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "critical";
}) {
  if (!value.trim()) return null;
  return (
    <div>
      <p className="mb-1.5 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">
        {label}
      </p>
      <pre
        className={cn(
          "max-h-72 overflow-auto rounded-[var(--r)] border border-line bg-surface-inset px-3 py-2.5",
          "whitespace-pre-wrap break-words font-mono text-micro leading-relaxed",
          tone === "critical" ? "text-critical-text" : "text-ink-2",
        )}
      >
        {value}
      </pre>
    </div>
  );
}
