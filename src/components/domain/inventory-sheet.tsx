"use client";

import * as api from "@/lib/api";
import { SheetExportButton, SheetImportButton, type SheetSource } from "@/components/domain/sheet-io";
import { IconBox } from "@/components/ui/icons";

/* ==========================================================================
   Stock lines in and out of a spreadsheet — see `sheet-io.tsx` for how.

   A row is matched on its SKU: a known code updates the line, a new one opens
   it, and a quantity received goes on the ledger as a purchase. The export is
   in the import's own layout — export, change the prices, import it back, and
   every line is updated in one go; its quantity column is empty, so doing
   that adds no stock.
   ========================================================================== */

const INVENTORY: SheetSource = {
  noun: "inventory",
  title: "Import stock",
  subtitle: "Nothing is saved unless every row passes.",
  itemLabel: "Item",
  icon: <IconBox size={20} />,
  template: api.inventoryImportTemplate,
  exportSheet: api.exportInventory,
  start: api.startInventoryImport,
  get: api.getInventoryImport,
  latest: api.latestInventoryImport,
  summary: ({ created, updated, stocked }) => {
    const parts = [created && `${created} added`, updated && `${updated} updated`].filter(Boolean);
    return {
      title: `Imported — ${parts.join(", ") || "no changes"}`,
      body: stocked ? `Stock added to ${stocked} ${stocked === 1 ? "item" : "items"}.` : undefined,
    };
  },
};

export function InventoryImportButton() {
  return <SheetImportButton source={INVENTORY} />;
}

export function InventoryExportButton() {
  return <SheetExportButton source={INVENTORY} />;
}
