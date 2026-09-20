"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, useInventoryItems, useInventoryTx } from "@/lib/query/hooks";
import {
  batchesFor, lowStock, nearExpiry, selectInventoryItems, selectInventoryTx,
  stockLevel, } from "@/lib/data/repository";
import { currency, formatDate } from "@/lib/format";
import type {
  InventoryCategory, InventoryItem, InventoryTransaction, InventoryTxType, PricingMode,
} from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, Legend } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, TX_TONE } from "@/components/ui/badge";
import { EmptyState, KV, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Modal, Drawer } from "@/components/ui/modal";
import {
  Checkbox, ChoiceGroup, Combobox, Field, Input, NumberInput, SearchInput, Select, Textarea,
  type ComboOption,
} from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RankBar } from "@/components/charts/bar-chart";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import {
  IconAlert, IconArrowDown, IconArrowUp, IconBox, IconClock, IconEdit, IconPlus,
} from "@/components/ui/icons";

const itemCol = columnHelperFor<InventoryItem>();
const txCol = columnHelperFor<InventoryTransaction>();

const stockColumns = itemCol.columns([
  itemCol.accessor("name", {
    header: "Item",
    cell: ({ row }) => (
      <>
        <span className="block font-medium text-ink">{row.original.name}</span>
        <span className="block text-[0.75rem] text-ink-3">{row.original.form} · {row.original.strength}</span>
      </>
    ),
  }),
  itemCol.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => <span className="tnum font-mono text-[0.75rem] text-ink-2">{getValue()}</span>,
  }),
  itemCol.accessor((i) => i.id, {
    id: "level", header: "Level", enableSorting: false, meta: { width: 190 },
    cell: ({ row }) => <StockLevelCell item={row.original} />,
  }),
  itemCol.accessor("unit_price", {
    header: "Unit price", meta: { align: "right" },
    cell: ({ row }) => (
      <>
        <span className="tnum block font-mono">{currency(row.original.unit_price)}</span>
        <span className="block text-[0.6875rem] text-ink-3">{priceBasis(row.original)}</span>
      </>
    ),
  }),
]);

