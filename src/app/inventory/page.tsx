"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, useInventoryItems, useInventoryTx } from "@/lib/query/hooks";
import {
  lowStock, nearExpiry, selectInventoryItems, selectInventoryTx, stockLevel,
} from "@/lib/data/repository";
import { currency, formatDate, formatStamp } from "@/lib/format";
import { StockReference } from "@/components/domain/stock-reference";
import { InventoryExportButton, InventoryImportButton } from "@/components/domain/inventory-sheet";
import { ItemModal, MovementModal, TX_LABEL, priceBasis } from "@/components/domain/inventory-forms";
import { InventoryItemDetailModal } from "@/components/domain/inventory-item-detail";
import type {
  InventoryItem, InventoryTransaction,
} from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, TX_TONE } from "@/components/ui/badge";
import { EmptyState, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import {
  SearchInput,
} from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RankBar } from "@/components/charts/bar-chart";
import { RoleGate } from "@/components/domain/gates";
import {
  IconAlert, IconArrowUp, IconBox, IconCheck, IconClock, IconList, IconPlus,
} from "@/components/ui/icons";

const itemCol = columnHelperFor<InventoryItem>();
const txCol = columnHelperFor<InventoryTransaction>();

const stockColumns = itemCol.columns([
  itemCol.accessor("name", {
    header: "Item",
    cell: ({ row }) => (
      <>
        <span className="block font-medium text-ink">{row.original.name}</span>
        <span className="block text-caption text-ink-3">{row.original.form} · {row.original.strength}</span>
      </>
    ),
  }),
  itemCol.accessor("sku", {
    header: "SKU",
    cell: ({ getValue }) => <span className="tnum font-mono text-caption text-ink-2">{getValue()}</span>,
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
        <span className="block text-micro text-ink-3">{priceBasis(row.original)}</span>
      </>
    ),
  }),
]);

