/* ==========================================================================
   Domain types — mirror the entities in pms-end-to-flow.md §2, and the JSON
   the API returns, field for field.

   Ids are opaque strings: the server mints UUIDs, and nothing above this file
   ever looks inside one. Note what is absent — no password, and no password
   hash. Those never leave the server.
   ========================================================================== */

export type Id = string;

export type ClinicalTypeKey = "dental" | "ophthalmology" | "dermatology";

export type FeatureKey =
  | "patient" | "appointment" | "queue" | "consultation" | "prescription"
  | "billing" | "pharmacy" | "lab" | "inventory" | "advanced_reports";

export type Role = "tenant_admin" | "receptionist" | "doctor" | "pharmacist" | "lab_tech";

/**
 * Platform staff sit above every tenant. They are deliberately a separate table
 * from `User`: a super admin has no tenant_id and never appears in a clinic.
 */
export interface PlatformUser {
  id: Id;
  name: string;
  email: string;
  initials: string;
  title: string;
}

/**
 * Per-tenant configuration (§3.3). Distinct from entitlements: this is how a
 * clinic has set the product up, not what it is allowed to use.
 */
export interface TenantConfig {
  tenant_id: Id;
  /* identity */
  contact_phone: string;
  contact_email: string;
  address: string;
  /* records */
  mrn_prefix: string;
  /* appointments */
  day_start: string;
  day_end: string;
  slot_minutes: 15 | 20 | 30;
  default_duration: number;
  /* queue */
  token_prefix: string;
  urgent_first: boolean;
  /* billing */
  invoice_prefix: string;
  tax_pct: number;
  payment_terms_days: number;
  currency: "GBP" | "EUR" | "USD" | "INR";
}

export interface ClinicalType {
  key: ClinicalTypeKey;
  label: string;
  /** what the clinical_ext payload is called in this discipline */
  examLabel: string;
  blurb: string;
  /** a realistic presenting complaint, used as form placeholder text */
  complaintExample: string;
}

export interface Feature {
  key: FeatureKey;
  name: string;
  is_core: boolean;
  summary: string;
  price_monthly: number;
  /** modules this one lights up in the nav */
  unlocks: string[];
}

export type TenantFeatureStatus = "active" | "inactive" | "trial";

export interface TenantFeature {
  tenant_id: Id;
  feature_key: FeatureKey;
  status: TenantFeatureStatus;
  activated_at: string | null;
}

export interface Tenant {
  id: Id;
  name: string;
  /** the subdomain this clinic is served on — unique across the platform */
  slug: string;
  clinical_type: ClinicalTypeKey;
  status: "trial" | "active" | "suspended";
  city: string;
  plan: string;
  since: string;
  /** the clinic's own zone, and its own date — never the browser's */
  timezone: string;
  today: string;
}

export type FieldScope = "common" | "clinical_type" | "tenant";
export type FieldEntity = "patient" | "encounter";
export type FieldType =
  | "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "boolean" | "phone" | "email";

export interface FieldDefinition {
  id: Id;
  scope: FieldScope;
  /** null when scope === "common" */
  clinical_type: ClinicalTypeKey | null;
  /** null unless scope === "tenant" */
  tenant_id: Id | null;
  entity: FieldEntity;
  field_key: string;
  label: string;
  type: FieldType;
  required: boolean;
  order: number;
  options?: string[];
  help?: string;
  /** layout hint for the dynamic form renderer */
  span?: 1 | 2;
  group?: string;
}

export type AccountStatus = "active" | "invited" | "locked";

export interface User {
  id: Id;
  tenant_id: Id;
  name: string;
  role: Role;
  /** the username half of the credential — unique within a tenant */
  email: string;
  initials: string;
  speciality?: string;
  status: AccountStatus;
  /** consecutive failed sign-ins; five locks the account */
  failed_attempts: number;
  last_sign_in: string | null;
}

export interface Patient {
  id: Id;
  tenant_id: Id;
  mrn: string;
  full_name: string;
  dob: string;
  sex: "female" | "male" | "other";
  phone: string;
  email?: string;
  address?: string;
  blood_group?: string;
  allergies?: string;
  registered_at: string;
  last_visit: string | null;
  clinical_ext: Record<string, unknown>;
  tags?: string[];
}

export type AppointmentStatus = "scheduled" | "checked_in" | "cancelled" | "no_show" | "completed";

export interface Appointment {
  id: Id;
  tenant_id: Id;
  patient_id: Id;
  /** the patient's name, carried on the row so a list needs no register */
  patient_name: string;
  patient_mrn: string;
  doctor_id: Id;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** HH:mm, 24h */
  time: string;
  duration_min: number;
  reason: string;
  status: AppointmentStatus;
  created_via: "front_desk" | "online" | "phone";
}

/**
 * What a client sends to book one. The server decides the id, the tenant and
 * the status, and fills in the patient's name from the patient it points at —
 * so none of those are ours to send.
 */
export type NewAppointment = Omit<
  Appointment, "id" | "tenant_id" | "status" | "patient_name" | "patient_mrn"
