"use client";

import * as React from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb } from "@/lib/query/hooks";
import { selectLabOrders, selectPrescriptions } from "@/lib/data/repository";
import type { InventoryTransaction } from "@/lib/types";

/**
 * What a stock movement was for, in words.
 *
 * The ledger stores a reference as a type and a row id, and printing that —
 * "prescription:5285011f-8b2c-…" — tells a pharmacist nothing. A dispense
 * names the patient it was dispensed to; a purchase or a manual count says
 * which it was.
 */
export function StockReference({ tx }: { tx: InventoryTransaction }) {
  const { session } = useApp();
  const db = useClinicDb();

  if (tx.ref_type === "prescription" && tx.ref_id) {
    const rx = selectPrescriptions(db, session.tenantId).find((p) => p.id === tx.ref_id);
    return rx ? (
      <span className="text-label text-ink-2">
        Prescription for{" "}
        <Link href={`/patients/${rx.patient_id}`} className="text-ink hover:text-accent-text hover:underline">
          {rx.patient_name}
        </Link>
      </span>
    ) : <span className="text-label text-ink-2">Prescription</span>;
  }
  if (tx.ref_type === "lab_order" && tx.ref_id) {
    const order = selectLabOrders(db, session.tenantId).find((o) => o.id === tx.ref_id);
    return <span className="text-label text-ink-2">{order ? `Lab order for ${order.patient_name}` : "Lab order"}</span>;
  }
  if (tx.ref_type === "purchase_order") return <span className="text-label text-ink-2">Purchase order</span>;
  if (tx.ref_type === "manual") return <span className="text-label text-ink-2">Manual entry</span>;
  return <span className="text-label text-ink-3">—</span>;
}
