import type {
  Appointment, Encounter, FieldDefinition, InventoryBatch, InventoryItem,
  InventoryTransaction, Invoice, LabOrder, Prescription, QueueEntry, Tenant,
  TenantConfig, User, Id,
} from "@/lib/types";

/**
 * A snapshot of what this clinic has loaded, and pure reads over it.
 *
 * These are derivations the UI wants across collections it is already holding —
 * a stock level from the ledger, an invoice total from its lines. Anything that
 * would need rows the client has no business holding (counting the register,
 * composing a patient's history, ranking diagnoses) is a request instead: see
 * `GET /analytics/dashboard` and `GET /patients/{id}/history`.
 *
 * Every read is still tenant-scoped explicitly, mirroring §3.15 — nothing reads
 * a collection without passing the tenant it belongs to.
 */
export interface Db {
  tenants: Tenant[];
  users: User[];
  fieldDefinitions: FieldDefinition[];
  appointments: Appointment[];
  queue: QueueEntry[];
  encounters: Encounter[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
  inventoryItems: InventoryItem[];
  inventoryBatches: InventoryBatch[];
  inventoryTx: InventoryTransaction[];
  invoices: Invoice[];
  tenantConfigs: TenantConfig[];
}

const byTenant = <T extends { tenant_id: Id }>(rows: T[], t: Id) => rows.filter((r) => r.tenant_id === t);

export const selectUsers = (db: Db, t: Id) => byTenant(db.users, t);
export const selectDoctors = (db: Db, t: Id) => byTenant(db.users, t).filter((u) => u.role === "doctor");
export const selectAppointments = (db: Db, t: Id) => byTenant(db.appointments, t);
export const selectQueue = (db: Db, t: Id) => byTenant(db.queue, t);
export const selectEncounters = (db: Db, t: Id) => byTenant(db.encounters, t);
export const selectPrescriptions = (db: Db, t: Id) => byTenant(db.prescriptions, t);
export const selectLabOrders = (db: Db, t: Id) => byTenant(db.labOrders, t);
export const selectInventoryItems = (db: Db, t: Id) => byTenant(db.inventoryItems, t);
export const selectInventoryTx = (db: Db, t: Id) => byTenant(db.inventoryTx, t);
export const selectInvoices = (db: Db, t: Id) => byTenant(db.invoices, t);

/** §3.3 — how this clinic has configured the product. */
export function tenantConfig(db: Db, t: Id): TenantConfig {
  return db.tenantConfigs.find((c) => c.tenant_id === t) ?? defaultConfig(t);
}

export function defaultConfig(tenantId: Id, prefix = "AS"): TenantConfig {
  return {
    tenant_id: tenantId,
    contact_phone: "", contact_email: "", address: "",
    mrn_prefix: prefix, day_start: "09:00", day_end: "17:30",
    slot_minutes: 30, default_duration: 30,
    appointment_types: [
      { id: "consultation", name: "Consultation", minutes: 30 },
      { id: "follow-up", name: "Follow-up", minutes: 15 },
    ],
    token_prefix: prefix.slice(0, 1), urgent_first: true,
    invoice_prefix: `${prefix}-INV`, tax_pct: 0, payment_terms_days: 14, currency: "INR",
    expiry_alert_days: 90, has_logo: false,
  };
}

export const findEncounter = (db: Db, t: Id, id: Id) =>
  db.encounters.find((e) => e.id === id && e.tenant_id === t);
export const findInvoice = (db: Db, t: Id, id: Id) =>
  db.invoices.find((i) => i.id === id && i.tenant_id === t);

export const userName = (db: Db, id: Id | null | undefined) =>
  db.users.find((u) => u.id === id)?.name ?? "—";

/* ---- inventory ledger (§3.11) -------------------------------------------- */

export function stockLevel(db: Db, tenantId: Id, itemId: Id) {
  return selectInventoryTx(db, tenantId)
    .filter((tx) => tx.item_id === itemId)
    .reduce((sum, tx) => sum + tx.qty, 0);
}

export function batchesFor(db: Db, itemId: Id) {
  return db.inventoryBatches.filter((b) => b.item_id === itemId);
}

export function nearExpiry(db: Db, tenantId: Id, today: string, withinDays = 90) {
  const items = selectInventoryItems(db, tenantId);
  const ids = new Set(items.map((i) => i.id));
  return db.inventoryBatches
    .filter((b) => ids.has(b.item_id))
    .map((b) => ({
      ...b,
      item: items.find((i) => i.id === b.item_id)!,
      daysLeft: Math.round((Date.parse(b.expiry) - Date.parse(today)) / 86_400_000),
    }))
    .filter((b) => b.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function lowStock(db: Db, tenantId: Id) {
  return selectInventoryItems(db, tenantId)
    .map((item) => ({ item, level: stockLevel(db, tenantId, item.id) }))
    .filter((r) => r.level <= r.item.reorder_level)
    .sort((a, b) => a.level / a.item.reorder_level - b.level / b.item.reorder_level);
}

/* ---- invoice maths (§3.12) ----------------------------------------------- */

export function invoiceTotals(inv: Invoice) {
  const subtotal = inv.line_items.reduce((s, li) => s + li.qty * li.unit_price, 0);
  const tax = inv.line_items.reduce((s, li) => s + (li.qty * li.unit_price * li.tax_pct) / 100, 0);
  const total = subtotal + tax;
  const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
  return { subtotal, tax, total, paid, balance: Math.max(0, total - paid) };
}

export function invoiceStatusFor(inv: Invoice): Invoice["status"] {
  if (inv.status === "void" || inv.status === "draft") return inv.status;
  const { total, paid } = invoiceTotals(inv);
  if (paid <= 0) return "issued";
  if (paid + 0.005 < total) return "partially_paid";
  return "paid";
}
