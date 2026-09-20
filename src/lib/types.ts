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
  /* inventory */
  expiry_alert_days: number;
  currency: Currency;
}

/** The four this deployment prices in. Used by both ledgers — the clinic's
    patient invoices and the platform's subscription invoices. */
export type Currency = "GBP" | "EUR" | "USD" | "INR";

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

/* ==========================================================================
   Platform billing (Settings → Billing)

   What the clinic pays *the platform* for the software. Not to be confused
   with everything above it in this file: `Invoice` is the clinic billing a
   patient for a consultation, and the two ledgers share no type, no status
   vocabulary and no endpoint.

   Every figure here is output-only. No request body in `lib/api` carries an
   amount — a plan is chosen by code and priced by the server, and the payment
   call sends three opaque ids and a signature. A price that a browser could
   name is a price a browser could change.
   ========================================================================== */

export type SubscriptionStatus =
  | "pending" | "trialing" | "active" | "past_due" | "paused" | "cancelled" | "expired";

export type SubscriptionInvoiceStatus =
  | "draft" | "issued" | "partially_paid" | "paid" | "void" | "uncollectible";

export type InvoiceItemKind =
  | "base_plan" | "addon" | "proration" | "discount" | "credit" | "tax";

export type SubscriptionPaymentStatus =
  | "created" | "authorised" | "captured" | "failed" | "refunded" | "partially_refunded";

export interface Plan {
  id: Id;
  code: string;
  name: string;
  description: string;
  interval: "monthly" | "yearly";
  amount: number;
  currency: Currency;
  trial_days: number;
  active: boolean;
}

/**
 * One module as the billing screen shows it.
 *
 * Four fields decide what a row says, and the combination people get wrong is
 * the third: `active` with a `cancels_on` means the module is **still on**,
 * still usable and already paid for. Rendering that as "cancelled" would be
 * wrong, and offering "activate" rather than "keep" would imply a charge that
 * is not going to happen.
 */
export interface BillingAddon {
  feature_key: FeatureKey;
  name: string;
  active: boolean;
  /** covered by the base plan — switched on, never invoiced separately */
  included: boolean;
  /** null when included: there is no price to show, and a zero would read as
      "free extra" rather than "part of the plan" */
  monthly_amount: number | null;
  activated_on: string | null;
  /** the day a scheduled cancellation takes effect; null when none is */
  cancels_on: string | null;
  charged_through: string | null;
}

export interface Subscription {
  id: Id;
  status: SubscriptionStatus;
  plan: Plan;
  started_on: string;
  trial_ends_on: string | null;
  cancel_at_cycle_end: boolean;
  cancelled_on: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  /** 28, 29, 30 or 31 — the denominator every proration on screen used */
  current_period_days: number | null;
}

export interface BillingAccount {
  legal_name: string;
  billing_email: string;
  phone: string;
  address: string;
  tax_id: string;
  country: string;
  place_of_supply: string;
  currency: Currency;
}

export interface SubscriptionInvoiceItem {
  kind: InvoiceItemKind;
  description: string;
  /** which module this line is for, or null on the base plan, a discount or
      tax. A cart checkout puts several add-on lines on one invoice, and
      without this they can only be told apart by reading the description. */
  feature_key: FeatureKey | null;
  quantity: number;
  unit_amount: number;
  amount: number;
  period_start: string | null;
  period_end: string | null;
  /** the proration workings: charged days out of the cycle's real length */
  prorated_days: number | null;
  cycle_days: number | null;
  tax_code: string;
  tax_percent: number | null;
}

export interface SubscriptionInvoice {
  id: Id;
  number: string;
  status: SubscriptionInvoiceStatus;
  currency: Currency;
  issued_on: string;
  due_on: string;
  period_start: string;
  /** exclusive — the first day of the next period, not the last of this one */
  period_end: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  paid: number;
  balance: number;
  payment_url: string;
  emailed_at: string | null;
  items: SubscriptionInvoiceItem[];
}

export interface SubscriptionPayment {
  id: Id;
  status: SubscriptionPaymentStatus;
  amount: number;
  amount_refunded: number;
  currency: Currency;
  method: string;
  gateway: string;
  gateway_payment_id: string | null;
  captured_at: string | null;
  failure_reason: string;
}

/** Everything the billing screen renders, in one response. */
export interface BillingSummary {
  subscription: Subscription | null;
  account: BillingAccount;
  addons: BillingAddon[];
  /** what the next invoice comes to before tax, at today's configuration */
  recurring_subtotal: number;
  next_billing_on: string | null;
  outstanding_total: number;
  outstanding_count: number;
  currency: Currency;
}

/**
 * What switching a module on or off actually did.
 *
 * `charged` and `reinstated` are the two answers that surprise people, so the
 * server returns them rather than leaving the screen to infer: activating
 * something you had just cancelled charges nothing, and cancelling charges
 * nothing either.
 */
export interface AddonAction {
  feature_key: FeatureKey;
  active: boolean;
  charged: boolean;
  reinstated: boolean;
  invoice: SubscriptionInvoice | null;
  cancels_on: string | null;
  prorated_days: number | null;
  cycle_days: number | null;
  amount: number | null;
}

