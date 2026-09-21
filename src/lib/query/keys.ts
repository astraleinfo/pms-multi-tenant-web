import type { FieldDefinition, Id } from "@/lib/types";

/**
 * Query keys. Everything a clinic owns hangs off `["tenant", tenantId]`, so a
 * mutation that touches several collections can invalidate the whole subtree
 * with one call and nothing else is disturbed.
 *
 * The console gets the same treatment one level up: everything it reads across
 * clinics hangs off `["platform"]`, so granting a module refreshes the snapshot
 * and that clinic's entitlement rows together rather than leaving the console
 * showing two different answers.
 */
export const qk = {
  tenants: () => ["tenants"] as const,
  hostTenant: (slug: string) => ["host-tenant", slug] as const,
  /** the whole console subtree — what a platform write invalidates */
  platformRoot: () => ["platform"] as const,
  platform: () => ["platform", "snapshot"] as const,
  /** one clinic as the console sees it, not as the clinic sees itself */
  platformFeatures: (t: Id) => ["platform", "tenants", t, "features"] as const,
  platformUsers: (t: Id) => ["platform", "tenants", t, "users"] as const,
  tenant: (t: Id) => ["tenant", t] as const,

  users: (t: Id) => ["tenant", t, "users"] as const,
  doctors: (t: Id) => ["tenant", t, "users", "doctors"] as const,
  features: (t: Id) => ["tenant", t, "features"] as const,
  config: (t: Id) => ["tenant", t, "config"] as const,
  fields: (t: Id) => ["tenant", t, "fields"] as const,
  schema: (t: Id, entity: FieldDefinition["entity"], clinicalType: string) =>
    ["tenant", t, "fields", "schema", entity, clinicalType] as const,
  medicines: (t: Id) => ["tenant", t, "catalog", "medicines"] as const,

  patients: (t: Id) => ["tenant", t, "patients"] as const,
  /** The key carries the query, so every page and search is its own cache entry
      and going back to page 1 is instant. */
  patientPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "patients", "page", query] as const,
  patientSearch: (t: Id, term: string) => ["tenant", t, "patients", "search", term] as const,
  patient: (t: Id, id: Id) => ["tenant", t, "patients", id] as const,
  patientHistory: (t: Id, id: Id) => ["tenant", t, "patients", id, "history"] as const,

  appointments: (t: Id) => ["tenant", t, "appointments"] as const,
  /** Each page and search is its own cache entry, so going back a page is
      instant and a write still invalidates the whole clinic subtree. */
  appointmentPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "appointments", "page", query] as const,
  queue: (t: Id) => ["tenant", t, "queue"] as const,
  encounters: (t: Id) => ["tenant", t, "encounters"] as const,
  encounterPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "encounters", "page", query] as const,
  encounter: (t: Id, id: Id) => ["tenant", t, "encounters", id] as const,

  prescriptions: (t: Id) => ["tenant", t, "prescriptions"] as const,
  prescriptionPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "prescriptions", "page", query] as const,
  labOrders: (t: Id) => ["tenant", t, "lab-orders"] as const,
  labOrderPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "lab-orders", "page", query] as const,
  labOrder: (t: Id, id: Id) => ["tenant", t, "lab-orders", id] as const,
  labAttachments: (t: Id, orderId: Id) =>
    ["tenant", t, "lab-orders", orderId, "attachments"] as const,

  inventoryItems: (t: Id) => ["tenant", t, "inventory", "items"] as const,
  inventoryTx: (t: Id) => ["tenant", t, "inventory", "tx"] as const,
  inventoryBatches: (t: Id) => ["tenant", t, "inventory", "batches"] as const,

  invoices: (t: Id) => ["tenant", t, "invoices"] as const,
  invoicePage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "invoices", "page", query] as const,
  invoice: (t: Id, id: Id) => ["tenant", t, "invoices", id] as const,
  /** What a visit would bill for, as the server prices it. */
  suggestedLines: (t: Id, encounterId: Id) =>
    ["tenant", t, "invoices", "suggestions", encounterId] as const,
  /** What one patient owes each counter, and what nobody has billed yet. */
  patientAccount: (t: Id, patientId: Id) =>
    ["tenant", t, "invoices", "account", patientId] as const,

  /** The tariff — one entry per kind, so the pricing page and the composer
      share a cache without either holding the other's rows. */
  servicePrices: (t: Id, query: Record<string, unknown> = {}) =>
    ["tenant", t, "pricing", "services", query] as const,

  analytics: (t: Id, days: number) => ["tenant", t, "analytics", days] as const,
} as const;
