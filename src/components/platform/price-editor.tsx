"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { currency } from "@/lib/format";
import type { ModuleStats } from "@/lib/platform/subscriptions";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, NumberInput } from "@/components/ui/field";
import { KV } from "@/components/ui/misc";

/* ==========================================================================
   What a module costs, set from the console.

   One figure, quoted to every clinic at once and counted in every revenue
   number the console draws — so the dialog says what the change does to the
   run rate before it is saved, not after. The server holds the same rules as
   the form (super admin only, core modules unpriced, two decimals, eight whole
   digits); the form is here to say so sooner, not to be the check.
   ========================================================================== */

/** `Numeric(10, 2)` on the server: eight whole digits and two decimals. */
const MAX_PRICE = 99_999_999.99;

export function FeaturePriceDialog({
  stat, onClose,
}: {
  /** the module being priced, with the clinics that hold it; null when closed */
  stat: ModuleStats | null;
  onClose: () => void;
}) {
  /* The module last opened is kept after it closes, so the dialog is still
     there to animate away. */
  const last = React.useRef<ModuleStats | null>(null);
  /* counted on the step from closed to open — the stats object itself is
     rebuilt on every render of the page, so its identity says nothing */
  const opening = React.useRef(0);
  const wasOpen = React.useRef(false);
  if (stat && !wasOpen.current) opening.current += 1;
  wasOpen.current = !!stat;
  if (stat) last.current = stat;
  const shown = stat ?? last.current;
  if (!shown) return null;
  /* Keyed by opening, so each one starts from the module's own price rather
     than whatever was typed last time. */
  return <PriceForm key={opening.current} open={!!stat} stat={shown} onClose={onClose} />;
}

function PriceForm({ open, stat, onClose }: { open: boolean; stat: ModuleStats; onClose: () => void }) {
  const { setFeaturePrice, notify } = useApp();
  const { feature } = stat;
  const current = feature.price_monthly;
  const [price, setPrice] = React.useState(current);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const problem =
    !Number.isFinite(price) ? "Enter a price."
      : price < 0 ? "A price cannot be negative."
        : price > MAX_PRICE ? `A price cannot be more than ${currency(MAX_PRICE)}.`
          /* a tolerance, because 0.1 * 100 is not exactly 10 in floating point */
          : Math.abs(price * 100 - Math.round(price * 100)) > 1e-6
            ? "Use at most two decimal places."
            : null;
  const unchanged = price === current;
  /* Only billed lines move the run rate — a trial is not revenue, and a
     suspended clinic is not collected from. */
  const delta = (price - current) * stat.billed;

  const close = () => { if (!busy) onClose(); };

  const save = async () => {
    if (problem || unchanged) return;
    setBusy(true);
    setError(null);
    try {
      await setFeaturePrice(feature.key, price);
      notify({
        tone: "ok",
        title: `${feature.name} now costs ${currency(price)}/mo`,
        body: stat.billed
          ? `Every clinic is quoted the new price, and the ${stat.billed} already billed move with it.`
          : "Every clinic is quoted the new price from now on.",
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The price was not changed. Try again.");
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      width="sm"
      title={`Price of ${feature.name}`}
      subtitle="One price for every clinic on the platform."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => { void save(); }}
            disabled={busy || !!problem || unchanged}
          >
            {busy ? "Saving…" : "Save price"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        className="space-y-4"
      >
        <Field
          label="Monthly price per clinic"
          htmlFor="feature-price"
          required
          error={error ?? (price !== current ? problem : null)}
          help={`Currently ${currency(current)}/mo. Zero makes the module free.`}
        >
          <NumberInput
            id="feature-price"
            min={0}
            max={MAX_PRICE}
            step="0.01"
            value={price}
            onChange={(n) => { setPrice(n); setError(null); }}
            invalid={!!error || (price !== current && !!problem)}
            autoFocus
          />
        </Field>

        <dl className="rounded-[var(--r)] border border-line bg-surface-2 px-3.5 py-1">
          <KV label="Clinics billed for it" value={stat.billed} />
          <KV label="On trial" value={stat.trial || "—"} />
          <KV
            label="Run-rate change"
            value={
              <span className="tnum font-mono">
                {unchanged || problem ? "—" : `${delta >= 0 ? "+" : "−"}${currency(Math.abs(delta))}/mo`}
              </span>
            }
          />
        </dl>

        <p className="text-caption leading-relaxed text-ink-3">
          The console bills from the entitlement rows and this price, so the change applies to
          clinics already subscribed as well as to new ones.
        </p>
      </form>
    </Modal>
  );
}
