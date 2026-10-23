import type { FieldDefinition, Id } from "@/lib/types";

/**
 * Query keys. Everything a clinic owns hangs off `["tenant", tenantId]`, so a
 * mutation that touches several collections can invalidate the whole subtree
 * with one call and nothing else is disturbed.
 *
 * The console gets the same treatment one level up: everything it reads across
 * clinics hangs off `["platform"]`, so one console write refreshes every view
 * of the clinics together rather than leaving two different answers on screen.
 */
export const qk = {
  tenants: () => ["tenants"] as const,
  hostTenant: (slug: string) => ["host-tenant", slug] as const,
  /** the whole console subtree — what a platform write invalidates */
  platformRoot: () => ["platform"] as const,
  platform: () => ["platform", "snapshot"] as const,
  platformUsers: (t: Id) => ["platform", "tenants", t, "users"] as const,
  platformSupportRequests: (t: Id) => ["platform", "tenants", t, "support-requests"] as const,
  platformSettings: () => ["platform", "settings"] as const,
  publicSettings: () => ["public", "settings"] as const,
  /** Every clinic's subscription bills, and one clinic's. */
  platformBilling: () => ["platform", "billing"] as const,
  platformSubscription: (t: Id) => ["platform", "tenants", t, "subscription"] as const,
  /** The job monitor. The query is part of the key, so changing a filter is a
      fetch of its own and going back to a previous one is instant. */
  platformJobs: (query: Record<string, unknown>) => ["platform", "jobs", query] as const,
  tenant: (t: Id) => ["tenant", t] as const,

  users: (t: Id) => ["tenant", t, "users"] as const,
  doctors: (t: Id) => ["tenant", t, "users", "doctors"] as const,
  config: (t: Id) => ["tenant", t, "config"] as const,
  logo: (t: Id) => ["tenant", t, "config", "logo"] as const,
  fields: (t: Id) => ["tenant", t, "fields"] as const,
  schema: (t: Id, entity: FieldDefinition["entity"], clinicalType: string) =>
    ["tenant", t, "fields", "schema", entity, clinicalType] as const,
  medicines: (t: Id) => ["tenant", t, "catalog", "medicines"] as const,
  /** What this clinic owes the platform. */
  subscription: (t: Id) => ["tenant", t, "subscription"] as const,
  referrals: (t: Id) => ["tenant", t, "referrals"] as const,

  patients: (t: Id) => ["tenant", t, "patients"] as const,
  /** The key carries the query, so every page and search is its own cache entry
      and going back to page 1 is instant. */
  patientPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "patients", "page", query] as const,
  patientSearch: (t: Id, term: string) => ["tenant", t, "patients", "search", term] as const,
  patient: (t: Id, id: Id) => ["tenant", t, "patients", id] as const,
  consentForms: (t: Id) => ["tenant", t, "consent", "forms"] as const,
  consentForm: (t: Id, id: Id) => ["tenant", t, "consent", "forms", id] as const,
  consentTemplates: (t: Id) => ["tenant", t, "consent", "templates"] as const,
  patientConsents: (t: Id, patientId: Id) => ["tenant", t, "consent", "records", patientId] as const,
  patientConsent: (t: Id, id: Id) => ["tenant", t, "consent", "record", id] as const,
  patientHistory: (t: Id, id: Id) => ["tenant", t, "patients", id, "history"] as const,
  patientNotes: (t: Id, id: Id) => ["tenant", t, "patients", id, "notes"] as const,

  appointments: (t: Id) => ["tenant", t, "appointments"] as const,
  appointment: (t: Id, id: Id) => ["tenant", t, "appointments", "one", id] as const,
  /** Each page and search is its own cache entry, so going back a page is
      instant and a write still invalidates the whole clinic subtree. */
  appointmentPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "appointments", "page", query] as const,
  /** Under the diary's key, so anything that touches a booking refreshes the call list too. */
  followUpPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "appointments", "follow-ups", query] as const,
  followUpCalls: (t: Id, appointmentId: Id) =>
    ["tenant", t, "appointments", "follow-ups", "calls", appointmentId] as const,
  queue: (t: Id) => ["tenant", t, "queue"] as const,
  encounters: (t: Id) => ["tenant", t, "encounters"] as const,
  encounterPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "encounters", "page", query] as const,
  encounter: (t: Id, id: Id) => ["tenant", t, "encounters", id] as const,

  prescriptions: (t: Id) => ["tenant", t, "prescriptions"] as const,
  prescriptionPage: (t: Id, query: Record<string, unknown>) =>
    ["tenant", t, "prescriptions", "page", query] as const,
  prescription: (t: Id, id: Id) => ["tenant", t, "prescriptions", id] as const,
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
