"use client";

import { useTenant } from "@/lib/store/app-store";
import { labCatalogFor } from "@/lib/data/catalog";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/field";
import { IconCheck, IconFlask } from "@/components/ui/icons";

export interface DraftLabTest {
  code: string;
  name: string;
  panel: string;
  note?: string;
}

/** §3.10 — pick tests to order with the encounter. */
export function LabOrderPicker({
  selected, onChange, note, onNote,
}: {
  selected: DraftLabTest[];
  onChange: (next: DraftLabTest[]) => void;
  note: string;
  onNote: (v: string) => void;
}) {
  const { tenant } = useTenant();
  const catalog = labCatalogFor(tenant.clinical_type);
  const panels = [...new Set(catalog.map((c) => c.panel))];

  const toggle = (code: string) => {
    const test = catalog.find((c) => c.code === code)!;
    onChange(selected.some((s) => s.code === code)
      ? selected.filter((s) => s.code !== code)
      : [...selected, { code: test.code, name: test.name, panel: test.panel }]);
  };

  return (
    <div className="space-y-4">
      {panels.map((panel) => (
        <div key={panel}>
          <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">{panel}</p>
          <div className="flex flex-wrap gap-1.5">
            {catalog.filter((c) => c.panel === panel).map((c) => {
              const on = selected.some((s) => s.code === c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggle(c.code)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-3 py-1.5 text-[0.8125rem] transition-all duration-150",
                    on
                      ? "border-accent bg-accent-soft font-medium text-accent-text"
                      : "border-line-strong bg-surface text-ink-2 hover:border-ink-3/50 hover:text-ink",
                  )}
                >
                  {on ? <IconCheck size={12} strokeWidth={2.6} /> : <IconFlask size={12} />}
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-ink">Note for the lab</p>
          <Input value={note} onChange={(e) => onNote(e.target.value)}
                 placeholder="What is this ruling in or out?" />
          <p className="mt-1.5 text-[0.75rem] text-ink-3">
            Orders open as <span className="font-medium">ordered</span> and only reach the patient record once a
            technician has verified the result.
          </p>
        </div>
      )}
    </div>
  );
}
