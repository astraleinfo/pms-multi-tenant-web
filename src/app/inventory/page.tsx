"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, useInventoryItems, useInventoryTx } from "@/lib/query/hooks";
import {
  batchesFor, lowStock, nearExpiry, selectInventoryItems, selectInventoryTx,
  stockLevel, } from "@/lib/data/repository";
import { currency, formatDate } from "@/lib/format";
import type { InventoryItem, InventoryTransaction, InventoryTxType } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, Legend } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, TX_TONE } from "@/components/ui/badge";
import { EmptyState, KV, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Modal, Drawer } from "@/components/ui/modal";
import { Field, Input, SearchInput, Select } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RankBar } from "@/components/charts/bar-chart";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import { IconAlert, IconArrowDown, IconArrowUp, IconBox, IconClock, IconPlus } from "@/components/ui/icons";

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
    cell: ({ getValue }) => <span className="tnum font-mono">{currency(getValue())}</span>,
  }),
]);

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
  const { session, today } = useApp();
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

  const items = selectInventoryItems(db, t);
  const tx = selectInventoryTx(db, t).sort((a, b) => b.at.localeCompare(a.at));
  const low = lowStock(db, t);
  const expiring = nearExpiry(db, t, today, 120);

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
          <Button variant="primary" onClick={() => setMovement(true)}>
            <IconPlus size={15} /> Record movement
          </Button>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Stock lines" value={items.length} icon={<IconBox size={16} />}
              hint={`${tx.length} ledger entries`} />
        <Stat label="Below reorder" value={low.length} tone={low.length ? "warn" : "ok"} icon={<IconAlert size={16} />}
              hint={low.length ? low[0].item.name : "Everything is stocked"} />
        <Stat label="Expiring soon" value={expiring.length} tone={expiring.length ? "critical" : "ok"} icon={<IconClock size={16} />}
              hint="Within 120 days" />
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
          <CardHeader title="Expiry watch" subtitle="Batches inside 120 days, soonest first." />
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

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ""}
        subtitle={detail ? `${detail.sku} · ${detail.form} ${detail.strength}` : ""}
      >
        {detail && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4">
              <KV label="On hand" value={<span className="tnum font-mono">{stockLevel(db, t, detail.id)} {detail.unit}</span>} />
              <KV label="Reorder level" value={<span className="tnum font-mono">{detail.reorder_level}</span>} />
              <KV label="Unit price" value={currency(detail.unit_price)} />
              <KV label="Category" value={detail.category} />
            </dl>

            <div>
              <Legend>Batches</Legend>
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

function MovementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, recordStockMovement, notify } = useApp();
  const db = useClinicDb();
  const items = selectInventoryItems(db, session.tenantId);

  const [itemId, setItemId] = React.useState(items[0]?.id ?? "");
  const [type, setType] = React.useState<InventoryTxType>("purchase");
  const [qty, setQty] = React.useState(10);
  const [batch, setBatch] = React.useState("");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setItemId(items[0]?.id ?? ""); setType("purchase"); setQty(10); setBatch(""); setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const batches = itemId ? batchesFor(db, itemId) : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a stock movement"
      subtitle="Writes one row into the ledger. Stock on hand changes because the sum changed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!itemId || !qty) return;
              recordStockMovement({
                item_id: itemId, type, qty,
                batch_no: batch || batches[0]?.batch_no || "NEW-BATCH",
                note: note.trim() || undefined,
              });
              notify({ tone: "ok", title: "Movement recorded", body: `${TX_LABEL[type]} of ${Math.abs(qty)} units.` });
              onClose();
            }}
          >
            <IconPlus size={15} /> Record
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Item" required>
          <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name} — {stockLevel(db, session.tenantId, i.id)} {i.unit} on hand</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Type" required help={type === "adjustment" ? "Adjustments take the sign you type." : "Only a purchase adds stock."}>
            <Select value={type} onChange={(e) => setType(e.target.value as InventoryTxType)}>
              {(Object.keys(TX_LABEL) as InventoryTxType[])
                .filter((k) => k !== "dispense")
                .map((k) => <option key={k} value={k}>{TX_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field label="Quantity" required>
            <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
          </Field>
        </div>

        <Field label="Batch" help="Choose an existing batch or type a new number for incoming stock.">
          <Input value={batch} onChange={(e) => setBatch(e.target.value)}
                 placeholder={batches[0]?.batch_no ?? "New batch number"} list="batches" />
          <datalist id="batches">
            {batches.map((b) => <option key={b.batch_no} value={b.batch_no} />)}
          </datalist>
        </Field>

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier order, chairside use, damage…" />
        </Field>

        <p className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-2">
          Dispense is not in this list on purpose — those rows are written by the pharmacy when medicine is
          handed over, so the ledger and the prescription can never disagree.
        </p>
      </div>
    </Modal>
  );
}
