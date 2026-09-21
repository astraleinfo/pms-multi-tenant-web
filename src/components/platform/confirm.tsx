"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * Stop, and say what is about to happen.
 *
 * Used for the console's one-click changes — granting a module, taking a
 * clinic's subdomain offline — where the button is small, the blast radius is
 * a whole practice, and there is no undo on the other side. The dialog names
 * the clinic and the thing being changed rather than asking "are you sure",
 * because the mistake it is there to catch is acting on the wrong row.
 */
export function ConfirmDialog({
  open, onClose, onConfirm, title, subtitle, confirmLabel, busy, tone = "primary", children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  tone?: "primary" | "danger";
  children: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      width="sm"
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/** A line of consequence inside a confirmation — one fact, one icon. */
export function ConsequenceList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 text-[0.8125rem] leading-relaxed text-ink-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-[0.5rem] h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
