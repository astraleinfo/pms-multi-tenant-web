"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, useMedicines } from "@/lib/query/hooks";
import { selectInventoryItems, stockLevel } from "@/lib/data/repository";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { IconAlert, IconBox, IconPlus, IconRx, IconTrash } from "@/components/ui/icons";

export interface DraftRxItem {
  key: string;
  item_id: string | null;
  medicine: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  qty: number;
}

/**
 * One thing a clinician can pick.
 *
 * Where the clinic keeps stock, these are its own shelf: an item the pharmacy
 * actually holds, carrying the id that lets a dispense draw from the ledger.
 * Where it does not, they are the shared catalogue, and `item_id` is null —
 * the prescription still prints and still lives on the record.
 */
interface MedicineChoice {
  item_id: string | null;
  medicine: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration: string;
  /** how many are on the shelf, for a stock-backed choice */
  on_hand?: number;
  unit?: string;
  /** which list it came from, so the dropdown can say so */
  source: "stock" | "catalogue";
  /** typed by hand rather than picked: it names the medicine and nothing else */
  custom?: true;
}

const GROUP_LABEL: Record<MedicineChoice["source"], string> = {
  stock: "In this clinic's inventory",
  catalogue: "Common medicines — not stocked here",
};

let rowSeq = 0;
export const emptyRxItem = (): DraftRxItem => ({
  key: `rx-row-${++rowSeq}`,
  item_id: null, medicine: "", strength: "", dosage: "", frequency: "", duration: "",
  instructions: "", qty: 1,
});

/**
 * A searchable medicine field styled like the app's other pickers
 * (`PatientPicker`): a plain text input that still accepts anything typed,
 * with a filtered dropdown of matches underneath. Picking a match fills the
 * rest of the row — and, when the match is a stock line, ties the row to it.
 *
 * Typing something that is not on the list stays possible on purpose: a
 * clinician writing a script the patient will fill somewhere else is a real
 * thing, and the row says plainly that the pharmacy cannot dispense it.
 */
