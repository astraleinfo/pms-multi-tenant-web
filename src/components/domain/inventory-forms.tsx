"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb } from "@/lib/query/hooks";
import { batchesFor, selectInventoryItems, stockLevel } from "@/lib/data/repository";
import { currency } from "@/lib/format";
import type { InventoryCategory, InventoryItem, InventoryTxType, PricingMode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  Checkbox, ChoiceGroup, Combobox, Field, Input, NumberInput, Select, Textarea, type ComboOption,
} from "@/components/ui/field";
import { IconPlus } from "@/components/ui/icons";

/* ==========================================================================
   The stock line's own forms and the words it is described in — shared by
   the Inventory list and a stock line's own screen.
   ========================================================================== */

/** How this line's price was arrived at, in a few words. */
export function priceBasis(item: InventoryItem): string {
  if (item.pricing_mode === "percent") {
    return `${currency(item.cost_price)} + ${item.margin_pct}%`;
  }
  if (item.pricing_mode === "mrp") {
    return item.margin_pct
      ? `MRP ${currency(item.mrp)} − ${item.margin_pct}%`
      : `MRP ${currency(item.mrp)}`;
  }
  return "set by hand";
}

export const PRICING_LABEL: Record<PricingMode, string> = {
  price: "Price", percent: "Cost + %", mrp: "MRP",
};

export const CATEGORIES: InventoryCategory[] = ["medicine", "consumable", "implant", "lens", "reagent"];

/** How a stock line is counted. Suggestions only — anything can be typed. */
export const UNITS = [
  "unit", "tab", "cap", "bottle", "tube", "syringe", "vial", "amp", "cart",
  "pack", "box", "strip", "sachet", "ml", "g", "pair", "piece",
];

export const TX_LABEL: Record<InventoryTxType, string> = {
  purchase: "Purchase", dispense: "Dispense", return: "Return",
  adjustment: "Adjustment", expiry: "Expiry write-off", transfer: "Transfer",
};

/**
 * A price, and the three ways of arriving at one.
 *
 * Shared by both dialogues below, because the choice is the same whether a
 * line is being opened or a delivery is being priced: type the figure, add a
 * margin to what it cost, or take the printed MRP less a discount. The preview
 * is the same arithmetic the server does — it is shown, not sent, so the two
 * can never disagree about what was saved.
 */
function PricingFields({
  mode, onMode, unitPrice, onUnitPrice, cost, onCost, mrp, onMrp, margin, onMargin,
}: {
  mode: PricingMode;
  onMode: (m: PricingMode) => void;
  unitPrice: number;
  onUnitPrice: (n: number) => void;
  cost: number;
  onCost: (n: number) => void;
  mrp: number;
  onMrp: (n: number) => void;
  margin: number;
  onMargin: (n: number) => void;
}) {
  const preview = derivePrice({ mode, unitPrice, cost, mrp, margin });

  return (
    <div className="space-y-4">
      <Field label="How is it priced?" required>
        <ChoiceGroup<PricingMode>
          value={mode}
          onChange={onMode}
          columns={3}
          options={[
            { value: "price", label: "Price", description: "Type what it sells for." },
            { value: "percent", label: "Cost + %", description: "A margin over what it cost." },
            { value: "mrp", label: "MRP", description: "The printed price, less a discount." },
          ]}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Cost price" help="What one unit cost to buy.">
          <NumberInput min={0} step="0.01" value={cost} onChange={onCost} />
        </Field>
        <Field label="MRP" help="The printed maximum retail price, if the pack carries one.">
          <NumberInput min={0} step="0.01" value={mrp} onChange={onMrp} />
        </Field>

        {mode === "price" && (
          <Field label="Selling price" required className="sm:col-span-2">
            <NumberInput min={0} step="0.01" value={unitPrice} onChange={onUnitPrice} />
          </Field>
        )}

        {mode !== "price" && (
          <Field
            label={mode === "percent" ? "Margin %" : "Discount off MRP %"}
            required
            className="sm:col-span-2"
            help={mode === "percent"
              ? "Added to the cost price."
              : "Zero sells at the printed price."}
          >
            <NumberInput step="0.01" value={margin} onChange={onMargin} />
          </Field>
        )}
      </div>

      <p className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-label">
        <span className="text-ink-2">Sells at</span>
        <span className="tnum font-mono text-body font-semibold text-ink">{currency(preview)}</span>
      </p>
    </div>
  );
}