/**
 * What a browser is handed to open a payment, and nothing else.
 *
 * `key_id` is the gateway's *public* key — the half Checkout needs. The key
 * secret and the webhook secret have no field here and never leave the server.
 * `amount` is the server's figure, echoed so the widget can display it; it is
 * re-derived and re-checked server-side before any payment is believed.
 */
export interface Checkout {
  gateway: string;
  key_id: string;
  order_id: string;
  amount: number;
  currency: Currency;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  description: string;
}

/* ---- the module catalogue, the cart and checkout -------------------------- */

/**
 * One module as its card and its page show it.
 *
 * `monthly` and `yearly` are null when the catalogue sells nothing at that
 * interval, and that is **not** the same as free. `included` is what free
 * means here: bundled by the base plan, switched on, never invoiced on its
 * own. Rendering a null as 0 would read as "free extra" and be wrong.
 */
export interface ModuleScreenshot {
  url: string;
  alt: string;
  caption?: string;
}

export interface ModuleDocLink {
  label: string;
  url: string;
}

export interface ModuleCard {
  feature_key: FeatureKey;
  name: string;
  summary: string;
  is_core: boolean;

  headline: string;
  long_description: string;
  highlights: string[];
  video_url: string;
  video_poster_url: string;
  video_duration_s: number | null;
  screenshots: ModuleScreenshot[];
  doc_links: ModuleDocLink[];
  category: string;
  badge: string;

  currency: Currency;
  monthly: number | null;
  yearly: number | null;

  included: boolean;
  subscribed: boolean;
  cancels_on: string | null;
  in_cart: boolean;
  purchasable: boolean;
}

export type BillingInterval = "monthly" | "yearly";

/**
 * One module in the cart, priced two ways.
 *
 * `list_amount` is what recurs every cycle; `amount_now` is this payment's
 * share of the cycle already in flight, and is smaller whenever the module is
 * bought partway through one. A screen that showed only one of them would be
 * read as the other — so both are always rendered, with the day count beside
 * the smaller one to explain itself.
 */
export interface CartLine {
  feature_key: FeatureKey;
  name: string;
  interval: BillingInterval;
  list_amount: number;
  amount_now: number;
  prorated_days: number | null;
  cycle_days: number | null;
  reinstated: boolean;
  already_paid: boolean;
  /** why this line cannot be bought, or null — carried per line so the cart
      can show every problem at once rather than failing on the first */
  blocked: string | null;
}

export interface CartQuote {
  lines: CartLine[];
  currency: Currency;
  /** charged now, before tax */
  subtotal: number;
  tax_total: number;
  /** charged now, in full — the figure the payment is for */
  total: number;
  /** what these modules add to every invoice after this one */
  recurring_total: number;
  period_start: string;
  period_end: string;
  purchasable: boolean;
}

/**
 * What a checkout did.
 *
 * `invoice` is null when nothing was owed — every module was free this cycle
 * or already paid for. That is a success, and `reinstated` says which modules
 * came back on without a charge, because "why was I not billed" is the
 * question that follows.
 */
export interface CheckoutResult {
  invoice: SubscriptionInvoice | null;
  activated: FeatureKey[];
  reinstated: FeatureKey[];
}

/* ---- the console's billing metrics --------------------------------------- */

export interface AddonMetric {
  feature_key: FeatureKey;
  name: string;
  active_tenants: number;
  cancelling: number;
  monthly_revenue: number;
  billed_in_window: number;
}

export interface TenantBillingMetric {
  tenant_id: Id;
  name: string;
  slug: string;
  plan: string;
  subscription_status: SubscriptionStatus | "";
  mrr: number;
  revenue: number;
  outstanding: number;
  active_addons: number;
}

/**
 * The console's billing dashboard.
 *
 * Stock figures (`mrr`, `subscriptions_*`, `*_outstanding`) describe the
 * present and ignore the date filter; movement figures (`revenue`,
 * `subscriptions_new`, `payments_*`, `refunds_*`) describe the window. "MRR
 * between March and April" is not a question with an answer, and the API does
 * not pretend otherwise.
 */
export interface BillingMetrics {
  mrr: number;
  arr: number;
  revenue: number;
  refunded: number;
  net_revenue: number;

  subscriptions_active: number;
  subscriptions_trialing: number;
  subscriptions_paused: number;
  subscriptions_past_due: number;
  subscriptions_new: number;
  subscriptions_cancelled: number;
  cancellations_scheduled: number;

  payments_successful: number;
  payments_failed: number;
  payment_success_rate: number;
  refunds_count: number;

  invoices_issued: number;
  invoices_paid: number;
  invoices_outstanding: number;
  outstanding_total: number;

  addons: AddonMetric[];
  tenants: TenantBillingMetric[];
}

export interface BillingMetricsFilter {
  start?: string;
  end?: string;
  tenant_id?: Id;
  plan_id?: Id;
  feature_key?: FeatureKey;
  payment_status?: SubscriptionPaymentStatus;
  subscription_status?: SubscriptionStatus;
}
