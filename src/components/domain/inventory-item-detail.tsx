"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, useInventoryItems } from "@/lib/query/hooks";
import { batchesFor, selectInventoryTx, stockLevel } from "@/lib/data/repository";
import { currency, formatDate, formatStamp, sentenceCase } from "@/lib/format";
import type { Id, InventoryItem } from "@/lib/types";
import { Legend } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV, Meter } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/loader";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StockReference } from "@/components/domain/stock-reference";
import { PRICING_LABEL, TX_LABEL, priceBasis } from "@/components/domain/inventory-forms";
import { IconBox, IconEdit } from "@/components/ui/icons";

/**
 * One stock line, opened from the stock table: what is on hand, how it is
 * priced, the batches on the shelf and every movement in and out.
 */
export function InventoryItemDetailModal({ id, onClose, onEdit }: {
  id: Id | null;
  onClose: () => void;
  /** hand the line to the edit form — the popup closes behind it */
  onEdit: (item: InventoryItem) => void;
}) {
  const { session, today, config } = useApp();
  const db = useClinicDb();
  const t = session.tenantId;
  const { data: items = [], isPending } = useInventoryItems();
  const item = id ? items.find((i) => i.id === id) : undefined;

  /* a line with no form or strength should not read "SKU · " */
  const subtitle = item
    ? [item.sku, [item.form, item.strength].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
    : undefined;

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      width="xl"
      title={item?.name ?? "Stock item"}
      subtitle={subtitle}
      footer={
        item && (
          <Button variant="secondary" onClick={() => onEdit(item)}>
            <IconEdit size={14} /> Edit item
          </Button>
        )
      }
    >
      {isPending ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !item ? (
        <EmptyState icon={<IconBox size={22} />} title="No such stock line"
                    body="This item doesn’t exist, or it has been removed." />
      ) : (
        <ItemBody item={item} level={stockLevel(db, t, item.id)} today={today} alertDays={config.expiry_alert_days} />
      )}
    </Modal>
  );
}

function ItemBody({ item, level, today, alertDays }: {
  item: InventoryItem;
  level: number;
  today: string;
  alertDays: number;
}) {
  const { session } = useApp();
  const db = useClinicDb();
  const below = level <= item.reorder_level;
  const batches = batchesFor(db, item.id);
  const movements = selectInventoryTx(db, session.tenantId)
    .filter((x) => x.item_id === item.id)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-[var(--r-lg)] border border-line bg-surface-2 px-4 py-3">
        <div>
          <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">On hand</p>
          <p className={`tnum font-mono text-title font-semibold ${below ? "text-warn-text" : "text-ink"}`}>
            {level} <span className="text-label font-normal text-ink-3">{item.unit}</span>
          </p>
        </div>
        <div className="min-w-[10rem] flex-1">
          <Meter value={level} max={Math.max(item.reorder_level * 2, level)} tone={below ? "warn" : "ok"} />
          <p className="mt-1 text-caption text-ink-3">Reorder at {item.reorder_level}</p>
        </div>
        {below && <Badge tone="warn" size="sm">Below reorder</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
        <KV label="Unit price" value={currency(item.unit_price)} />
        <KV label="Priced by" value={PRICING_LABEL[item.pricing_mode]} />
        <KV label="Basis" value={priceBasis(item)} />
        <KV label="Cost price" value={currency(item.cost_price)} />
        <KV label="MRP" value={item.mrp ? currency(item.mrp) : "—"} />
        <KV label="Category" value={sentenceCase(item.category)} />
        <KV label="Manufacturer" value={item.manufacturer || "—"} />
        <KV label="HSN code" value={item.hsn_code || "—"} />
      </dl>
      {item.description && <p className="-mt-2 text-label leading-snug text-ink-2">{item.description}</p>}

      <div>
        <Legend>Batches</Legend>
        {batches.length === 0 ? (
          <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-4 text-center text-label text-ink-3">
            No batch yet — record a purchase to put stock on the shelf.
          </p>
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr><TH>Batch</TH><TH>Expires</TH><TH align="right">On hand</TH></tr>
              </THead>
              <TBody>
                {batches.map((b) => {
                  const days = Math.round((Date.parse(b.expiry) - Date.parse(today)) / 86_400_000);
                  return (
                    <TR key={b.batch_no}>
                      <TD><span className="tnum font-mono text-label font-medium text-ink">{b.batch_no}</span></TD>
                      <TD>
                        <span className="text-label text-ink-2">{formatDate(b.expiry, "long")}</span>
                        {days < 0 && <Badge tone="critical" size="sm" className="ml-2">Expired</Badge>}
                        {days >= 0 && days <= alertDays && <Badge tone="warn" size="sm" className="ml-2">Expiring soon</Badge>}
                      </TD>
                      <TD align="right"><span className="tnum font-mono text-label text-ink">{b.qty} {item.unit}</span></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </div>

      <div>
        <Legend>Movements</Legend>
        {movements.length === 0 ? (
          <p className="rounded-[var(--r)] border border-dashed border-line-strong px-3 py-4 text-center text-label text-ink-3">
            Nothing has moved in or out of this line yet.
          </p>
        ) : (
          <TableWrap maxHeight="20rem">
            <Table>
              <THead sticky>
                <tr><TH>When</TH><TH>Type</TH><TH>Batch</TH><TH>For</TH><TH align="right">Quantity</TH></tr>
              </THead>
              <TBody>
                {movements.map((x) => (
                  <TR key={x.id}>
                    <TD><span className="tnum whitespace-nowrap text-label text-ink-2">{formatStamp(x.at)}</span></TD>
                    <TD>
                      <span className="block text-label text-ink-2">{TX_LABEL[x.type]}</span>
                      {x.note && <span className="block text-caption text-ink-3">{x.note}</span>}
                    </TD>
                    <TD><span className="tnum font-mono text-label text-ink-2">{x.batch_no}</span></TD>
                    <TD><StockReference tx={x} /></TD>
                    <TD align="right">
                      <span className={`tnum font-mono font-medium ${x.qty >= 0 ? "text-ok-text" : "text-ink"}`}>
                        {x.qty > 0 ? `+${x.qty}` : `−${Math.abs(x.qty)}`}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </div>
    </div>
  );
}