>;

export type QueueStatus = "waiting" | "called" | "in_consultation" | "completed" | "no_show" | "cancelled";

export interface QueueEntry {
  id: Id;
  tenant_id: Id;
  patient_id: Id;
  /** the patient's name, carried on the row so a list needs no register */
  patient_name: string;
  patient_mrn: string;
  appointment_id: Id | null;
  doctor_id: Id;
  token_no: number;
  status: QueueStatus;
  checked_in_at: string;
  called_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  priority: "routine" | "urgent";
  reason: string;
  /** the day this token belongs to; tokens restart at 1 each morning */
  queue_date: string;
}

export interface Encounter {
  id: Id;
  tenant_id: Id;
  patient_id: Id;
  /** the patient's name, carried on the row so a list needs no register */
  patient_name: string;
  patient_mrn: string;
  queue_entry_id: Id | null;
  doctor_id: Id;
  date: string;
  chief_complaint: string;
  notes: string;
  diagnosis: string;
  follow_up_days: number | null;
  clinical_ext: Record<string, unknown>;
  status: "draft" | "signed";
}

/** As above: the server owns the id, the tenant, the status and the name. */
export type NewEncounter = Omit<
  Encounter, "id" | "tenant_id" | "status" | "patient_name" | "patient_mrn"
>;

export type PrescriptionItemStatus = "pending" | "partially_dispensed" | "dispensed";

export interface PrescriptionItem {
  id: Id;
  prescription_id: Id;
  item_id: Id | null;
  medicine: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
  qty: number;
  dispensed_qty: number;
  status: PrescriptionItemStatus;
}

export type PrescriptionStatus = "pending" | "partially_dispensed" | "dispensed";

export interface Prescription {
  id: Id;
  tenant_id: Id;
  encounter_id: Id;
  patient_id: Id;
  /** the patient's name, carried on the row so a list needs no register */
  patient_name: string;
  patient_mrn: string;
  doctor_id: Id;
  created_at: string;
  status: PrescriptionStatus;
  items: PrescriptionItem[];
}

export type LabOrderStatus = "ordered" | "pending" | "resulted" | "verified";

export interface LabResultLine {
  analyte: string;
  value: string;
  unit: string;
  reference: string;
  flag: "normal" | "high" | "low";
}

export interface LabOrder {
  id: Id;
  tenant_id: Id;
  encounter_id: Id;
  patient_id: Id;
  /** the patient's name, carried on the row so a list needs no register */
  patient_name: string;
  patient_mrn: string;
  ordered_by: Id;
  test_code: string;
  test_name: string;
  panel: string;
  status: LabOrderStatus;
  ordered_at: string;
  resulted_at?: string | null;
  verified_at?: string | null;
  verified_by?: Id | null;
  results: LabResultLine[];
  note?: string;
}

export type InventoryTxType = "purchase" | "dispense" | "return" | "adjustment" | "expiry" | "transfer";

export interface InventoryItem {
  id: Id;
  tenant_id: Id;
  sku: string;
  name: string;
  form: string;
  strength: string;
  unit: string;
  category: "medicine" | "consumable" | "implant" | "lens" | "reagent";
  reorder_level: number;
  unit_price: number;
}

export interface InventoryBatch {
  batch_no: string;
  item_id: Id;
  expiry: string;
  qty: number;
}

export interface InventoryTransaction {
  id: Id;
  tenant_id: Id;
  item_id: Id;
  type: InventoryTxType;
  qty: number;
  batch_no: string;
  at: string;
  ref_type: "prescription" | "purchase_order" | "manual" | "lab_order" | null;
  ref_id: Id | null;
  note?: string;
  actor_id: Id;
}

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

export interface InvoiceLineItem {
  id: Id;
  description: string;
  source: "consultation" | "procedure" | "pharmacy" | "lab" | "manual";
  qty: number;
  unit_price: number;
  tax_pct: number;
}

export interface Payment {
  id: Id;
  invoice_id: Id;
  amount: number;
  method: "cash" | "card" | "upi" | "insurance";
  at: string;
  reference?: string;
}

export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
}

export interface Invoice {
  id: Id;
  tenant_id: Id;
  patient_id: Id;
  /** the patient's name, carried on the row so a list needs no register */
  patient_name: string;
  patient_mrn: string;
  encounter_id: Id | null;
  number: string;
  status: InvoiceStatus;
  issued_at: string;
  due_at: string;
  line_items: InvoiceLineItem[];
  payments: Payment[];
  /** the server's arithmetic, so a client never has to agree with it */
  totals?: InvoiceTotals;
}

/* ---- history composition (§3.13) ---------------------------------------- */

export type HistoryKind =
  | "appointment" | "queue" | "encounter" | "prescription"
  | "lab" | "dispense" | "invoice" | "payment" | "registration";

export interface HistoryEvent {
  id: string;
  kind: HistoryKind;
  at: string;
  title: string;
  detail: string;
  meta?: string;
  href?: string;
  tone?: "accent" | "ok" | "warn" | "critical" | "info" | "neutral";
}
