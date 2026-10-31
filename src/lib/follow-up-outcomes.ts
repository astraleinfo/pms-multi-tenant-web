import type { FollowUpOutcome } from "@/lib/types";

/* ==========================================================================
   What the desk can say came of a follow-up call.

   The options are grouped by whether the call reached the patient, because
   the two cases lead to different next steps: someone who answered has said
   what happens to the booking, someone who didn't stays on the list. Each
   option says, in one line, what it does to the booking — "Needs a new slot"
   and "Reschedule today" sound alike until you read that line.

   The number keys pick an option in the order the options are drawn, so the
   key hint on a card is always its place on the screen. "Reschedule today"
   is offered only on today's bookings and sits straight after Confirmed, so
   on those rows the options after it are one number further on.
   ========================================================================== */

export type OutcomeGroup = "reached" | "unreached";

export interface OutcomeOption {
  value: FollowUpOutcome;
  label: string;
  /** what the option does to the booking, in a line */
  consequence: string;
  group: OutcomeGroup;
  /** the number key that picks it: its place in the order drawn, from 1 */
  key: number;
}

type Entry = Omit<OutcomeOption, "key">;

const CONFIRMED: Entry = {
  value: "confirmed", label: "Confirmed", group: "reached",
  consequence: "Keeps the slot.",
};
/* Unlike "Needs a new slot" — which can be saved with no new time, to ring
   back — this is only complete once a time is picked. */
const MOVE_TODAY: Entry = {
  value: "rescheduled", label: "Reschedule today", group: "reached",
  consequence: "Still coming today, at another time.",
};
const NEW_SLOT: Entry = {
  value: "reschedule_required", label: "Needs a new slot", group: "reached",
  consequence: "Book another day now, or ring back later.",
};
const DECLINED: Entry = {
  value: "declined", label: "Declined", group: "reached",
  consequence: "Won't come. You can free the slot.",
};
const NO_ANSWER: Entry = {
  value: "no_answer", label: "No answer", group: "unreached",
  consequence: "Stays on the list to try again.",
};
const CALL_BACK: Entry = {
  value: "call_back", label: "Call back later", group: "unreached",
  consequence: "They asked to be rung another time.",
};

export const OUTCOME_GROUPS: Array<{ group: OutcomeGroup; caption: string }> = [
  { group: "reached", caption: "Reached the patient" },
  { group: "unreached", caption: "Could not reach" },
];

/** Every option for a row, in the order drawn, each with its number key. */
export function outcomeOptions(movableToday: boolean): OutcomeOption[] {
  const entries = [
    CONFIRMED,
    ...(movableToday ? [MOVE_TODAY] : []),
    NEW_SLOT,
    DECLINED,
    NO_ANSWER,
    CALL_BACK,
  ];
  return entries.map((e, i) => ({ ...e, key: i + 1 }));
}

/** The options under each group's caption; a group with nothing in it is left out. */
export function groupOutcomes(options: readonly OutcomeOption[]) {
  return OUTCOME_GROUPS
    .map((g) => ({ ...g, options: options.filter((o) => o.group === g.group) }))
    .filter((g) => g.options.length > 0);
}

/** The option a key press picks, or null if the key is not one of the numbers shown. */
export function outcomeForKey(options: readonly OutcomeOption[], key: string): FollowUpOutcome | null {
  return options.find((o) => String(o.key) === key)?.value ?? null;
}
