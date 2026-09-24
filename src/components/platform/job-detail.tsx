"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { usePlatformJob } from "@/lib/query/hooks";
import { JOB_LABEL, JOB_TONE, durationOf, momentOf, shortTaskName } from "@/lib/platform/jobs";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/loader";
import { IconAlert } from "@/components/ui/icons";

/** One background job, as the monitor remembers it. */
export function JobDetailModal({ job: opened, onClose }: { job: api.Job | null; onClose: () => void }) {
  /* the row stands in until the monitor answers, so the dialog opens whole */
  const { data: fresh, isPending } = usePlatformJob(opened?.id ?? null);
  const job = fresh ?? opened;

  return (
    <Modal
      open={!!opened}
      onClose={onClose}
      width="xl"
      title={job ? shortTaskName(job.name) : "Job"}
      subtitle={job ? <span className="font-mono">{job.name}</span> : undefined}
    >
      {!job && isPending ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !job ? (
        <EmptyState
          icon={<IconAlert size={22} />}
          title="That job is no longer in the monitor's history"
          body="Flower holds a bounded window in memory and drops the oldest as new work arrives. A restart empties it entirely."
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={JOB_TONE[job.status]} dot pulse={job.running}>
              {JOB_LABEL[job.status]}
            </Badge>
            <span className="font-mono text-caption text-ink-3">{job.state}</span>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <KV label="Job id" value={job.id} mono className="col-span-2 sm:col-span-4" />
            <KV label="Worker" value={job.worker ?? "unassigned"} mono />
            <KV label="Queue" value={job.queue ?? "—"} mono />
            <KV label="Retries" value={job.retries} mono />
            <KV
              label="Duration"
              mono
              value={`${durationOf(job.runtime_seconds)}${job.running ? " so far" : ""}`}
            />
            <KV label="Received" value={momentOf(job.received_at)} mono />
            <KV label="Started" value={momentOf(job.started_at)} mono />
            <KV label="Finished" value={momentOf(job.finished_at)} mono />
            {job.eta && <KV label="Scheduled for" value={momentOf(job.eta)} mono />}
          </dl>

          <Block label="Arguments" value={[job.args, job.kwargs].filter(Boolean).join("\n")} />
          {job.result && <Block label="Result" value={job.result} />}
          {job.exception && <Block label="Error" value={job.exception} tone="critical" />}
          {job.traceback && <Block label="Traceback" value={job.traceback} tone="critical" />}
        </div>
      )}
    </Modal>
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
