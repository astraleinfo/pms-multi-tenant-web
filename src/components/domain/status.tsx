import { Badge, APPOINTMENT_TONE, INVOICE_TONE, LAB_TONE, QUEUE_TONE, RX_TONE, TX_TONE, type Tone } from "@/components/ui/badge";
import { sentenceCase } from "@/lib/format";

const MAPS = {
  appointment: APPOINTMENT_TONE,
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
  return (
    <Badge tone={tone} size={size} dot={dot} pulse={pulse}>
      {LABELS[status] ?? sentenceCase(status)}
    </Badge>
  );
}

export const statusLabel = (status: string) => LABELS[status] ?? sentenceCase(status);