/** The same arithmetic the server does — shown here, decided there. */
function derivePrice({
  mode, unitPrice, cost, mrp, margin,
}: { mode: PricingMode; unitPrice: number; cost: number; mrp: number; margin: number }) {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (mode === "percent") return round(cost + (cost * margin) / 100);
  if (mode === "mrp") return Math.max(0, round(mrp - (mrp * margin) / 100));
  return round(unitPrice);
}

/**
 * Open a stock line, or edit one.
 *
 * A new line starts at nothing on hand: the ledger is what puts stock on a
 * shelf, so the first purchase comes next and this is only the label and the
 * price it will carry.
 */
export function ItemModal({
  open, item, onClose,
}: {
  open: boolean;
  item: InventoryItem | null;
  onClose: () => void;
}) {
  const { createInventoryItem, updateInventoryItem, recordStockMovement, notify } = useApp();

  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [form, setForm] = React.useState("");
  const [strength, setStrength] = React.useState("");
  const [unit, setUnit] = React.useState("unit");
  const [category, setCategory] = React.useState<InventoryCategory>("medicine");
  const [reorder, setReorder] = React.useState(0);
  const [mode, setMode] = React.useState<PricingMode>("price");
  const [unitPrice, setUnitPrice] = React.useState(0);
  const [cost, setCost] = React.useState(0);
  const [mrp, setMrp] = React.useState(0);
  const [margin, setMargin] = React.useState(0);
  const [manufacturer, setManufacturer] = React.useState("");
  const [hsnCode, setHsnCode] = React.useState("");
  const [description, setDescription] = React.useState("");
  /* Opening stock. A new line is at nothing on hand until the ledger says
     otherwise, so what is typed here becomes its first purchase — a real
     movement, not a counter someone can drift. */
  const [openingQty, setOpeningQty] = React.useState(0);
  const [openingBatch, setOpeningBatch] = React.useState("");
  const [openingExpiry, setOpeningExpiry] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setOpeningQty(0);
    setOpeningBatch("");
    setOpeningExpiry("");
    setSku(item?.sku ?? "");
    setName(item?.name ?? "");
    setForm(item?.form ?? "");
    setStrength(item?.strength ?? "");
    setUnit(item?.unit ?? "unit");
    setCategory(item?.category ?? "medicine");
    setReorder(item?.reorder_level ?? 0);
    setMode(item?.pricing_mode ?? "price");
    setUnitPrice(item?.unit_price ?? 0);
    setCost(item?.cost_price ?? 0);
    setMrp(item?.mrp ?? 0);
    setMargin(item?.margin_pct ?? 0);
    setManufacturer(item?.manufacturer ?? "");
    setHsnCode(item?.hsn_code ?? "");
    setDescription(item?.description ?? "");
    setError(null);
    setSaving(false);
  }, [open, item]);

  const save = async () => {
    if (!sku.trim() || !name.trim()) {
      setError("A stock line needs a code and a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      sku: sku.trim(),
      name: name.trim(),
      form: form.trim(),
      strength: strength.trim(),
      unit: unit.trim() || "unit",
      category,
      reorder_level: reorder,
      unit_price: unitPrice,
      cost_price: cost,
      mrp,
      margin_pct: margin,
      pricing_mode: mode,
      manufacturer: manufacturer.trim(),
      hsn_code: hsnCode.trim(),
      description: description.trim(),
    };
    /* Two writes, in this order: the line has to exist before anything can
       move into it. They are kept apart so a refusal says which half failed —
       a duplicate code is the dialogue's problem to fix, while a line that
       opened but would not take its stock is already saved and should not be
       submitted again. */
    let saved;
    try {
      saved = item
        ? await updateInventoryItem(item.id, payload)
        : await createInventoryItem(payload);
    } catch (e) {
      /* the API's refusals are written for people — a duplicate code says so */
      setError(e instanceof Error ? e.message : "That did not go through.");
      setSaving(false);
      return;
    }

    if (!item && openingQty > 0) {
      try {
        await recordStockMovement({
          item_id: saved.id,
          type: "purchase",
          qty: openingQty,
          batch_no: openingBatch.trim() || "OPENING",
          expiry: openingExpiry || undefined,
          note: "Opening stock",
        });
      } catch {
        notify({
          tone: "warn",
          title: `${saved.name} was opened, but its stock was not`,
          body: "The line is saved. Put the quantity in with Record movement.",
        });
        setSaving(false);
        onClose();
        return;
      }
    }

    notify({
      tone: "ok",
      title: item ? "Stock line updated" : "Stock line opened",
      body: !item && openingQty > 0
        ? `${saved.name} — ${openingQty} ${saved.unit} in, selling at ${currency(saved.unit_price)}.`
        : `${saved.name} sells at ${currency(saved.unit_price)}.`,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title={item ? "Edit stock line" : "Add a stock line"}
      subtitle={item
        ? "The selling price is re-derived from whatever the pricing mode says."
        : "It starts at nothing on hand — a purchase is what puts stock on the shelf."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            <IconPlus size={15} /> {item ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-2.5 text-label text-critical-text">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Field label="Code" required help="Unique within the clinic.">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="MED-AMX-500" />
          </Field>
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amoxicillin capsules" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Form" help="The shape it comes in.">
            <Input value={form} onChange={(e) => setForm(e.target.value)} placeholder="Capsule" />
          </Field>
          <Field label="Strength" help="What is in one of them.">
            <Input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="500 mg" />
          </Field>
          <Field
            label="Unit of measure"
            help="What one of them is called when counted — not how many you have."
          >
            <Input value={unit} onChange={(e) => setUnit(e.target.value)}
                   placeholder="cap" list="stock-units" />
            <datalist id="stock-units">
              {UNITS.map((u) => <option key={u} value={u} />)}
            </datalist>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reorder level" help={`At or below this many ${unit.trim() || "unit"}s, the line shows as low.`}>
            <NumberInput min={0} value={reorder} onChange={setReorder} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Manufacturer">
            <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Cipla" />
          </Field>
          <Field label="HSN code" help="For GST-compliant invoicing.">
            <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="3004" />
          </Field>
        </div>

        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes on this line — usage, storage, anything worth remembering." />
        </Field>

        <PricingFields
          mode={mode} onMode={setMode}
          unitPrice={unitPrice} onUnitPrice={setUnitPrice}
          cost={cost} onCost={setCost}
          mrp={mrp} onMrp={setMrp}
          margin={margin} onMargin={setMargin}
        />

        {/* Only when opening a line. Stock on an existing one moves through
            the ledger, where every change has a reason attached to it. */}
        {!item && (
          <div className="space-y-4 rounded-[var(--r)] border border-line bg-surface-2 p-3">
            <div>
              <p className="text-label font-medium text-ink">Opening stock</p>
              <p className="mt-0.5 text-caption leading-relaxed text-ink-3">
                How many you have right now. This is written as the line's first purchase, so it shows in
                the ledger like every other movement. Leave it at zero and add stock later with
                Record movement.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Quantity" help={`In ${unit.trim() || "units"}.`}>
                <NumberInput min={0} value={openingQty} onChange={setOpeningQty} />
              </Field>
              <Field label="Batch number" help="What is on the box.">
                <Input value={openingBatch} onChange={(e) => setOpeningBatch(e.target.value)}
                       placeholder="OPENING" disabled={openingQty <= 0} />
              </Field>
              <Field label="Expiry" help="When this batch runs out.">
                <Input type="date" value={openingExpiry} onChange={(e) => setOpeningExpiry(e.target.value)}
                       disabled={openingQty <= 0} />
              </Field>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function MovementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, recordStockMovement, notify } = useApp();
  const db = useClinicDb();
  const items = selectInventoryItems(db, session.tenantId);

  const [itemId, setItemId] = React.useState(items[0]?.id ?? "");
  const [type, setType] = React.useState<InventoryTxType>("purchase");
  const [qty, setQty] = React.useState(10);
  const [batch, setBatch] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [note, setNote] = React.useState("");
  /* Pricing rides along with a delivery, and only when asked for: a stock-take
     or a write-off has no business changing what an item sells for. */
  const [reprice, setReprice] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [mode, setMode] = React.useState<PricingMode>("price");
  const [unitPrice, setUnitPrice] = React.useState(0);
  const [cost, setCost] = React.useState(0);
  const [mrp, setMrp] = React.useState(0);
  const [margin, setMargin] = React.useState(0);

  const item = items.find((i) => i.id === itemId) ?? null;

  React.useEffect(() => {
    if (!open) return;
    const first = items[0] ?? null;
    setItemId(first?.id ?? "");
    setType("purchase"); setQty(10); setBatch(""); setExpiry(""); setNote("");
    setReprice(false); setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Whichever line is chosen, the pricing panel opens showing that line's own
     figures rather than the last one's. */
  React.useEffect(() => {
    if (!item) return;
    setMode(item.pricing_mode);
    setUnitPrice(item.unit_price);
    setCost(item.cost_price);
    setMrp(item.mrp);
    setMargin(item.margin_pct);
  }, [item]);

  const batches = itemId ? batchesFor(db, itemId) : [];

  const options = React.useMemo<ComboOption[]>(
    () => items.map((i) => ({
      value: i.id,
      label: `${i.name}${i.strength ? ` ${i.strength}` : ""}`,
      hint: `${stockLevel(db, session.tenantId, i.id)} ${i.unit}`,
      keywords: `${i.sku} ${i.form} ${i.category}`,
    })),
    [items, db, session.tenantId],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Record a stock movement"
      subtitle="Writes one row into the ledger. Stock on hand changes because the sum changed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving || !itemId || !qty}
            onClick={async () => {
              if (!itemId || !qty) return;
              setSaving(true);
              try {
                await recordStockMovement({
                  item_id: itemId, type, qty,
                  batch_no: batch.trim() || batches[0]?.batch_no || "NEW-BATCH",
                  expiry: expiry || undefined,
                  note: note.trim() || undefined,
                  ...(reprice
                    ? {
                        pricing_mode: mode,
                        unit_price: unitPrice,
                        cost_price: cost,
                        mrp,
                        margin_pct: margin,
                      }
                    : {}),
                });
                notify({
                  tone: "ok",
                  title: "Movement recorded",
                  body: `${TX_LABEL[type]} of ${Math.abs(qty)} ${item?.unit ?? "units"}.`,
                });
                onClose();
              } catch {
                /* The refusal — too few in the batch, a batch that does not
                   exist — is already on screen as a toast. The dialogue stays
                   open so the figure can be corrected rather than retyped. */
              } finally {
                setSaving(false);
              }
            }}
          >
            <IconPlus size={15} /> Record
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Item" required help="Start typing a name, a code or a form.">
          <Combobox
            id="movement-item"
            value={itemId}
            onChange={setItemId}
            options={options}
            placeholder="Type to search the stock list"
            emptyText="No stock line matches that."
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Type" required help={type === "adjustment" ? "Adjustments take the sign you type." : "Only a purchase adds stock."}>
            <Select value={type} onChange={(e) => setType(e.target.value as InventoryTxType)}>
              {(Object.keys(TX_LABEL) as InventoryTxType[])
                .filter((k) => k !== "dispense")
                .map((k) => <option key={k} value={k}>{TX_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field label="Quantity" required help={item ? `In ${item.unit}.` : undefined}>
            <NumberInput value={qty} onChange={setQty} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Batch" help="Choose an existing batch or type a new number for incoming stock.">
            <Input value={batch} onChange={(e) => setBatch(e.target.value)}
                   placeholder={batches[0]?.batch_no ?? "New batch number"} list="batches" />
            <datalist id="batches">
              {batches.map((b) => <option key={b.batch_no} value={b.batch_no} />)}
            </datalist>
          </Field>
          <Field label="Expiry" help="Set when a new batch arrives.">
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier order, chairside use, damage…" />
        </Field>

        <div className="rounded-[var(--r)] border border-line bg-surface-2 p-3">
          <Checkbox
            checked={reprice}
            onChange={setReprice}
            label="Update what this item costs and sells for"
            description="A delivery is when the supplier's figures are in front of you. Leave this off and the price stays exactly as it is."
          />
          {reprice && item && (
            <div className="mt-4 border-t border-line pt-4">
              <PricingFields
                mode={mode} onMode={setMode}
                unitPrice={unitPrice} onUnitPrice={setUnitPrice}
                cost={cost} onCost={setCost}
                mrp={mrp} onMrp={setMrp}
                margin={margin} onMargin={setMargin}
              />
            </div>
          )}
        </div>

        <p className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-caption leading-relaxed text-ink-2">
          Dispense is not in this list on purpose — those rows are written by the pharmacy when medicine is
          handed over, so the ledger and the prescription can never disagree.
        </p>
      </div>
    </Modal>
  );
}