const ledgerColumns = txCol.columns([
  txCol.accessor("at", {
    header: "When",
    cell: ({ getValue }) => (
      <span className="tnum whitespace-nowrap text-label text-ink-2">{formatStamp(getValue())}</span>
    ),
  }),
  txCol.accessor((x) => x.item_id, {
    id: "item", header: "Item", enableSorting: false,
    cell: ({ row }) => <LedgerItemCell tx={row.original} />,
  }),
  txCol.accessor("type", {
    header: "Type",
    /* the sign and colour of the quantity already say in or out; only a
       write-off, which is stock lost, keeps a pill */
    cell: ({ getValue }) => getValue() === "expiry"
      ? <Badge tone={TX_TONE[getValue()]} size="sm" dot={false}>{TX_LABEL[getValue()]}</Badge>
      : <span className="text-label text-ink-2">{TX_LABEL[getValue()]}</span>,
  }),
  txCol.accessor("batch_no", {
    header: "Batch",
    cell: ({ getValue }) => <span className="tnum font-mono text-label text-ink-2">{getValue()}</span>,
  }),
  txCol.accessor((x) => x.ref_type ?? "", {
    id: "reference", header: "For", enableSorting: false,
    cell: ({ row }) => <StockReference tx={row.original} />,
  }),
  txCol.accessor("qty", {
    header: "Quantity", meta: { align: "right" },
    cell: ({ getValue }) => (
      /* stock coming in is the notable direction; going out is the day's work */
      <span className={`tnum font-medium ${getValue() >= 0 ? "text-ok-text" : "text-ink"}`}>
        {getValue() > 0 ? `+${getValue()}` : `−${Math.abs(getValue())}`}
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
        {/* the figure and its unit are one token — wrapping "345" onto one
            line and "cap" onto the next reads as two facts, not one */}
        <span className={`tnum whitespace-nowrap font-mono text-label ${below ? "text-warn-text" : "text-ink"}`}>
          {level} {item.unit}
        </span>
      </div>
      <span className="mt-0.5 block text-micro text-ink-3">reorder at {item.reorder_level}</span>
    </>
  );
}

function LedgerItemCell({ tx }: { tx: InventoryTransaction }) {
  const { data: items = [] } = useInventoryItems();
  const item = items.find((i) => i.id === tx.item_id);
  return (
    <>
      <span className="block text-ink">{item?.name ?? tx.item_id}</span>
      {tx.note && <span className="block text-caption text-ink-3">{tx.note}</span>}
    </>
  );
}

export default function InventoryPage() {
  return (
    <RoleGate allow={["pharmacist"]}>
      <Inventory />
    </RoleGate>
  );
}

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
  const [openId, setOpenId] = React.useState<string | null>(null);
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
        title="Inventory"
        description="One ledger, every movement. Stock on hand is the sum of the transactions for an item — purchases, dispenses, returns, adjustments, expiry write-offs and transfers — never a mutable counter."
        actions={
          <>
            <InventoryImportButton />
            <InventoryExportButton />
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
          { value: "stock", label: "Stock", icon: <IconBox size={15} />, count: items.length },
          { value: "ledger", label: "Ledger", icon: <IconList size={15} />, count: tx.length },
          { value: "expiry", label: "Expiry watch", icon: <IconClock size={15} />, count: expiring.length },
        ]}
      />

      {tab === "stock" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<IconBox size={15} />} tone="warn" title="On hand"
              hint="Computed from the ledger every time it is read."
              actions={
                <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item or SKU"
                             wrapperClassName="w-48" className="h-8 text-label" />
              }
            />
            <DataTable
              columns={stockColumns}
              data={rows}
              getRowId={(i) => i.id}
              loading={itemsPending}
              pageSize={12}
              initialSorting={[{ id: "name", desc: false }]}
              onRowClick={(i) => setOpenId(i.id)}
              minWidth="46rem"
              empty={<EmptyState icon={<IconBox size={20} />} title="No stock line matches" />}
            />
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader icon={<IconBox size={15} />} tone="warn" title="Most consumed" hint="Every negative movement, by item." />
              <CardBody className="pt-1">
                {consumption.length ? (
                  <RankBar rows={consumption} format={(n) => `${n}`} />
                ) : (
                  <EmptyState compact icon={<IconBox size={20} />} title="Nothing has moved out yet" />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader tone="warn" icon={<IconAlert size={16} />} title="Below reorder level" />
              <CardBody className="pt-0">
                {low.length === 0 ? (
                  <EmptyState compact icon={<IconCheck size={20} />} title="Everything is above its reorder level" />
                ) : (
                  <ul className="divide-y divide-line-soft">
                    {low.map((r) => (
                      <li key={r.item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-label font-medium text-ink">{r.item.name}</p>
                          <p className="text-caption text-ink-3">reorder at {r.item.reorder_level} {r.item.unit}</p>
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
          <CardHeader icon={<IconBox size={15} />} tone="warn" title="Every movement" hint="Append-only. Nothing here is edited; corrections are new adjustments." />
          <DataTable
            columns={ledgerColumns}
            data={tx}
            getRowId={(x) => x.id}
            loading={ledgerPending}
            pageSize={15}
            initialSorting={[{ id: "at", desc: true }]}
            minWidth="56rem"
            empty={<EmptyState icon={<IconBox size={26} />} title="Nothing has moved yet" />}
          />
        </Card>
      )}

      {tab === "expiry" && (
        <Card className="overflow-hidden">
          <CardHeader icon={<IconClock size={15} />} tone="warn" title="Expiry watch" hint={`Batches inside ${config.expiry_alert_days} days, soonest first.`} />
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
                      <TD className="tnum font-mono text-label text-ink-2">{b.batch_no}</TD>
                      <TD className="tnum font-mono text-label">{formatDate(b.expiry, "long")}</TD>
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
      <InventoryItemDetailModal
        id={openId}
        onClose={() => setOpenId(null)}
        onEdit={(item) => { setOpenId(null); setEditing(item); }}
      />

      <ItemModal
        open={editing !== null}
        item={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />

    </>
  );
}
