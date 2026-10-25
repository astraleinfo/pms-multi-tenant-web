/* ==========================================================================
   Domain types — mirror the entities in pms-end-to-flow.md §2, and the JSON
   the API returns, field for field.

   Ids are opaque strings: the server mints UUIDs, and nothing above this file
   ever looks inside one. Note what is absent — no password, and no password
   hash. Those never leave the server.
   ========================================================================== */

export type Id = string;

export type ClinicalTypeKey = "dental" | "ophthalmology" | "dermatology";

/**
 * The PMS modules. Every clinic has every one of them — there is no per-clinic
 * switch, price or trial. A key is only a name for copy and illustrations.
 */
export type ModuleKey =
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

/** A kind of visit, and how long it takes — which is also its slot interval. */
export interface AppointmentType {
  id: string;
  name: string;
  minutes: number;
}

/**
 * Per-tenant configuration (§3.3): how a clinic has set the product up. It
 * shapes behaviour inside modules and never hides one.
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
  /** the kinds of visit the diary books, in the order it offers them */
  appointment_types: AppointmentType[];
  /* queue */
  token_prefix: string;
  urgent_first: boolean;
  /* billing */
  invoice_prefix: string;
  tax_pct: number;
  payment_terms_days: number;
  currency: "GBP" | "EUR" | "USD" | "INR";
  /* inventory */
  expiry_alert_days: number;
  /** whether the clinic has uploaded its own logo — the image itself is a
   *  separate request, so this page's data never carries the bytes. */
  has_logo: boolean;
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

/** What a module is — the copy the product ships with. */
export interface ModuleInfo {
  key: ModuleKey;
  name: string;
  summary: string;
}

/* ---- support desk ----------------------------------------------------------- */

export type SupportRequestKind = "walkthrough" | "general";
/** Whether the desk has been emailed. The request stands either way. */
export type SupportRequestStatus = "queued" | "sent" | "failed";

export type LinkEmailStatus = "queued" | "sent" | "failed";

export interface SupportRequest {
  id: Id;
  tenant_id: Id;
  kind: SupportRequestKind;
  message: string;
  /** "Name <email>" of whoever asked */
  requested_by: string;
  status: SupportRequestStatus;
  /** `YYYY-MM-DD HH:mm`, clinic time */
  created_at: string | null;
  sent_at: string | null;
  /** failed, or still queued well after its hand-off — the desk can send it again */
  retryable: boolean;
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
  /** on hold for an unpaid subscription bill: staff see the bill and nothing else */
  billing_hold?: boolean;
  billing_hold_since?: string | null;
  /** never billed by the platform */
  billing_exempt?: boolean;
  /** NULL until the clinic mints one from its own Settings */
  referral_code?: string | null;
}

/* ---- the platform's monthly bill to a clinic ---------------------------------- */

export type SubscriptionInvoiceStatus = "open" | "paid" | "void";

export interface SubscriptionInvoice {
  id: Id;
  tenant_id: Id;
  number: string;
  period_start: string;
  period_end: string;
  currency: string;
  amount: number;
  lines: { name: string; amount: number }[];
  issued_on: string;
  due_on: string;
  /** the first day the clinic is held if this is still open */
  hold_on: string;
  status: SubscriptionInvoiceStatus;
  /** the furthest reminder emailed so far */
  reminder_stage: "none" | "issued" | "due_soon" | "due" | "overdue" | "final" | "blocked";
  reminders_sent: number;
  paid_at: string | null;
  payment_reference: string;
  settled_by: string;
}

export interface SubscriptionSummary {
  on_hold: boolean;
  hold_since: string | null;
  exempt: boolean;
  currency: string;
  outstanding: number;
  open_count: number;
  next_due_on: string | null;
  next_hold_on: string | null;
  overdue: boolean;
  due_days: number;
  grace_days: number;
}

/** Why a clinic's next bill does not charge the fee. */
export type NotBilledReason = "exempt" | "trial" | "suspended" | "no_fee";

/**
 * What the clinic pays the platform: one flat monthly fee, the same for every
 * clinic, for the whole product. There is nothing per module to list.
 */
export interface SubscriptionPlan {
  /** the platform's monthly fee today */
  price_monthly: number;
  /** whether next month's bill charges it */
  billed: boolean;
  not_billed_reason: NotBilledReason | null;
  /** the fee, or 0, before any referral credit */
  monthly_total: number;
  /** spendable referral credit right now */
  credit_balance: number;
  /** what the next bill will actually come to, after credit */
  amount_due: number;
}

