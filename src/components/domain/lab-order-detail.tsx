"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useLabAttachments, useLabOrder, useUsers } from "@/lib/query/hooks";
import * as api from "@/lib/api";
import type { LabAttachment, LabOrder, LabResultLine } from "@/lib/types";
import { Legend } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { EmptyState, KV } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/loader";
import { Input, Select } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LabFlag, StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { CounterPayment } from "@/components/domain/counter-payment";
import { labActions } from "@/lib/lab-actions";
import {
  IconCard, IconDownload, IconFlask, IconPlay, IconPlus, IconShield, IconTrash,
} from "@/components/ui/icons";

/** A few sensible analyte skeletons so result entry is not a blank sheet. */
const TEMPLATES: Record<string, LabResultLine[]> = {
  FBC: [
    { analyte: "Haemoglobin", value: "", unit: "g/dL", reference: "13.0–17.0", flag: "normal" },
    { analyte: "White cell count", value: "", unit: "10⁹/L", reference: "4.0–11.0", flag: "normal" },
    { analyte: "Platelets", value: "", unit: "10⁹/L", reference: "150–400", flag: "normal" },
  ],
  HBA1C: [{ analyte: "HbA1c", value: "", unit: "mmol/mol", reference: "20–41", flag: "normal" }],
  CRP: [{ analyte: "C-reactive protein", value: "", unit: "mg/L", reference: "< 5", flag: "normal" }],
};

const blankLine = (): LabResultLine => ({ analyte: "", value: "", unit: "", reference: "", flag: "normal" });

/**
 * One lab order, opened from the bench. Read by id, so it stays in step as the
 * order moves through its states — including off the tab it was opened from,
 * which is what verifying one from Open does.
 */
export function LabOrderModal({ order: opened, onClose }: { order: LabOrder | null; onClose: () => void }) {
  /* The order last opened is kept after it closes, so the dialog is still
     there to animate away; a new opening is a new dialog, seeded afresh. */
  const last = React.useRef<LabOrder | null>(null);
  const session = React.useRef(0);
  const wasOpen = React.useRef(false);
  if (opened && !wasOpen.current) session.current += 1;
  wasOpen.current = !!opened;
  if (opened) last.current = opened;
  const shown = opened ?? last.current;

  /* the row it was opened from stands in until the read lands, so the dialog
     is whole from its first frame */
  const { data: fresh, isPending } = useLabOrder(shown?.id ?? "");
  const order = fresh ?? shown;
  if (!shown) return null;
  if (!order) {
    return (
      <Modal open={!!opened} onClose={onClose} width="xl" title="Lab order">
        {isPending ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <EmptyState icon={<IconFlask size={22} />} title="No such lab order"
                      body="This order doesn’t exist, or it has been removed." />
        )}
      </Modal>
    );
  }
  /* keyed, so the result entry is seeded afresh for each opening */
  return <LabOrderDialog key={session.current} open={!!opened} order={order} onClose={onClose} />;
}

