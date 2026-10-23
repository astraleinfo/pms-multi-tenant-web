"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { qk } from "@/lib/query/keys";
import { useTenant } from "@/lib/query/hooks";
import { downloadBlob } from "@/lib/pdf";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  IconAlert, IconDownload, IconExport, IconImport, IconRefresh, IconSheet,
} from "@/components/ui/icons";

/* ==========================================================================
   A list in and out of a spreadsheet — stock lines, staff, whatever comes
   next. One component, handed a `SheetSource` that says which.

   The import runs in the background. Choosing a file and pressing Import
   uploads it and hands it to the worker; the worker checks every row, writes
   them all or none, and deletes the file whichever way it went. The button
   owns the job, not the dialog, so closing the dialog does not lose it — the
   outcome arrives as a toast, and a failure's rows are there when the dialog
   is opened again.

   Nothing re-sends a job on its own. One whose hand-off to the worker was lost
   stays queued; the server marks it `retryable` after a short wait, and the
   dialog offers Retry in place of the spinner.

   The export is in the import's own layout, so an export is also a sample of
   what the clinic already has.
   ========================================================================== */

/** What one kind of sheet is: its routes, its words, and what "done" says. */
export interface SheetSource {
  /** "stock", "staff" — for file names and messages */
  noun: string;
  /** the dialog's title */
  title: string;
  subtitle: string;
  /** the column header for what a row is: "Item", "Person" */
  itemLabel: string;
  /** the picker's icon */
  icon: React.ReactNode;
  template: () => Promise<Blob>;
  exportSheet: () => Promise<Blob>;
  start: (file: File) => Promise<api.ImportJob>;
  get: (id: string) => Promise<api.ImportJob>;
  latest: () => Promise<api.ImportJob | null>;
  /** hand a stuck job to the worker again */
  retry: (id: string) => Promise<api.ImportJob>;
  /** the success toast, from a finished job's report */
  summary: (report: api.ImportJobReport) => { title: string; body?: string };
}

const POLL_MS = 1500;

const errorText = (error: unknown) => (error instanceof Error ? error.message : "That did not go through.");

type Size = "sm" | "md";

export function SheetExportButton({ source, size = "md" }: { source: SheetSource; size?: Size }) {
  const { today, notify } = useApp();
  const { tenant } = useTenant();
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    setBusy(true);
    try {
      downloadBlob(await source.exportSheet(), `${tenant.slug}-${source.noun}-${today}.xlsx`);
    } catch (error) {
      notify({ tone: "warn", title: `Could not export the ${source.noun} list`, body: errorText(error) });
    }
    setBusy(false);
  };

  return (
    <Button variant="secondary" size={size} onClick={() => { void run(); }} disabled={busy}>
      <IconExport size={size === "sm" ? 14 : 15} /> {busy ? "Exporting…" : "Export"}
    </Button>
  );
}

const running = (job: api.ImportJob | null) => job?.status === "queued" || job?.status === "running";

