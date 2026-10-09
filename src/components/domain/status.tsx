import * as React from "react";
import { Badge, APPOINTMENT_TONE, FLAG_TONE, FOLLOW_UP_TONE, INVOICE_TONE, LAB_TONE, QUEUE_TONE, RX_TONE, TX_TONE, type Tone } from "@/components/ui/badge";
import { IconArrowDown, IconArrowUp, IconCheck } from "@/components/ui/icons";
import { sentenceCase } from "@/lib/format";
import type { BillingDepartment } from "@/lib/types";

const MAPS = {
  appointment: APPOINTMENT_TONE,
  followUp: FOLLOW_UP_TONE,
  queue: QUEUE_TONE,
  prescription: RX_TONE,
  lab: LAB_TONE,
  invoice: INVOICE_TONE,
  inventory: TX_TONE,
} as const;

const LABELS: Record<string, string> = {
  in_consultation: "In consultation",
  partially_dispensed: "Part dispensed",
  partially_paid: "Part paid",
  no_show: "No show",
  checked_in: "Checked in",
  void: "Void",
  reschedule_required: "Reschedule required",
  no_answer: "No answer",
  call_back: "Call back later",
};

/**
 * The finished states. Most rows on most screens are in one — a visit
 * completed, a bill paid, a result verified — and a green pill on each of them
 * is a column of green that hides the one row still waiting. These say so in
 * quiet text with a tick; the states that need somebody keep the coloured pill.
 */
const SETTLED: Partial<Record<keyof typeof MAPS, string[]>> = {
  appointment: ["completed"],
  queue: ["completed"],
  prescription: ["dispensed"],
  lab: ["verified"],
  invoice: ["paid"],
};

/** One place decides what a status looks like, everywhere it appears. */
export function StatusPill({
  kind, status, size = "md", dot = true, pulse,
}: {
  kind: keyof typeof MAPS;
  status: string;
  size?: "sm" | "md";
  dot?: boolean;
  pulse?: boolean;
}) {
  const tone: Tone = MAPS[kind][status] ?? "neutral";
  if (SETTLED[kind]?.includes(status)) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-caption text-ink-3">
        <IconCheck size={12} className="shrink-0" />
        {LABELS[status] ?? sentenceCase(status)}
      </span>
    );
  }
  return (
    <Badge tone={tone} size={size} dot={dot} pulse={pulse}>
      {LABELS[status] ?? sentenceCase(status)}
    </Badge>
  );
}

export const statusLabel = (status: string) => LABELS[status] ?? sentenceCase(status);

/**
 * An out-of-range lab value.
 *
 * Tone alone cannot carry this one. Red-green is the commonest colour vision
 * deficiency and "high" and "normal" are exactly the pair it collapses, so
 * the direction is stated three ways at once: an arrow, a word, and a colour.
 */
const FLAG_ICON: Record<string, React.ReactNode> = {
  high: <IconArrowUp size={11} strokeWidth={2.4} />,
  low: <IconArrowDown size={11} strokeWidth={2.4} />,
  normal: <IconCheck size={11} strokeWidth={2.4} />,
};

export function LabFlag({ flag, size = "sm" }: { flag: string; size?: "sm" | "md" }) {
  return (
    <Badge tone={FLAG_TONE[flag] ?? "neutral"} size={size}>
      {FLAG_ICON[flag]}
      {sentenceCase(flag)}
    </Badge>
  );
}

/**
 * Which counter an invoice belongs to, in words.
 *
 * One map, because the ledger's column, the composer and the account panel all
 * name the same three things and must not drift apart.
 */
export const DEPARTMENT_LABEL: Record<BillingDepartment, string> = {
  clinic: "Clinic", lab: "Lab", pharmacy: "Pharmacy",
};