function LabOrderDialog({ open, order, onClose }: { open: boolean; order: LabOrder; onClose: () => void }) {
  const { startLabOrder, saveLabResults, verifyLabOrder, can, notify } = useApp();

  /* This person is allowed to take the money, or the button is an apology
     waiting to happen. */
  const billsHere = can("billing:write");
  /* The lab bills on its own invoices, so it can take its own money — a
     patient collecting a report pays for the scan, not for their medicine. */
  const [collecting, setCollecting] = React.useState(false);
  const { data: users = [] } = useUsers();
  const nameOf = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? "—";

  const [results, setResults] = React.useState<LabResultLine[]>(
    order.results.length ? order.results : TEMPLATES[order.test_code] ?? [blankLine()],
  );

  const patch = (i: number, p: Partial<LabResultLine>) =>
    setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  /* Only what the API would let this person do is offered: accepting a sample
     and entering results ask for lab:result, release for lab:verify. A doctor
     reads the bench (lab:read) without working it. */
  const actions = labActions(order.status, can);
  const editable = actions.enterResults;

  /* The success line is said once the server has agreed. A refusal is already
     explained by the store's own toast, so it is not caught into another. */
  const confirm = (work: Promise<unknown>, title: string, body: string) =>
    work.then(() => notify({ tone: "ok", title, body }), () => undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      title={order.test_name}
      subtitle={`${order.patient_name} · ${order.patient_mrn}`}
      footer={
        <>
          {billsHere && (
            <Button variant="ghost" onClick={() => setCollecting(true)}>
              <IconCard size={14} /> Collect payment
            </Button>
          )}
          {actions.accept && (
            <Button variant="primary" onClick={() => {
              void confirm(startLabOrder(order.id), "Sample accepted", "The order is now with the lab.");
            }}>
              <IconPlay size={14} /> Accept sample
            </Button>
          )}
          {editable && (
            <Button
              variant="secondary"
              onClick={() => {
                void confirm(
                  saveLabResults(order.id, results.filter((r) => r.analyte.trim())),
                  "Results saved", "Still held back until a technician verifies them.",
                );
              }}
            >
              Save results
            </Button>
          )}
          {actions.verify && (
            <Button variant="primary" onClick={() => {
              void confirm(
                verifyLabOrder(order.id),
                "Verified and released", "The result is now visible on the patient record.",
              );
            }}>
              <IconShield size={14} /> Verify and release
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PatientRef id={order.patient_id} name={order.patient_name} mrn={order.patient_mrn} />
          <div className="flex items-center gap-2">
            <span className="tnum font-mono text-caption text-ink-3">{order.test_code} · {order.panel}</span>
            <StatusPill kind="lab" status={order.status} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <KV label="Ordered" value={order.ordered_at} mono />
          <KV label="Requested by" value={nameOf(order.ordered_by)} />
          {order.resulted_at && <KV label="Resulted" value={order.resulted_at} mono />}
          {order.verified_at && <KV label="Verified" value={`${order.verified_at} · ${nameOf(order.verified_by)}`} />}
        </dl>

        {order.note && (
          <div className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Clinical question</p>
            <p className="mt-1 text-body leading-relaxed text-ink">{order.note}</p>
          </div>
        )}

        <div>
          <Legend>Results</Legend>

          {order.status === "ordered" && (
            <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-6 text-center text-label text-ink-3">
              {actions.accept
                ? "Accept the sample before entering results."
                : "Waiting for the lab to accept the sample."}
            </p>
          )}

          {(order.status === "pending" || order.status === "resulted") && !editable && (
            <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-6 text-center text-label text-ink-3">
              With the lab. Results appear here once a technician has verified them.
            </p>
          )}

          {order.status === "verified" && (
            <TableWrap>
              <Table>
                <THead>
                  <tr><TH>Analyte</TH><TH>Value</TH><TH>Reference</TH><TH align="right">Flag</TH></tr>
                </THead>
                <TBody>
                  {order.results.map((r) => (
                    <TR key={r.analyte}>
                      <TD>{r.analyte}</TD>
                      <TD className="tnum font-mono">{r.value} {r.unit}</TD>
                      <TD className="text-ink-3">{r.reference}</TD>
                      <TD align="right">
                        <LabFlag flag={r.flag} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}

          {editable && (
            <div className="space-y-2.5">
              {results.map((r, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-[var(--r)] border border-line bg-surface-2 p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_minmax(0,1fr)_7rem_auto]">
                  <Input placeholder="Analyte" value={r.analyte} onChange={(e) => patch(i, { analyte: e.target.value })} />
                  <Input placeholder="Value" value={r.value} onChange={(e) => patch(i, { value: e.target.value })} />
                  <Input placeholder="Unit" value={r.unit} onChange={(e) => patch(i, { unit: e.target.value })} />
                  <Input placeholder="Reference" value={r.reference} onChange={(e) => patch(i, { reference: e.target.value })} />
                  <Select value={r.flag} onChange={(e) => patch(i, { flag: e.target.value as LabResultLine["flag"] })}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                  </Select>
                  <Button variant="ghost" size="icon" aria-label="Remove row"
                          onClick={() => setResults((p) => p.filter((_, idx) => idx !== i))}>
                    <IconTrash size={14} />
                  </Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setResults((p) => [...p, blankLine()])}>
                <IconPlus size={14} /> Add analyte
              </Button>
            </div>
          )}
        </div>

        <Attachments order={order} />

        <p className="flex items-start gap-2 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-caption leading-relaxed text-ink-2">
          <IconShield size={14} className="mt-px shrink-0 text-ink-3" />
          A result reaches the patient&apos;s record only once it has been verified.
        </p>
      </div>

      <CounterPayment
        open={collecting}
        onClose={() => setCollecting(false)}
        patientId={order.patient_id}
        department="lab"
      />
    </Modal>
  );
}

/** Bytes, in the unit a person would say them in. */
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,.csv,.txt";

/**
 * The paperwork half of a lab order (§3.10).
 *
 * A scan, a machine printout, a signed report — the same clinical record as the
 * typed analytes, so it is filed against the order and released with it. A
 * verified order takes no more paper: verification is what put the result in
 * front of a clinician, and changing it afterwards would do so unsigned.
 */
function Attachments({ order }: { order: LabOrder }) {
  const { uploadLabAttachment, removeLabAttachment, notify, can } = useApp();
  const { data: files = [], isPending } = useLabAttachments(order.id);
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  /* verified orders take no more paper; and filing it is bench work (lab:result) */
  const locked = !labActions(order.status, can).attach;

  const send = async (chosen: FileList | null) => {
    const file = chosen?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await uploadLabAttachment(order.id, file);
      notify({ tone: "ok", title: "Report attached", body: file.name });
    } catch (e) {
      /* the API refuses by name — an unsupported kind, or one that is too big */
      notify({
        tone: "critical",
        title: "That file was not attached",
        body: e instanceof Error ? e.message : "That did not go through.",
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const open = async (file: LabAttachment) => {
    try {
      /* The route needs the session, so the file is fetched rather than linked
         to, then handed to the browser as a blob it already holds. */
      const blob = await api.getLabAttachmentFile(order.id, file.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      notify({ tone: "critical", title: "That file could not be opened" });
    }
  };

  return (
    <div>
      <Legend>Reports and scans</Legend>
      {files.length === 0 && !isPending && (
        <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-5 text-center text-label text-ink-3">
          {locked
            ? "Nothing was filed against this order."
            : "No file yet — attach the scan, the printout or the signed report."}
        </p>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-line px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-label font-medium text-ink">{file.filename}</p>
                <p className="text-caption text-ink-3">
                  {fileSize(file.size_bytes)} · {file.uploaded_at}
                  {file.note ? ` · ${file.note}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Open ${file.filename}`}
                        onClick={() => void open(file)}>
                  <IconDownload size={14} />
                </Button>
                {!locked && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${file.filename}`}
                          onClick={() => {
                            /* said once it is gone; a refusal is the store's toast */
                            removeLabAttachment(order.id, file.id).then(
                              () => notify({ tone: "ok", title: "File removed", body: file.filename }),
                              () => undefined,
                            );
                          }}>
                    <IconTrash size={14} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <div className="mt-3">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => void send(e.target.files)}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <IconPlus size={14} /> {busy ? "Uploading…" : "Upload a report"}
          </Button>
          <p className="mt-1.5 text-caption text-ink-3">
            PDF, image, CSV or plain text, up to 15 MB. Files are released with the order when it is
            verified, and cannot be changed afterwards.
          </p>
        </div>
      )}
    </div>
  );
}
