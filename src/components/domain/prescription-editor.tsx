"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, useMedicines } from "@/lib/query/hooks";
import { selectInventoryItems, stockLevel } from "@/lib/data/repository";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { IconPlus, IconRx, IconTrash } from "@/components/ui/icons";

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

interface MedicineSuggestion {
  medicine: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration: string;
}

let rowSeq = 0;
export const emptyRxItem = (): DraftRxItem => ({
  key: `rx-row-${++rowSeq}`,
  item_id: null, medicine: "", strength: "", dosage: "", frequency: "", duration: "",
  instructions: "", qty: 1,
});

/**
 * A searchable medicine field styled like the app's other pickers
 * (`PatientPicker`): a plain text input that still accepts anything typed,
 * with a filtered dropdown of catalog matches underneath. Picking a match
 * fills the rest of the row the way a quick-add chip does.
 */
function MedicineField({
  value, suggestions, onChange, onBlurCheck, onPick,
}: {
  value: string;
  suggestions: MedicineSuggestion[];
  onChange: (v: string) => void;
  onBlurCheck: (v: string) => void;
  onPick: (s: MedicineSuggestion) => void;
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

  const term = value.trim().toLowerCase();
  const matches = (term
    ? suggestions.filter((s) => s.medicine.toLowerCase().includes(term))
    : suggestions
  ).slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => onBlurCheck(e.target.value)}
        placeholder="Amoxicillin"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="pop absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-[var(--r)] border border-line bg-surface shadow-e3">
          <ul className="max-h-56 overflow-y-auto p-1.5">
            {matches.map((s) => (
              <li key={s.medicine}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onPick(s); setOpen(false); }}
                  className="flex w-full items-center justify-between gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="truncate text-[0.8438rem] text-ink">{s.medicine}</span>
                  <span className="shrink-0 text-[0.75rem] text-ink-3">{s.strength}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * §3.8 — prescriptions are core. If the clinic also runs a pharmacy the row can
 * be tied to a stock item so dispensing later draws from the ledger; if not,
 * the medicine is simply free text and everything else still works.
 */
export function PrescriptionEditor({
  items, onChange,
}: {
  items: DraftRxItem[];
  onChange: (next: DraftRxItem[]) => void;
}) {
  const { session, hasFeature, notify } = useApp();
  const db = useClinicDb();
  const { data: suggestions = [] } = useMedicines();
  const stockItems = hasFeature("pharmacy") || hasFeature("inventory")
    ? selectInventoryItems(db, session.tenantId).filter((i) => i.category === "medicine")
    : [];

  const patch = (key: string, p: Partial<DraftRxItem>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const norm = (name: string) => name.trim().toLowerCase();
  const isDuplicate = (name: string, exceptKey?: string) => {
    const n = norm(name);
    return !!n && items.some((it) => it.key !== exceptKey && norm(it.medicine) === n);
  };

  const addSuggestion = (s: MedicineSuggestion) => {
    if (isDuplicate(s.medicine)) {
      notify({ tone: "warn", title: `${s.medicine} is already on this prescription` });
      return;
    }
    onChange([...items, { ...emptyRxItem(), ...s, instructions: "", qty: 1, item_id: null }]);
  };

  const pickForRow = (key: string, s: MedicineSuggestion) => {
    if (isDuplicate(s.medicine, key)) {
      notify({ tone: "warn", title: `${s.medicine} is already on this prescription` });
      return;
    }
    patch(key, { medicine: s.medicine, strength: s.strength, dosage: s.dosage, frequency: s.frequency, duration: s.duration });
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
          body="Add a line, or start from one of the common choices below."
        />
      )}

      {items.map((it, idx) => (
        <div key={it.key} className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="tnum font-mono text-[0.75rem] font-medium text-ink-3">Line {idx + 1}</span>
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
            >
              <MedicineField
                value={it.medicine}
                suggestions={suggestions}
                onChange={(v) => patch(it.key, { medicine: v })}
                onBlurCheck={(v) => handleMedicineBlur(it.key, v)}
                onPick={(s) => pickForRow(it.key, s)}
              />
            </Field>
            <Field label="Strength">
              <Input value={it.strength} onChange={(e) => patch(it.key, { strength: e.target.value })} placeholder="500 mg" />
            </Field>
            <Field label="Quantity">
              <Input type="number" min={1} value={it.qty}
                     onChange={(e) => patch(it.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
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

            {stockItems.length > 0 && (
              <Field
                label="Stock item"
                className="sm:col-span-2 lg:col-span-4"
                help="Linking a line lets the pharmacy dispense against the inventory ledger. Optional."
              >
                <Select value={it.item_id ?? ""} onChange={(e) => patch(it.key, { item_id: e.target.value || null })}>
                  <option value="">Not linked to stock</option>
                  {stockItems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.strength} — {stockLevel(db, session.tenantId, s.id)} {s.unit} on hand
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onChange([...items, emptyRxItem()])}>
          <IconPlus size={14} /> Add line
        </Button>
        {suggestions.slice(0, 4).map((s) => (
          <button
            key={s.medicine}
            type="button"
            onClick={() => addSuggestion(s)}
            className="rounded-[var(--r-pill)] border border-line-strong bg-surface px-2.5 py-1 text-[0.75rem] text-ink-2 transition-colors hover:border-accent hover:text-accent-text"
          >
            + {s.medicine}
          </button>
        ))}
      </div>

      {!hasFeature("pharmacy") && items.length > 0 && (
        <Badge tone="neutral" size="sm">
          This clinic has no pharmacy module — the prescription still prints and lives on the record.
        </Badge>
      )}
    </div>
  );
}