export interface Subscription {
  summary: SubscriptionSummary;
  invoices: SubscriptionInvoice[];
  plan: SubscriptionPlan | null;
}

/* ---- referral credits ---------------------------------------------------- */

export type ReferralStatus = "pending" | "vested" | "void";

export interface Referral {
  id: Id;
  referred_tenant_name: string;
  code_used: string;
  credit_amount: number;
  currency: string;
  status: ReferralStatus;
  created_at: string;
  vested_at: string | null;
}

export interface ReferralProgram {
  code: string | null;
  formatted_code: string | null;
  credit_amount: number;
  currency: string;
  balance: number;
  referrals: Referral[];
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
  /** This doctor's own consultation fee; `null`/unset means bill the clinic default. */
  consultation_fee?: number | null;
  status: AccountStatus;
  /** consecutive failed sign-ins; five locks the account */
  failed_attempts: number;
  last_sign_in: string | null;
  /**
   * They are using a password somebody else chose — an admin typed it at the
   * desk. Sign-in works, but the session is good for one thing until they
   * replace it.
   */
  must_change_password?: boolean;
  /** No password at all: their "set your password" link is still outstanding. */
  invitation_pending?: boolean;
  /** The newest invitation or reset email, which the worker sends: null when none was asked for. */
  link_email_status?: LinkEmailStatus | null;
  /** failed, or still queued well after its hand-off — offer Resend */
  link_email_retryable?: boolean;
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

export type AppointmentStatus =
  | "scheduled" | "confirmed" | "checked_in" | "cancelled" | "no_show" | "completed";

/** Bookings still going to happen — the ones that can be checked in, moved or rung about. */
export const BOOKED_STATUSES: readonly AppointmentStatus[] = ["scheduled", "confirmed"];
export const isBooked = (status: AppointmentStatus) => BOOKED_STATUSES.includes(status);

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

/**
 * A clinician's note on a patient. Never edited: a mistake is put right by a
 * correction — another note naming this one in `amends_id`, by the same author.
 */
export interface PatientNote {
  id: Id;
  patient_id: Id;
  body: string;
  author_id: Id | null;
  author_name: string;
  /** the author's role when they wrote it */
  author_role: Role | string;
  /** `YYYY-MM-DD HH:mm`, clinic time */
  created_at: string;
  amends_id?: Id | null;
}

/** What came of one call. `rescheduled` is a reschedule booked on the call itself. */
export type FollowUpOutcome =
  | "confirmed" | "reschedule_required" | "rescheduled" | "no_answer" | "declined" | "call_back";

/** Where a follow-up stands — worked out on the server from the booking and its last call. */
export type FollowUpStatus =
  | "pending" | "confirmed" | "reschedule_required" | "no_answer" | "declined" | "call_back";

export interface FollowUpCall {
  id: Id;
  appointment_id: Id;
  outcome: FollowUpOutcome;
  notes: string;
  called_by_id: Id | null;
  called_by_name: string;
  /** `YYYY-MM-DD HH:mm`, clinic time */
  called_at: string;
  /** only on a call that moved the booking — `YYYY-MM-DD HH:mm` */
  moved_from?: string | null;
  moved_to?: string | null;
}

/** One booking on the call list. */
export interface FollowUp {
  appointment: Appointment;
  patient_phone: string;
  status: FollowUpStatus;
  attempts: number;
  last_call: FollowUpCall | null;
}

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

/** A file filed against a lab order — what it is, not what is in it. */
export interface LabAttachment {
  id: Id;
  lab_order_id: Id;
  filename: string;
  content_type: string;
  size_bytes: number;
  note?: string | null;
  uploaded_at: string;
  uploaded_by?: Id | null;
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

/**
 * How a stock line's selling price was arrived at.
 *
 * `price` — the figure typed is the figure charged.
 * `percent` — cost plus `margin_pct`.
 * `mrp` — the printed price, less `margin_pct` as a discount.
 *
 * Whichever it is, `unit_price` is the answer; the server does the arithmetic
 * so two clients can never disagree about it.
 */
export type PricingMode = "price" | "percent" | "mrp";

export type InventoryCategory = "medicine" | "consumable" | "implant" | "lens" | "reagent";

export interface InventoryItem {
  id: Id;
  tenant_id: Id;
  sku: string;
  name: string;
  form: string;
  strength: string;
  unit: string;
  category: InventoryCategory;
  reorder_level: number;
  /** what one unit bills at, however it was decided */
  unit_price: number;
  /** what one unit cost to buy */
  cost_price: number;
  /** the printed maximum retail price, where the pack carries one */
  mrp: number;
  /** margin over cost, or discount off MRP, depending on the mode */
  margin_pct: number;
  pricing_mode: PricingMode;
  manufacturer: string;
  description: string;
  hsn_code: string;
}

/** What opens a new stock line. The server owns the id and the tenant. */
export interface NewInventoryItem {
  sku: string;
  name: string;
  form?: string;
  strength?: string;
  unit?: string;
  category: InventoryCategory;
  reorder_level?: number;
  unit_price?: number;
  cost_price?: number;
  mrp?: number;
  margin_pct?: number;
  pricing_mode?: PricingMode;
  manufacturer?: string;
  description?: string;
  hsn_code?: string;
}

/** What may be changed about one. Everything sent is what changes. */
export type InventoryItemPatch = Partial<NewInventoryItem>;

/* ---- the tariff (§3.12) --------------------------------------------------
   What this clinic charges for everything that is not stock. Set by the
   practice admin, read by the composer — so a scan can carry its own amount
   and no price is a number in the code. */

export type ServiceKind = "consultation" | "procedure" | "lab" | "other";

export interface ServicePrice {
  id: Id;
  tenant_id: Id;
  kind: ServiceKind;
  /** the lab test code for a lab price; a slug the admin chose otherwise */
  code: string;
  name: string;
  price: number;
  tax_pct: number;
  active: boolean;
  note?: string | null;
}

export interface NewServicePrice {
  kind: ServiceKind;
  code: string;
  name: string;
  price: number;
  tax_pct?: number;
  active?: boolean;
  note?: string | null;
}

export type ServicePricePatch = Partial<Omit<NewServicePrice, "kind" | "code">>;

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

export type LineItemSource = "consultation" | "procedure" | "pharmacy" | "lab" | "manual";

export interface InvoiceLineItem {
  id: Id;
  description: string;
  source: LineItemSource;
  qty: number;
  unit_price: number;
  tax_pct: number;
  /** the row this line bills for — a prescription item, a lab order, an
   *  encounter. `source` says which. It is what stops the same charge being
   *  billed twice. */
  ref_id?: Id | null;
}

/**
 * Something the patient has had that no invoice covers yet.
 *
 * Worked out on the server from what the clinic already recorded — medicine
 * handed over, tests ordered, consultations held — minus whatever an invoice
 * line already points at.
 */
export interface Charge {
  source: LineItemSource;
  department: BillingDepartment;
  description: string;
  qty: number;
  unit_price: number;
  tax_pct: number;
  ref_id: Id;
  /** false when the clinic's tariff has nothing for it, so it reads as zero */
  priced: boolean;
  total: number;
}

/** What one counter is owed, and what it has not billed yet. */
export interface DepartmentAccount {
  department: BillingDepartment;
  /** on invoices already raised */
  outstanding: number;
  /** not on an invoice yet */
  unbilled_total: number;
  /** what the counter would ask for right now */
  due: number;
  /** what it has already taken — which is why that money is not in `due` */
  paid: number;
  unbilled: Charge[];
  invoices: Invoice[];
}

/** A patient's account across all three counters. */
export interface PatientAccount {
  patient_id: Id;
  patient_name: string;
  patient_mrn: string;
  departments: Record<BillingDepartment, DepartmentAccount>;
  total_due: number;
}

/**
 * A line the visit implies, priced from the clinic's tariff.
 *
 * `priced` is false when nothing in the tariff covers it — the composer says
 * so rather than quietly suggesting zero.
 */
export interface SuggestedLine {
  description: string;
  source: LineItemSource;
  department: BillingDepartment;
  qty: number;
  unit_price: number;
  tax_pct: number;
  priced: boolean;
  /** what the line bills for; sent back on the invoice, it marks it billed */
  ref_id?: Id | null;
}

/**
 * A line already invoiced (and possibly paid) through the pharmacy-counter or
 * department-account flow — surfaced so the composer can avoid re-billing it
 * silently.
 */
export interface AlreadyBilledLine {
  description: string;
  source: LineItemSource;
  department: BillingDepartment;
  qty: number;
  unit_price: number;
  tax_pct: number;
  invoices: Array<{ invoice_number: string; invoice_status: string; qty: number }>;
}

export interface SuggestedLinesResponse {
  lines: SuggestedLine[];
  already_billed: AlreadyBilledLine[];
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

/**
 * Which counter raised an invoice. The lab and the pharmacy bill separately
 * from the clinic, so one visit can produce three.
 */
export type BillingDepartment = "clinic" | "lab" | "pharmacy";

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
  department: BillingDepartment;
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