/** How this line's price was arrived at, in a few words. */
function priceBasis(item: InventoryItem): string {
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

const PRICING_LABEL: Record<PricingMode, string> = {
  price: "Price", percent: "Cost + %", mrp: "MRP",
};

const CATEGORIES: InventoryCategory[] = ["medicine", "consumable", "implant", "lens", "reagent"];

/** How a stock line is counted. Suggestions only — anything can be typed. */
const UNITS = [
  "unit", "tab", "cap", "bottle", "tube", "syringe", "vial", "amp", "cart",
  "pack", "box", "strip", "sachet", "ml", "g", "pair", "piece",
];

const ledgerColumns = txCol.columns([
  txCol.accessor("at", {
    header: "When",
    cell: ({ getValue }) => (
      <span className="tnum whitespace-nowrap font-mono text-[0.8125rem] text-ink-2">{getValue()}</span>
    ),
  }),
  txCol.accessor((x) => x.item_id, {
    id: "item", header: "Item", enableSorting: false,
    cell: ({ row }) => <LedgerItemCell tx={row.original} />,
  }),
  txCol.accessor("type", {
    header: "Type",
    cell: ({ getValue }) => <Badge tone={TX_TONE[getValue()]} size="sm" dot={false}>{TX_LABEL[getValue()]}</Badge>,
  }),
  txCol.accessor("batch_no", {
    header: "Batch",
    cell: ({ getValue }) => <span className="tnum font-mono text-[0.8125rem] text-ink-2">{getValue()}</span>,
  }),
  txCol.accessor((x) => (x.ref_type ? `${x.ref_type}:${x.ref_id ?? "—"}` : "—"), {
    id: "reference", header: "Reference",
    cell: ({ getValue }) => <span className="tnum font-mono text-[0.75rem] text-ink-3">{getValue()}</span>,
  }),
  txCol.accessor("qty", {
    header: "Quantity", meta: { align: "right" },
    cell: ({ getValue }) => (
      <span className={`tnum inline-flex items-center gap-1 font-mono font-medium ${getValue() >= 0 ? "text-ok-text" : "text-critical-text"}`}>
        {getValue() >= 0 ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
        {getValue() > 0 ? `+${getValue()}` : getValue()}
      </span>
    ),
  }),
]);

function StockLevelCell({ item }: { item: InventoryItem }) {
  const { session } = useApp();
  const db = useClinicDb();
  const level = stockLevel(db, session.tenantId, item.id);
  const below = level <= item.reorder_level;
  return (
    <>
      <div className="flex items-center gap-2">
        <Meter value={level} max={Math.max(item.reorder_level * 2, level)} tone={below ? "warn" : "ok"} className="w-24" />
        <span className={`tnum font-mono text-[0.8125rem] ${below ? "text-warn-text" : "text-ink"}`}>
          {level} {item.unit}
        </span>
      </div>
      <span className="mt-0.5 block text-[0.6875rem] text-ink-3">reorder at {item.reorder_level}</span>
    </>
  );
}

function LedgerItemCell({ tx }: { tx: InventoryTransaction }) {
  const { data: items = [] } = useInventoryItems();
  const item = items.find((i) => i.id === tx.item_id);
  return (
    <>
      <span className="block text-ink">{item?.name ?? tx.item_id}</span>
      {tx.note && <span className="block text-[0.75rem] text-ink-3">{tx.note}</span>}
    </>
  );
}

export default function InventoryPage() {
  return (
    <RoleGate allow={["pharmacist"]}>
      <FeatureGate feature="inventory">
        <Inventory />
      </FeatureGate>
    </RoleGate>
  );
}

const TX_LABEL: Record<InventoryTxType, string> = {
  purchase: "Purchase", dispense: "Dispense", return: "Return",
  adjustment: "Adjustment", expiry: "Expiry write-off", transfer: "Transfer",
};

function Inventory() {
  const { session, today, config } = useApp();
  const db = useClinicDb();
  const t = session.tenantId;
  /* the stock table is computed from the item list, the ledger from the
     movements — so each waits on the read it is actually made of */
  const { isPending: itemsPending } = useInventoryItems();
  const { isPending: ledgerPending } = useInventoryTx();

  const [tab, setTab] = React.useState<"stock" | "ledger" | "expiry">("stock");
  const [q, setQ] = React.useState("");
  const [movement, setMovement] = React.useState(false);
  const [detail, setDetail] = React.useState<InventoryItem | null>(null);
  /* null = closed; a row = editing it; "new" = opening a line */
  const [editing, setEditing] = React.useState<InventoryItem | "new" | null>(null);

  const items = selectInventoryItems(db, t);
  const tx = selectInventoryTx(db, t).sort((a, b) => b.at.localeCompare(a.at));
  const low = lowStock(db, t);
  const expiring = nearExpiry(db, t, today, config.expiry_alert_days);

  const stockValue = items.reduce((s, i) => s + stockLevel(db, t, i.id) * i.unit_price, 0);

  const rows = items.filter((i) => {
    const term = q.trim().toLowerCase();
    return !term || i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term);
  });

  const consumption = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const x of tx) {
      if (x.qty >= 0) continue;
      map.set(x.item_id, (map.get(x.item_id) ?? 0) + Math.abs(x.qty));
    }
    return [...map.entries()]
      .map(([id, value]) => ({ label: items.find((i) => i.id === id)?.name ?? id, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [tx, items]);

  return (
    <>
      <PageHeader
        eyebrow="Feature module"
        title="Inventory"
        description="One ledger, every movement. Stock on hand is the sum of the transactions for an item — purchases, dispenses, returns, adjustments, expiry write-offs and transfers — never a mutable counter."
        actions={
          <>
            <Button variant="secondary" onClick={() => setMovement(true)}>
              <IconArrowUp size={15} /> Record movement
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <IconPlus size={15} /> Add item
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Stock lines" value={items.length} icon={<IconBox size={16} />}
              hint={`${tx.length} ledger entries`} />
        <Stat label="Below reorder" value={low.length} tone={low.length ? "warn" : "ok"} icon={<IconAlert size={16} />}
              hint={low.length ? low[0].item.name : "Everything is stocked"} />
        <Stat label="Expiring soon" value={expiring.length} tone={expiring.length ? "critical" : "ok"} icon={<IconClock size={16} />}
              hint={`Within ${config.expiry_alert_days} days`} />
        <Stat label="Stock at cost" value={currency(stockValue)} icon={<IconBox size={16} />}
              hint="Sum of on-hand × unit price" />
      </section>

      <Tabs
        className="mb-5 mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "stock", label: "Stock", count: items.length },
          { value: "ledger", label: "Ledger", count: tx.length },
          { value: "expiry", label: "Expiry watch", count: expiring.length },
        ]}
      />

      {tab === "stock" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader
              title="On hand"
              subtitle="Computed from the ledger every time it is read."
              actions={
                <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item or SKU"
                             wrapperClassName="w-48" className="h-8 text-[0.8125rem]" />
              }
            />
            <DataTable
              columns={stockColumns}
              data={rows}
              getRowId={(i) => i.id}
              loading={itemsPending}
              pageSize={12}
              initialSorting={[{ id: "name", desc: false }]}
              onRowClick={(i) => setDetail(i)}
              minWidth="46rem"
              empty={<EmptyState icon={<IconBox size={20} />} title="No stock line matches" />}
            />
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Most consumed" subtitle="Every negative movement, by item." />
              <CardBody className="pt-1">
                {consumption.length ? (
                  <RankBar rows={consumption} format={(n) => `${n}`} />
                ) : (
                  <EmptyState compact title="Nothing has moved out yet" />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon={<IconAlert size={16} />} title="Below reorder level" />
              <CardBody className="pt-0">
                {low.length === 0 ? (
                  <EmptyState compact title="Everything is above its reorder level" />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {low.map((r) => (
                      <li key={r.item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-[0.8438rem] font-medium text-ink">{r.item.name}</p>
                          <p className="text-[0.75rem] text-ink-3">reorder at {r.item.reorder_level} {r.item.unit}</p>
                        </div>
                        <Badge tone="warn" size="sm">{r.level} left</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === "ledger" && (
        <Card className="overflow-hidden">
          <CardHeader title="Every movement" subtitle="Append-only. Nothing here is edited; corrections are new adjustments." />
          <DataTable
            columns={ledgerColumns}
            data={tx}
            getRowId={(x) => x.id}
            loading={ledgerPending}
            pageSize={15}
            initialSorting={[{ id: "at", desc: true }]}
            minWidth="56rem"
            empty={<EmptyState title="Nothing has moved yet" />}
          />
        </Card>
      )}

      {tab === "expiry" && (
        <Card className="overflow-hidden">
          <CardHeader title="Expiry watch" subtitle={`Batches inside ${config.expiry_alert_days} days, soonest first.`} />
          {expiring.length === 0 ? (
            <EmptyState icon={<IconClock size={20} />} title="Nothing expiring soon" />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr><TH>Item</TH><TH>Batch</TH><TH>Expires</TH><TH align="right">On hand</TH><TH align="right">Days left</TH></tr>
                </THead>
                <TBody>
                  {expiring.map((b) => (
                    <TR key={`${b.item_id}-${b.batch_no}`}>
                      <TD>{b.item.name}</TD>
                      <TD className="tnum font-mono text-[0.8125rem] text-ink-2">{b.batch_no}</TD>
                      <TD className="tnum font-mono text-[0.8125rem]">{formatDate(b.expiry, "long")}</TD>
                      <TD align="right" className="tnum font-mono">{b.qty} {b.item.unit}</TD>
                      <TD align="right">
                        <Badge tone={b.daysLeft <= 0 ? "critical" : b.daysLeft <= 45 ? "warn" : "neutral"} size="sm" dot={false}>
                          {b.daysLeft <= 0 ? "Expired" : `${b.daysLeft} days`}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      )}

      <MovementModal open={movement} onClose={() => setMovement(false)} />

      <ItemModal
        open={editing !== null}
        item={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ""}
        subtitle={detail
          /* a line with no form or strength should not read "SKU · " */
          ? [detail.sku, [detail.form, detail.strength].filter(Boolean).join(" ")]
              .filter(Boolean).join(" · ")
          : ""}
      >
        {detail && (
          <div className="space-y-5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setEditing(detail); setDetail(null); }}
            >
              <IconEdit size={14} /> Edit item
            </Button>

            <dl className="grid grid-cols-2 gap-4">
              <KV label="On hand" value={<span className="tnum font-mono">{stockLevel(db, t, detail.id)} {detail.unit}</span>} />
              <KV label="Reorder level" value={<span className="tnum font-mono">{detail.reorder_level}</span>} />
              <KV label="Unit price" value={currency(detail.unit_price)} />
              <KV label="Category" value={detail.category} />
              <KV label="Priced by" value={PRICING_LABEL[detail.pricing_mode]} />
              <KV label="Basis" value={priceBasis(detail)} />
              <KV label="Cost price" value={currency(detail.cost_price)} />
              <KV label="MRP" value={detail.mrp ? currency(detail.mrp) : "—"} />
              <KV label="Manufacturer" value={detail.manufacturer || "—"} />
              <KV label="HSN code" value={detail.hsn_code || "—"} />
            </dl>

            {detail.description && (
              <p className="mt-2 text-[0.8125rem] leading-snug text-ink-2">{detail.description}</p>
            )}

            <div>
              <Legend>Batches</Legend>
              {batchesFor(db, detail.id).length === 0 && (
                <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-4 text-center text-[0.8125rem] text-ink-3">
                  No batch yet — record a purchase to put stock on the shelf.
                </p>
              )}
              <ul className="space-y-2">
                {batchesFor(db, detail.id).map((b) => (
                  <li key={b.batch_no} className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-line px-3 py-2.5">
                    <div>
                      <p className="tnum font-mono text-[0.8125rem] font-medium text-ink">{b.batch_no}</p>
                      <p className="text-[0.75rem] text-ink-3">expires {formatDate(b.expiry, "long")}</p>
                    </div>
                    <span className="tnum font-mono text-[0.8125rem] text-ink">{b.qty} {detail.unit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Legend>Movements</Legend>
              {tx.filter((x) => x.item_id === detail.id).length === 0 && (
                <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-4 text-center text-[0.8125rem] text-ink-3">
                  Nothing has moved in or out of this line yet.
                </p>
              )}
              <ul className="space-y-1.5">
                {tx.filter((x) => x.item_id === detail.id).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                    <span className="tnum font-mono text-[0.75rem] text-ink-3">{x.at}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{TX_LABEL[x.type]}</span>
                    <span className={`tnum font-mono ${x.qty >= 0 ? "text-ok-text" : "text-critical-text"}`}>
                      {x.qty > 0 ? `+${x.qty}` : x.qty}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

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

      <p className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.8125rem]">
        <span className="text-ink-2">Sells at</span>
        <span className="tnum font-mono text-[0.9375rem] font-semibold text-ink">{currency(preview)}</span>
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
function ItemModal({
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
          <p className="rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-2.5 text-[0.8125rem] text-critical-text">
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
              <p className="text-[0.8438rem] font-medium text-ink">Opening stock</p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-3">
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

function MovementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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

        <p className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-2">
          Dispense is not in this list on purpose — those rows are written by the pharmacy when medicine is
          handed over, so the ledger and the prescription can never disagree.
        </p>
      </div>
    </Modal>
  );
}
