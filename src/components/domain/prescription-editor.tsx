"use client";

import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb } from "@/lib/query/hooks";
import { medicinesFor } from "@/lib/data/catalog";
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

let rowSeq = 0;
export const emptyRxItem = (): DraftRxItem => ({
  key: `rx-row-${++rowSeq}`,
  item_id: null, medicine: "", strength: "", dosage: "", frequency: "", duration: "",
  instructions: "", qty: 1,
});

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
  const { session, hasFeature } = useApp();
  const db = useClinicDb();
  const { tenant } = useTenant();
  const suggestions = medicinesFor(tenant.clinical_type);
  const stockItems = hasFeature("pharmacy") || hasFeature("inventory")
    ? selectInventoryItems(db, session.tenantId).filter((i) => i.category === "medicine")
    : [];

  const patch = (key: string, p: Partial<DraftRxItem>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...p } : it)));

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
            <Field label="Medicine" required className="sm:col-span-2">
              <Input value={it.medicine} onChange={(e) => patch(it.key, { medicine: e.target.value })}
                     placeholder="Amoxicillin" list={`meds-${it.key}`} />
              <datalist id={`meds-${it.key}`}>
                {suggestions.map((s) => <option key={s.medicine} value={s.medicine} />)}
              </datalist>
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
            onClick={() => onChange([...items, { ...emptyRxItem(), ...s, instructions: "", qty: 1, item_id: null }])}
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
