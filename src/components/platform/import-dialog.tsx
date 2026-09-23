"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { qk } from "@/lib/query/keys";
import { downloadBlob } from "@/lib/pdf";
import { cn } from "@/lib/cn";
import type { Tenant } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button, Segmented } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IconAlert, IconCheck, IconDownload, IconUpload, IconUsers } from "@/components/ui/icons";

/* ==========================================================================
   Onboard a clinic from a spreadsheet.

   Three steps, in the order a person does them: take the sample sheet (built
   for this clinic, custom fields and all), fill it in, bring it back. The
   upload is checked before anything is written, every bad row says why, and
   the import button only lights once there is nothing left to fix — the
   server holds the same line and imports all of it or none of it.
   ========================================================================== */

const KIND_LABEL: Record<api.ImportKind, string> = { users: "Staff", patients: "Patients" };

export function ImportButton({ tenant }: { tenant: Tenant }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <IconUpload size={15} /> Import from Excel
      </Button>
      {open && <ImportDialog tenant={tenant} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportDialog({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const { notify } = useApp();
  const queryClient = useQueryClient();
  const [kind, setKind] = React.useState<api.ImportKind>("users");
  const [file, setFile] = React.useState<File | null>(null);
  const [report, setReport] = React.useState<api.ImportReport | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"template" | "check" | "import" | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  /* A different kind or a different file makes the last check meaningless. */
  const reset = () => { setReport(null); setProblem(null); };

  const template = async () => {
    setBusy("template");
    try {
      const blob = await api.importTemplate(tenant.id, kind);
      downloadBlob(blob, `${tenant.slug}-${kind === "users" ? "staff" : "patients"}-import.xlsx`);
    } catch (error) {
      notify({ tone: "warn", title: "Could not download the sample sheet", body: error instanceof Error ? error.message : undefined });
    }
    setBusy(null);
  };

  const send = async (commit: boolean) => {
    if (!file) return;
    setBusy(commit ? "import" : "check");
    setProblem(null);
    try {
      const result = await api.runImport(tenant.id, kind, file, commit);
      setReport(result);
      if (result.committed) {
        void queryClient.invalidateQueries({ queryKey: qk.platformRoot() });
        notify({
          tone: "ok",
          title: `${result.created} ${kind === "users" ? "staff accounts" : "patients"} imported into ${tenant.name}`,
          body: kind === "users"
            ? `${result.invited} of ${result.created} invitations sent. Anyone missed can be re-sent from the Staff tab.`
            : "They are in the clinic's register now, with record numbers of their own.",
        });
        onClose();
      }
    } catch (error) {
      /* A sheet the server could not read at all — wrong type, missing
         columns, too many rows — is one message, not a table. */
      setReport(null);
      setProblem(error instanceof ApiError || error instanceof Error ? error.message : "That did not go through.");
    }
    setBusy(null);
  };

  const ready = !!report && report.invalid === 0 && report.valid > 0;

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      width="lg"
      title={`Import into ${tenant.name}`}
      subtitle="From the sample sheet, filled in. Checked first; imported all at once or not at all."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>Cancel</Button>
          <Button variant="secondary" onClick={() => { void send(false); }} disabled={!file || !!busy}>
            {busy === "check" ? "Checking…" : report ? "Check again" : "Check the file"}
          </Button>
          <Button variant="primary" onClick={() => { void send(true); }} disabled={!ready || !!busy}>
            <IconCheck size={15} />
            {busy === "import" ? "Importing…" : ready ? `Import ${report!.valid} ${report!.valid === 1 ? "row" : "rows"}` : "Import"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={kind}
            onChange={(next) => { setKind(next); setFile(null); reset(); if (input.current) input.current.value = ""; }}
            options={[{ value: "users", label: "Staff" }, { value: "patients", label: "Patients" }]}
          />
          <Button variant="ghost" size="sm" onClick={() => { void template(); }} disabled={!!busy}>
            <IconDownload size={14} /> {busy === "template" ? "Preparing…" : `Download the ${KIND_LABEL[kind].toLowerCase()} sample sheet`}
          </Button>
        </div>

        <p className="text-label leading-relaxed text-ink-2">
          {kind === "users"
            ? "One person per row: name, email and role. Each is emailed an invitation to choose their own password — nobody's password goes in the sheet."
            : "One patient per row. The sheet carries this clinic's own patient fields as well, and each row is checked the way the registration form checks it."}
        </p>

        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed px-4 py-6 text-center transition-colors",
            file ? "border-accent bg-accent-soft/40" : "border-line-strong bg-surface-2 hover:border-accent",
          )}
        >
          <IconUsers size={20} className="text-ink-3" />
          <span className="text-body font-medium text-ink">{file ? file.name : "Choose the filled-in sheet"}</span>
          <span className="text-caption text-ink-3">.xlsx or .csv, up to 5 MB</span>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }}
          />
        </label>

        {problem && (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-2.5 text-label text-critical-text">
            <IconAlert size={15} className="mt-px shrink-0" /> {problem}
          </p>
        )}

        {report && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ok" size="sm">{report.valid} ready</Badge>
              {report.invalid > 0 && <Badge tone="critical" size="sm" dot>{report.invalid} to fix</Badge>}
              <span className="text-caption text-ink-3">
                {report.invalid
                  ? "Fix these rows in the sheet and check it again — nothing is imported until every row passes."
                  : "Every row passed. Nothing has been written yet."}
              </span>
            </div>
            <TableWrap maxHeight="18rem">
              <Table>
                <THead sticky>
                  <TR>
                    <TH>Row</TH>
                    <TH>{kind === "users" ? "Person" : "Patient"}</TH>
                    <TH>Check</TH>
                  </TR>
                </THead>
                <TBody>
                  {[...report.rows].sort((a, b) => Number(a.ok) - Number(b.ok) || a.row - b.row).map((row) => (
                    <TR key={row.row}>
                      <TD><span className="tnum font-mono text-caption text-ink-3">{row.row}</span></TD>
                      <TD><span className="text-label text-ink">{row.label}</span></TD>
                      <TD>
                        {row.ok ? (
                          <span className="inline-flex items-center gap-1 text-caption text-ok-text"><IconCheck size={12} /> Ready</span>
                        ) : (
                          <ul className="space-y-0.5 text-caption text-critical-text">
                            {row.errors.map((e) => <li key={e}>{e}</li>)}
                          </ul>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </div>
        )}
      </div>
    </Modal>
  );
}
