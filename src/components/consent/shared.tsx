"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/loader";
import { Callout } from "@/components/ui/callout";
import { IconDownload, IconPrint } from "@/components/ui/icons";
import { downloadBlob, openPdfBlob } from "@/lib/pdf";
import { CONSENT_LOOK, VERSION_LOOK, type ConsentStatus, type VersionStatus } from "@/lib/consent";

/* ==========================================================================
   Pieces every consent screen shares: how a status looks, the document
   preview, and the pad a signature is drawn on.
   ========================================================================== */

export function VersionBadge({ status, number }: { status: VersionStatus; number?: number }) {
  const look = VERSION_LOOK[status];
  return (
    <Badge tone={look.tone} size="sm" dot>
      {number !== undefined ? `v${number} · ` : ""}{look.label}
    </Badge>
  );
}

export function ConsentBadge({ status }: { status: ConsentStatus }) {
  const look = CONSENT_LOOK[status];
  return <Badge tone={look.tone} size="sm" dot>{look.label}</Badge>;
}

type PdfState =
  | { kind: "loading" }
  | { kind: "ready"; blob: Blob; url: string }
  | { kind: "failed"; message: string };

/** Fetches a PDF while `active`, again whenever `version` changes, and frees it after. */
function usePdf(load: () => Promise<Blob>, active: boolean, version: unknown): [PdfState, () => void] {
  const [state, setState] = React.useState<PdfState>({ kind: "loading" });
  const [attempt, setAttempt] = React.useState(0);
  const loader = React.useRef(load);
  loader.current = load;

  React.useEffect(() => {
    if (!active) return;
    let url: string | null = null;
    let live = true;
    setState({ kind: "loading" });
    loader.current().then(
      (blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setState({ kind: "ready", blob, url });
      },
      (e: unknown) => {
        if (live) setState({ kind: "failed", message: e instanceof Error ? e.message : "The document could not be made." });
      },
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [active, version, attempt]);

  return [state, () => setAttempt((n) => n + 1)];
}

function Frame({ state, title, height, retry }: { state: PdfState; title: string; height: string; retry: () => void }) {
  return (
    <div className="overflow-hidden rounded-[var(--r)] border border-line bg-surface-3">
      {state.kind === "loading" && <PageLoader label="Preparing the document…" minHeight={height} />}
      {state.kind === "failed" && (
        <div className="p-4">
          <Callout tone="critical" title="The document could not be prepared"
                   action={<Button size="sm" variant="secondary" onClick={retry}>Try again</Button>}>
            {state.message}
          </Callout>
        </div>
      )}
      {state.kind === "ready" && (
        <iframe
          title={`${title} — document`}
          src={`${state.url}#toolbar=0&navpanes=0&view=FitH`}
          className="block w-full bg-surface"
          style={{ height }}
        />
      )}
    </div>
  );
}

/** The printed document, on the page — the same file Print and Download hand over. */
export function DocumentFrame({
  load, version, title, height = "78vh",
}: { load: () => Promise<Blob>; version: unknown; title: string; height?: string }) {
  const [state, retry] = usePdf(load, true, version);
  return <Frame state={state} title={title} height={height} retry={retry} />;
}

/**
 * The document itself, in a dialog. Not a rendering of the form in HTML: the
 * same PDF the server prints, so the preview cannot differ from the paper.
 */
export function DocumentPreview({
  open, onClose, title, subtitle, load, filename,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  /** fetches the PDF; called each time the preview opens */
  load: () => Promise<Blob>;
  filename: string;
}) {
  const [state, retry] = usePdf(load, open, null);
  const ready = state.kind === "ready" ? state : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" disabled={!ready} onClick={() => ready && downloadBlob(ready.blob, filename)}>
            <IconDownload size={15} /> Download PDF
          </Button>
          <Button variant="primary" disabled={!ready} onClick={() => ready && openPdfBlob(ready.blob)}>
            <IconPrint size={15} /> Print
          </Button>
        </div>
      }
    >
      <Frame state={state} title={title} height="70vh" retry={retry} />
    </Modal>
  );
}

/**
 * A pad to sign on with a finger, a stylus or a mouse. Reports a PNG data URL
 * when there is ink, and `null` when cleared — the parent never has to ask.
 */
export function SignaturePad({
  label, onChange, required, invalid, id,
}: {
  label: string;
  onChange: (png: string | null) => void;
  required?: boolean;
  invalid?: boolean;
  id: string;
}) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = React.useState(false);

  /* Sized to its box at the screen's density, so the line is crisp on a tablet. */
  React.useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      el.width = Math.round(width * ratio);
      el.height = Math.round(height * ratio);
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#141c2b";
      setInked(false);
      onChange(null);
    };
    fit();
    /* only on mount — a resize would clear a signature someone has drawn */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const moveTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!inked) setInked(true);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (inked && canvas.current) onChange(canvas.current.toDataURL("image/png"));
  };
  const clear = () => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.restore();
    setInked(false);
    onChange(null);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-label font-medium text-ink">
          {label}{required && <span className="ml-0.5 text-critical-text" aria-hidden> *</span>}
        </label>
        <Button variant="ghost" size="sm" onClick={clear} disabled={!inked}>Clear</Button>
      </div>
      <div
        className={cn(
          "relative rounded-[var(--r)] border bg-surface",
          invalid ? "border-critical" : "border-line-strong",
        )}
      >
        <canvas
          id={id}
          ref={canvas}
          role="img"
          aria-label={`${label} — draw here`}
          className="block h-36 w-full touch-none cursor-crosshair rounded-[var(--r)]"
          onPointerDown={down}
          onPointerMove={moveTo}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
        />
        {/* the line to sign on, and the cue — under the ink, never in it */}
        <div aria-hidden className="pointer-events-none absolute inset-x-5 bottom-7 border-b border-dashed border-line-strong" />
        {!inked && (
          <span aria-hidden className="pointer-events-none absolute bottom-2 left-5 text-caption text-ink-placeholder">
            Sign above the line
          </span>
        )}
      </div>
    </div>
  );
}