function MedicineField({
  value, choices, onChange, onBlurCheck, onPick,
}: {
  value: string;
  choices: MedicineChoice[];
  onChange: (v: string) => void;
  onBlurCheck: (v: string) => void;
  onPick: (choice: MedicineChoice) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const typed = value.trim();
  const term = typed.toLowerCase();
  const matching = term
    ? choices.filter((c) => `${c.medicine} ${c.strength}`.toLowerCase().includes(term))
    : choices;

  /* Two lists, stock first: what the pharmacy can hand over, then everything
     else a clinician commonly writes. Each is capped so one cannot bury the
     other. */
  const groups = (["stock", "catalogue"] as const)
    .map((source) => ({ source, rows: matching.filter((c) => c.source === source).slice(0, 8) }))
    .filter((g) => g.rows.length > 0);

  /* Anything can be written, whether it is on either list or not — a script
     the patient fills somewhere else is an ordinary thing. */
  const exact = matching.some((c) => c.medicine.toLowerCase() === term);
  const custom = typed.length > 0 && !exact;

  return (
    <div className="relative" ref={ref}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => onBlurCheck(e.target.value)}
        placeholder="Type a medicine, or pick one below"
        autoComplete="off"
      />
      {open && (groups.length > 0 || custom) && (
        <div className="pop absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-[var(--r)] border border-line bg-surface shadow-e3">
          <ul className="max-h-64 overflow-y-auto p-1.5">
            {groups.map((group) => (
              <li key={group.source}>
                <p className="px-2.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">
                  {GROUP_LABEL[group.source]}
                </p>
                <ul>
                  {group.rows.map((c) => (
                    <li key={c.item_id ?? `cat-${c.medicine}`}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { onPick(c); setOpen(false); }}
                        className="flex w-full items-center justify-between gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors hover:bg-hover"
                      >
                        <span className="min-w-0 flex-1 truncate text-label text-ink">
                          {c.medicine}
                          {c.strength && <span className="text-ink-3"> · {c.strength}</span>}
                        </span>
                        {c.on_hand === undefined ? (
                          <span className="shrink-0 text-caption text-ink-3">{c.dosage || "—"}</span>
                        ) : (
                          <span
                            className={`shrink-0 text-caption ${c.on_hand > 0 ? "text-ink-3" : "text-warn-text"}`}
                          >
                            {c.on_hand > 0 ? `${c.on_hand} ${c.unit ?? ""} on hand` : "none left"}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}

            {custom && (
              <li className="mt-1 border-t border-line-soft pt-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    /* A custom entry keeps whatever else has been typed into
                       the row; only the tie to a stock line goes. */
                    onPick({
                      item_id: null, medicine: typed, strength: "", dosage: "",
                      frequency: "", duration: "", source: "catalogue", custom: true,
                    });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors hover:bg-hover"
                >
                  <IconPlus size={13} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate text-label text-ink">
                    Write “{typed}” as a custom entry
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * §3.8 — prescriptions are core.
 *
 * A clinic that keeps stock prescribes from its own shelf: the picker offers
 * the inventory lines it holds, and choosing one ties the row to that item, so
 * the pharmacy dispenses against the ledger rather than matching names by eye.
 * A clinic with no inventory sees the shared catalogue exactly as before, and
 * either way anything can still be typed by hand.
 */
export function PrescriptionEditor({
  items, onChange,
}: {
  items: DraftRxItem[];
  onChange: (next: DraftRxItem[]) => void;
}) {
  const { session, notify } = useApp();
  const db = useClinicDb();
  const { data: catalogue = [] } = useMedicines();

  const stockItems = React.useMemo(
    () => selectInventoryItems(db, session.tenantId).filter((i) => i.category === "medicine"),
    [db, session.tenantId],
  );

  /**
   * What the picker offers.
   *
   * With stock, the shelf is the list — and the catalogue is still read for the
   * dose, frequency and duration a name implies, so picking a box of
   * amoxicillin fills the row the way it always did.
   */
  /**
   * What the picker offers: both lists, stock first.
   *
   * The shelf is what the pharmacy can actually hand over, so it leads and
   * carries the id a dispense needs. The shared catalogue stays underneath it —
   * a clinician writing something this clinic does not keep is ordinary, and so
   * is typing a name that is on neither list.
   *
   * A catalogue entry whose name is already a stock line is dropped: it would
   * be the same medicine twice, once dispensable and once not.
   */
  const choices = React.useMemo<MedicineChoice[]>(() => {
    const defaultsFor = (name: string) =>
      catalogue.find((c) => c.medicine.toLowerCase() === name.toLowerCase());

    const fromStock: MedicineChoice[] = stockItems.map((item) => {
      const defaults = defaultsFor(item.name);
      return {
        item_id: item.id,
        medicine: item.name,
        strength: item.strength,
        dosage: defaults?.dosage ?? "",
        frequency: defaults?.frequency ?? "",
        duration: defaults?.duration ?? "",
        on_hand: stockLevel(db, session.tenantId, item.id),
        unit: item.unit,
        source: "stock",
      };
    });

    const stocked = new Set(fromStock.map((c) => c.medicine.toLowerCase()));
    const fromCatalogue: MedicineChoice[] = catalogue
      .filter((c) => !stocked.has(c.medicine.toLowerCase()))
      .map((c) => ({ item_id: null, ...c, source: "catalogue" }));

    return [...fromStock, ...fromCatalogue];
  }, [stockItems, catalogue, db, session.tenantId]);

  const patch = (key: string, p: Partial<DraftRxItem>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const norm = (name: string) => name.trim().toLowerCase();
  const isDuplicate = (name: string, exceptKey?: string) => {
    const n = norm(name);
    return !!n && items.some((it) => it.key !== exceptKey && norm(it.medicine) === n);
  };

  /** What one row can be dispensed against, and how much of it there is. */
  const stockFor = (it: DraftRxItem) => stockItems.find((s) => s.id === it.item_id) ?? null;
  const levelFor = (it: DraftRxItem) =>
    it.item_id ? stockLevel(db, session.tenantId, it.item_id) : null;

  const addChoice = (c: MedicineChoice) => {
    if (isDuplicate(c.medicine)) {
      notify({ tone: "warn", title: `${c.medicine} is already on this prescription` });
      return;
    }
    onChange([...items, {
      ...emptyRxItem(),
      item_id: c.item_id,
      medicine: c.medicine,
      strength: c.strength,
      dosage: c.dosage,
      frequency: c.frequency,
      duration: c.duration,
    }]);
  };

  const pickForRow = (key: string, c: MedicineChoice) => {
    if (isDuplicate(c.medicine, key)) {
      notify({ tone: "warn", title: `${c.medicine} is already on this prescription` });
      return;
    }
    /* A custom entry only names the medicine — the dose, frequency and anything
       else already typed into the row is what the clinician meant, and picking
       "write this as a custom entry" must not throw it away. */
    if (c.custom) {
      patch(key, { item_id: null, medicine: c.medicine });
      return;
    }
    patch(key, {
      item_id: c.item_id,
      medicine: c.medicine,
      strength: c.strength,
      dosage: c.dosage,
      frequency: c.frequency,
      duration: c.duration,
    });
  };

  /* Typing over a name that was picked from the shelf breaks the tie to it:
     the row is about whatever it now says, not the box it started as. */
  const editMedicine = (it: DraftRxItem, name: string) => {
    const stock = stockFor(it);
    const drifted = !!stock && norm(name) !== norm(stock.name);
    patch(it.key, { medicine: name, ...(drifted ? { item_id: null } : {}) });
  };

  const handleMedicineBlur = (key: string, name: string) => {
    if (isDuplicate(name, key)) {
      notify({ tone: "warn", title: `${name.trim()} is already on this prescription` });
    }
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <EmptyState
          compact
          icon={<IconRx size={20} />}
          title="No medicines on this prescription"
          body={stockItems.length
            ? "Add a line and start typing — what this clinic stocks comes first, then the common list."
            : "Add a line, or start from one of the common choices below."}
        />
      )}

      {items.map((it, idx) => {
        const level = levelFor(it);
        const stock = stockFor(it);
        const short = level !== null && level < it.qty;

        return (
          <div key={it.key} className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tnum font-mono text-caption font-medium text-ink-3">Line {idx + 1}</span>
                {stock && (
                  <Badge tone={short ? "warn" : "ok"} size="sm" dot={false}>
                    <IconBox size={11} /> {level} {stock.unit} on hand
                  </Badge>
                )}
                {stockItems.length > 0 && !it.item_id && it.medicine.trim() && (
                  <Badge tone="neutral" size="sm" dot={false}>Not stocked here</Badge>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => onChange(items.filter((x) => x.key !== it.key))}
                      aria-label="Remove line">
                <IconTrash size={14} />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label="Medicine"
                required
                className="sm:col-span-2"
                error={isDuplicate(it.medicine, it.key) ? "Already on this prescription." : null}
                help={stockItems.length && !it.item_id && it.medicine.trim()
                  ? "Not one of this clinic's stock lines — the pharmacy cannot dispense it, but it still prints."
                  : undefined}
              >
                <MedicineField
                  value={it.medicine}
                  choices={choices}
                  onChange={(v) => editMedicine(it, v)}
                  onBlurCheck={(v) => handleMedicineBlur(it.key, v)}
                  onPick={(c) => pickForRow(it.key, c)}
                />
              </Field>
              <Field label="Strength">
                <Input value={it.strength} onChange={(e) => patch(it.key, { strength: e.target.value })} placeholder="500 mg" />
              </Field>
              <Field
                label="Quantity"
                error={short ? `Only ${level} on hand.` : null}
              >
                <NumberInput min={1} value={it.qty}
                             onChange={(n) => patch(it.key, { qty: n })} />
              </Field>
              <Field label="Dose">
                <Input value={it.dosage} onChange={(e) => patch(it.key, { dosage: e.target.value })} placeholder="1 capsule" />
              </Field>
              <Field label="Frequency">
                <Input value={it.frequency} onChange={(e) => patch(it.key, { frequency: e.target.value })} placeholder="Three times daily" />
              </Field>
              <Field label="Duration">
                <Input value={it.duration} onChange={(e) => patch(it.key, { duration: e.target.value })} placeholder="5 days" />
              </Field>
              <Field label="Instructions">
                <Input value={it.instructions} onChange={(e) => patch(it.key, { instructions: e.target.value })} placeholder="After food" />
              </Field>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange([...items, emptyRxItem()])}>
          <IconPlus size={14} /> Add line
        </Button>
        {choices.slice(0, 4).map((c) => (
          <button
            key={c.item_id ?? `cat-${c.medicine}`}
            type="button"
            onClick={() => addChoice(c)}
            className="rounded-[var(--r-pill)] border border-line-strong bg-surface px-2.5 py-1 text-caption text-ink-2 transition-colors hover:border-accent hover:text-accent-text"
          >
            + {c.medicine}
          </button>
        ))}
      </div>

      {stockItems.length === 0 && (
        <p className="flex items-start gap-2 rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2.5 text-caption leading-relaxed text-warn-text">
          <IconAlert size={14} className="mt-px shrink-0" />
          There are no medicine lines in inventory yet, so nothing on this prescription can be dispensed
          by the pharmacy. Add them under Inventory and they will lead the list here.
        </p>
      )}
    </div>
  );
}