export function SheetImportButton({ source, size = "md" }: { source: SheetSource; size?: Size }) {
  const { session, notify } = useApp();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  /* each opening is a fresh dialog; the one closing stays long enough to leave */
  const [opening, setOpening] = React.useState(0);
  const [job, setJob] = React.useState<api.ImportJob | null>(null);
  /* read by the poll, which should not restart each time the dialog opens */
  const openRef = React.useRef(open);
  React.useEffect(() => { openRef.current = open; }, [open]);
  const sourceRef = React.useRef(source);
  sourceRef.current = source;

  /* A page opened while an import is still going picks it up. */
  React.useEffect(() => {
    let live = true;
    sourceRef.current.latest().then((latest) => { if (live && running(latest)) setJob(latest); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const finished = React.useCallback((done: api.ImportJob) => {
    if (done.status === "done" && done.report) {
      void queryClient.invalidateQueries({ queryKey: qk.tenant(session.tenantId) });
      notify({ tone: "ok", ...sourceRef.current.summary(done.report) });
      setJob(null);
      setOpen(false);
    } else if (done.status === "failed" && !openRef.current) {
      notify({ tone: "warn", title: "Import failed", body: "Open Import to see what to fix." });
    }
  }, [notify, queryClient, session.tenantId]);

  const id = job?.id;
  const active = running(job);
  React.useEffect(() => {
    if (!id || !active) return;
    const t = setInterval(async () => {
      try {
        const next = await sourceRef.current.get(id);
        setJob(next);
        if (!running(next)) finished(next);
      } catch { /* a missed poll is retried on the next tick */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [id, active, finished]);

  const iconSize = size === "sm" ? 14 : 15;
  return (
    <>
      <Button variant="secondary" size={size} onClick={() => { setOpening((n) => n + 1); setOpen(true); }}>
        {active ? <Spinner size={iconSize} /> : <IconImport size={iconSize} />} {active ? "Importing…" : "Import"}
      </Button>
      <ImportDialog key={opening} source={source} open={open} job={job} onStarted={setJob} onClose={() => setOpen(false)} />
    </>
  );
}

function ImportDialog({ source, open, job, onStarted, onClose }: {
  source: SheetSource;
  open: boolean;
  job: api.ImportJob | null;
  onStarted: (job: api.ImportJob) => void;
  onClose: () => void;
}) {
  const { notify } = useApp();
  const { tenant } = useTenant();
  const [file, setFile] = React.useState<File | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"template" | "upload" | "retry" | null>(null);
  const active = running(job);
  const failed = job?.status === "failed" ? job : null;
  const stuck = active && job!.retryable;

  const template = async () => {
    setBusy("template");
    try {
      downloadBlob(await source.template(), `${tenant.slug}-${source.noun}-import.xlsx`);
    } catch (error) {
      notify({ tone: "warn", title: "Could not download the sample sheet", body: errorText(error) });
    }
    setBusy(null);
  };

  const start = async () => {
    if (!file) return;
    setBusy("upload");
    setProblem(null);
    try {
      onStarted(await source.start(file));
      setFile(null);
    } catch (error) {
      /* only what is plainly not the sheet is refused here — empty, too big, the wrong columns */
      setProblem(errorText(error));
    }
    setBusy(null);
  };

  const retry = async () => {
    if (!job) return;
    setBusy("retry");
    try {
      onStarted(await source.retry(job.id));
    } catch (error) {
      notify({ tone: "warn", title: "Could not retry the import", body: errorText(error) });
    }
    setBusy(null);
  };

  const message = problem ?? failed?.error;

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      width="lg"
      title={source.title}
      subtitle={source.subtitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>{active ? "Close" : "Cancel"}</Button>
          <Button variant="primary" onClick={() => { void start(); }} disabled={!file || !!busy || active}>
            <IconImport size={15} /> {busy === "upload" ? "Uploading…" : "Import"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* the first step, and the one people miss: the sheet is what makes
            the rest go through on the first try */}
        <div className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-accent-border bg-accent-soft p-4 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-[var(--r)] bg-surface text-accent-text">
            <IconSheet size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-label font-semibold text-ink">Start with the sample sheet</p>
            <p className="mt-0.5 text-caption text-ink-2">All columns, with examples.</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => { void template(); }} disabled={!!busy} className="shrink-0">
            <IconDownload size={14} /> {busy === "template" ? "Preparing…" : "Download sample"}
          </Button>
        </div>

        {stuck ? (
          <div className="flex flex-col gap-3 rounded-[var(--r-lg)] border border-warn-border bg-warn-soft px-4 py-4 sm:flex-row sm:items-center">
            <IconAlert size={18} className="shrink-0 text-warn-text" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-ink">{job!.filename} hasn&apos;t started</p>
              <p className="text-caption text-ink-2">It is taking longer than expected. Nothing has been imported yet.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { void retry(); }} disabled={!!busy} className="shrink-0">
              <IconRefresh size={14} /> {busy === "retry" ? "Retrying…" : "Retry"}
            </Button>
          </div>
        ) : active ? (
          <div className="flex items-center gap-3 rounded-[var(--r-lg)] border border-line bg-surface-2 px-4 py-5">
            <Spinner size={18} />
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-ink">Importing {job!.filename}</p>
              <p className="text-caption text-ink-3">You can close this — you&apos;ll be told when it&apos;s done.</p>
            </div>
          </div>
        ) : (
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed px-4 py-6 text-center transition-colors",
              file ? "border-accent bg-accent-soft/40" : "border-line-strong bg-surface-2 hover:border-accent",
            )}
          >
            <span className="text-ink-3">{source.icon}</span>
            <span className="text-body font-medium text-ink">{file ? file.name : "Choose a file"}</span>
            <span className="text-caption text-ink-3">.xlsx or .csv, up to 5 MB</span>
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProblem(null); e.target.value = ""; }}
            />
          </label>
        )}

        {!active && message && (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-2.5 text-label text-critical-text">
            <IconAlert size={15} className="mt-px shrink-0" />
            <span>
              {!problem && failed && <span className="font-medium">{failed.filename}: </span>}
              {message}
            </span>
          </p>
        )}

        {!active && !problem && failed?.report && failed.report.rows.length > 0 && (
          <FailedRows rows={failed.report.rows} itemLabel={source.itemLabel} />
        )}
      </div>
    </Modal>
  );
}

type ReportRow = api.ImportJobReport["rows"][number];

/** A failed import's rows: duplicates first and on their own, because the fix
    is different — use what is already there, or drop the repeat — then the rest. */
function FailedRows({ rows, itemLabel }: { rows: ReportRow[]; itemLabel: string }) {
  const dupes = rows.filter((r) => r.duplicate_of);
  const others = rows.filter((r) => !r.duplicate_of);
  return (
    <div className="space-y-4">
      {dupes.length > 0 && (
        <RowGroup
          title="Duplicates"
          badge={<Badge tone="warn" size="sm">{dupes.length}</Badge>}
          rows={dupes}
          itemLabel={itemLabel}
          same
        />
      )}
      {others.length > 0 && (
        <RowGroup
          title="To fix"
          badge={<Badge tone="critical" size="sm">{others.length}</Badge>}
          rows={others}
          itemLabel={itemLabel}
        />
      )}
    </div>
  );
}

function RowGroup({ title, badge, rows, itemLabel, same }: {
  title: string;
  badge: React.ReactNode;
  rows: ReportRow[];
  itemLabel: string;
  /** show which row, code or account each one repeats */
  same?: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-label font-semibold text-ink">{title} {badge}</h3>
      <TableWrap maxHeight="14rem">
        <Table>
          <THead sticky>
            <TR>
              <TH>Row</TH>
              <TH>{itemLabel}</TH>
              {same && <TH>Same as</TH>}
              <TH>{same ? "Why" : "Fix"}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.row}>
                <TD><span className="tnum font-mono text-caption text-ink-3">{row.row}</span></TD>
                <TD><span className="text-label text-ink">{row.label}</span></TD>
                {same && (
                  <TD>
                    <span className="whitespace-nowrap font-mono text-caption font-medium text-warn-text">
                      {row.duplicate_of}
                    </span>
                  </TD>
                )}
                <TD>
                  <ul className={cn("space-y-0.5 text-caption", same ? "text-ink-2" : "text-critical-text")}>
                    {row.errors.map((e) => <li key={e}>{e.replace(/^Duplicate: /, "")}</li>)}
                  </ul>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </section>
  );
}
