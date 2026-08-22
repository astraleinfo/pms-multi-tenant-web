"use client";

import type {
  AccountStatus, Appointment, ClinicalTypeKey, Encounter, FeatureKey, FieldDefinition,
  HistoryEvent, Id, InventoryBatch, InventoryItem, InventoryTransaction, InventoryTxType,
  Invoice, InvoiceLineItem, LabOrder, LabResultLine, NewAppointment, NewEncounter, Patient,
  Payment, Prescription, PrescriptionItem, QueueEntry, Tenant, TenantConfig, TenantFeature, User,
} from "@/lib/types";
import { ApiError, del, get, patch as patch_, post, setAccessToken } from "./client";

/* ==========================================================================
   The API.

   One function per endpoint in pms-end-to-flow.md, exactly as before — only
   now each one is a request rather than a read of an in-memory database.
   Nothing above this file changed when the backend arrived, which was the
   point of writing it this way.

   Note what is *not* here: no function takes a tenant id. The clinic is the
   address the request goes to and the session it carries, and the server
   derives it from those two agreeing. A tenant id in a request body would be
   rejected outright.
   ========================================================================== */

export { ApiError } from "./client";

/* ---- session ------------------------------------------------------------- */

export const MAX_ATTEMPTS = 5;

export interface SessionPayload {
  access_token: string;
  expires_in: number;
  user?: User | null;
  platform_user?: PlatformStaff | null;
  tenant_id?: string | null;
  permissions?: string[];
}

export interface PlatformStaff {
  id: Id;
  name: string;
  email: string;
  initials: string;
  title: string;
}

export type AuthResult = { ok: true; user: User } | { ok: false; error: string; code?: string };
export type PlatformAuthResult =
  | { ok: true; user: PlatformStaff }
  | { ok: false; error: string; code?: string };

/** §4 step 1. The clinic comes from the address, so it is not a parameter. */
export async function authenticate(email: string, password: string): Promise<AuthResult> {
  try {
    const session = await post<SessionPayload>("/v1/auth/login", { email, password });
    setAccessToken(session.access_token);
    return { ok: true, user: session.user as User };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message, code: error.code };
    return { ok: false, error: "The clinic could not be reached. Try again." };
  }
}

export async function authenticatePlatform(email: string, password: string): Promise<PlatformAuthResult> {
  try {
    const session = await post<SessionPayload>("/v1/platform/auth/login", { email, password });
    setAccessToken(session.access_token);
    return { ok: true, user: session.platform_user as PlatformStaff };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message, code: error.code };
    return { ok: false, error: "The console could not be reached. Try again." };
  }
}

export const signOut = () => post<void>("/v1/auth/logout").catch(() => undefined);

/** How one person has set the interface up for themselves. */
export interface UserPreferences {
  tour_version_seen: number | null;
  tour_dismissed: boolean;
}

export const NO_PREFERENCES: UserPreferences = { tour_version_seen: null, tour_dismissed: false };

export interface Me {
  user: User | null;
  tenant_id: string | null;
  role: string | null;
  permissions: string[];
  features: FeatureKey[];
  preferences: UserPreferences;
}

export const me = () => get<Me>("/v1/auth/me");

/**
 * Save this person's own interface state. There is no user id: the only account
 * this route can touch is the one making the request.
 */
export const savePreferences = (patch: Partial<UserPreferences>) =>
  patch_<UserPreferences>("/v1/auth/me/preferences", patch);

/* ---- the clinic behind this host ----------------------------------------- */

export interface PublicTenant {
  name: string;
  slug: string;
  clinical_type: ClinicalTypeKey;
  status: Tenant["status"];
}

/** The only thing an unauthenticated visitor may ask: is there a clinic here? */
export const getPublicTenant = () => get<PublicTenant>("/v1/public/tenant");

export const getTenant = () => get<Tenant>("/v1/tenant");

/* ---- reads ---------------------------------------------------------------- */

export const listUsers = () => get<User[]>("/v1/users");
export const listDoctors = () => get<User[]>("/v1/users/doctors");

export const listFeatures = () => get<TenantFeature[]>("/v1/tenant/features");
export const getConfig = () => get<TenantConfig>("/v1/tenant/config");

export const listFieldDefinitions = () => get<FieldDefinition[]>("/v1/tenant/fields");
export const getSchema = (entity: FieldDefinition["entity"]) =>
  get<FieldDefinition[]>(`/v1/tenant/schema/${entity}`);

export interface PatientPage {
  items: Patient[];
  total: number;
  limit: number;
  offset: number;
}

export interface PatientQuery {
  search?: string;
  limit?: number;
  offset?: number;
  sort?: "full_name" | "mrn" | "dob" | "registered_at" | "last_visit";
  order?: "asc" | "desc";
  /** the register's filters, applied in the database like everything else */
  seen_on?: string;
  registered_since?: string;
  with_allergies?: boolean;
}

/**
 * One page of the register. Searching, sorting and paging all happen in the
 * database, so what arrives is the page being shown and nothing else — a clinic
 * with fifty thousand patients costs a browser the same as one with fifty.
 */
export const listPatients = (query: PatientQuery = {}) =>
  get<PatientPage>("/v1/patients", {
    search: query.search,
    limit: query.limit ?? 25,
    offset: query.offset ?? 0,
    sort: query.sort ?? "registered_at",
    order: query.order ?? "desc",
    seen_on: query.seen_on,
    registered_since: query.registered_since,
    with_allergies: query.with_allergies,
  });

/** A short list for pickers and the command palette. */
export const searchPatients = async (term: string, limit = 8) =>
  (await listPatients({ search: term, limit, sort: "full_name", order: "asc" })).items;
export const getPatient = (id: Id) => get<Patient>(`/v1/patients/${id}`);
export const getPatientHistory = (id: Id) => get<HistoryEvent[]>(`/v1/patients/${id}/history`);

/* ---- the paged lists -------------------------------------------------------

   Six endpoints answer with a page rather than a collection: the register, the
   diary, the case book, prescriptions, the lab's order book and the ledger.
   Searching, sorting and slicing all happen in the database, and the response
   says how many rows matched — which is what lets a pager say "1–10 of 3,481"
   without the browser ever holding 3,481 rows.

   `limit: 0` asks for the whole collection instead. The views that are not
   pages use it — the appointment day and week grids, the rail's badge counts,
   a patient's own history — and get exactly what they got before paging
   existed. Everything with a pager under it asks for ten.
   ============================================================================ */

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** A page whose screen has tabs: `counts` is keyed by status and ignores the
    tab that happens to be open, so the numbers describe the whole list. */
export interface CountedPage<T> extends Page<T> {
  counts: Record<string, number>;
}

/** What every paged list takes. `sort` names one of a fixed set of keys. */
export interface PageQuery {
  search?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: "asc" | "desc";
}

/** The whole collection, not a page — see the note above. */
const WHOLE_COLLECTION = { limit: 0 };

const pageParams = (query: PageQuery) => ({
  search: query.search,
  limit: query.limit ?? 0,
  offset: query.offset ?? 0,
  sort: query.sort,
  order: query.order,
});

export interface AppointmentQuery extends PageQuery {
  date?: string;
  doctor_id?: Id;
}

export const listAppointments = async () =>
  (await get<Page<Appointment>>("/v1/appointments", WHOLE_COLLECTION)).items;

export const listAppointmentPage = (query: AppointmentQuery = {}) =>
  get<Page<Appointment>>("/v1/appointments", {
    ...pageParams(query),
    date: query.date,
    doctor_id: query.doctor_id,
  });

export const listQueue = () => get<QueueEntry[]>("/v1/queue");

export interface EncounterQuery extends PageQuery {
  patient_id?: Id;
}

export const listEncounters = async () =>
  (await get<Page<Encounter>>("/v1/encounters", WHOLE_COLLECTION)).items;

export const listEncounterPage = (query: EncounterQuery = {}) =>
  get<Page<Encounter>>("/v1/encounters", { ...pageParams(query), patient_id: query.patient_id });

export const getEncounter = (id: Id) => get<Encounter>(`/v1/encounters/${id}`);

export interface PrescriptionQuery extends PageQuery {
  status?: Prescription["status"];
  patient_id?: Id;
}

export const listPrescriptions = async () =>
  (await get<CountedPage<Prescription>>("/v1/prescriptions", WHOLE_COLLECTION)).items;

export const listPrescriptionPage = (query: PrescriptionQuery = {}) =>
  get<CountedPage<Prescription>>("/v1/prescriptions", {
    ...pageParams(query),
    status: query.status,
    patient_id: query.patient_id,
  });

export interface LabOrderQuery extends PageQuery {
  status?: LabOrder["status"];
  /** the bench's own view: everything not yet released into a record */
  unverified?: boolean;
  patient_id?: Id;
}

export const listLabOrders = async () =>
  (await get<Page<LabOrder>>("/v1/lab/orders", WHOLE_COLLECTION)).items;

/** One order, for a screen showing a single order rather than a page of them. */
export const getLabOrder = (id: Id) => get<LabOrder>(`/v1/lab/orders/${id}`);

export const listLabOrderPage = (query: LabOrderQuery = {}) =>
  get<Page<LabOrder>>("/v1/lab/orders", {
    ...pageParams(query),
    status: query.status,
    unverified: query.unverified || undefined,
    patient_id: query.patient_id,
  });

export const listInventoryItems = () => get<InventoryItem[]>("/v1/inventory/items");
export const listInventoryTx = () => get<InventoryTransaction[]>("/v1/inventory/transactions");
export const listInventoryBatches = () => get<InventoryBatch[]>("/v1/inventory/batches");

export interface InvoiceQuery extends PageQuery {
  status?: Invoice["status"];
  /** issued or part paid, with something still owing */
  unpaid?: boolean;
  patient_id?: Id;
}

export const listInvoices = async () =>
  (await get<CountedPage<Invoice>>("/v1/billing/invoices", WHOLE_COLLECTION)).items;

export const listInvoicePage = (query: InvoiceQuery = {}) =>
  get<CountedPage<Invoice>>("/v1/billing/invoices", {
    ...pageParams(query),
    status: query.status,
    unpaid: query.unpaid || undefined,
    patient_id: query.patient_id,
  });

export const getInvoice = (id: Id) => get<Invoice>(`/v1/billing/invoices/${id}`);

/* ---- staff ---------------------------------------------------------------- */

export const setUserStatus = (userId: Id, status: AccountStatus) =>
  patch_<User>(`/v1/users/${userId}/status`, { status });

/* ---- configuration (§3.3) --------------------------------------------------- */

export const updateConfig = (changes: Partial<TenantConfig>) =>
  patch_<TenantConfig>("/v1/tenant/config", stripReadOnly(changes));

/** `tenant_id` is the server's to decide; sending it back would be rejected. */
function stripReadOnly(config: Partial<TenantConfig>) {
  const { tenant_id: _tenantId, ...rest } = config as Partial<TenantConfig> & { tenant_id?: string };
  return rest;
}

/* ---- entitlements (§3.2) ---------------------------------------------------- */

export const purchaseFeature = (key: FeatureKey) =>
  post<TenantFeature>(`/v1/tenant/features/${key}/purchase`, {});
export const deactivateFeature = (key: FeatureKey) =>
  post<TenantFeature>(`/v1/tenant/features/${key}/deactivate`);

export const addFieldDefinition = (input: Omit<FieldDefinition, "id" | "tenant_id" | "scope" | "clinical_type">) =>
  post<FieldDefinition>("/v1/tenant/fields", input);

export const removeFieldDefinition = (id: Id) => del<void>(`/v1/tenant/fields/${id}`);

/* ---- patients (§3.4) --------------------------------------------------------- */

const KNOWN_PATIENT_FIELDS = [
  "full_name", "dob", "sex", "phone", "email", "address", "blood_group", "allergies",
];

/** Split a dynamic form's values into the common columns and `clinical_ext`. */
function splitPatient(values: Record<string, unknown>) {
  const common: Record<string, unknown> = {};
  const clinical_ext: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    (KNOWN_PATIENT_FIELDS.includes(key) ? common : clinical_ext)[key] = value;
  }
  return { ...common, clinical_ext };
}

export const createPatient = async (values: Record<string, unknown>) =>
  (await post<Patient>("/v1/patients", splitPatient(values))).id;

export const updatePatient = async (id: Id, values: Record<string, unknown>) =>
  (await patch_<Patient>(`/v1/patients/${id}`, splitPatient(values))).id;

/* ---- appointments & queue (§3.5, §3.6) --------------------------------------- */

/**
 * The booking dialog's slot grid, worked out from the appointments this clinic
 * already has in cache — one pass over rows the app is holding anyway rather
 * than a request per slot. It shapes the UI only: the server checks
 * availability again on POST and answers 409 if the slot went while you typed.
 */
export function conflictsIn(
  appointments: Appointment[],
  doctorId: Id, date: string, time: string, durationMin: number, ignoreId?: Id,
) {
  const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const start = toMin(time), end = start + durationMin;
  return appointments.filter((a) => {
    if (a.doctor_id !== doctorId || a.date !== date) return false;
    if (a.id === ignoreId) return false;
    if (a.status === "cancelled" || a.status === "no_show") return false;
    const s = toMin(a.time), e = s + a.duration_min;
    return start < e && s < end;
  });
}

export const createAppointment = async (a: NewAppointment) =>
  (await post<Appointment>("/v1/appointments", {
    patient_id: a.patient_id,
    doctor_id: a.doctor_id,
    date: a.date,
    time: a.time,
    duration_min: a.duration_min,
    reason: a.reason,
    created_via: a.created_via,
  })).id;

export const setAppointmentStatus = async (id: Id, status: Appointment["status"]) =>
  (await patch_<Appointment>(`/v1/appointments/${id}/status`, { status })).id;

export const checkIn = async (appointmentId: Id) =>
  (await post<QueueEntry>(`/v1/appointments/${appointmentId}/checkin`)).id;

export const addWalkIn = async (
  input: { patient_id: Id; doctor_id: Id; reason: string; priority: QueueEntry["priority"] },
) => (await post<QueueEntry>("/v1/queue/walkin", input)).id;

export const setQueueStatus = async (id: Id, status: QueueEntry["status"]) =>
  (await patch_<QueueEntry>(`/v1/queue/${id}/status`, { status })).id;

/* ---- consultation (§3.7) ------------------------------------------------------ */

export const createEncounter = async (
  e: NewEncounter, sign: boolean,
) => (await post<Encounter>("/v1/encounters", {
  patient_id: e.patient_id,
  queue_entry_id: e.queue_entry_id,
  doctor_id: e.doctor_id,
  date: e.date,
  chief_complaint: e.chief_complaint,
  notes: e.notes,
  diagnosis: e.diagnosis,
  follow_up_days: e.follow_up_days,
  clinical_ext: e.clinical_ext,
  sign,
})).id;

export const updateEncounter = async (id: Id, changes: Partial<Encounter> & { sign?: boolean }) => {
  const { chief_complaint, notes, diagnosis, follow_up_days, clinical_ext, sign } = changes;
  const body = { chief_complaint, notes, diagnosis, follow_up_days, clinical_ext, sign };
  const defined = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  return (await patch_<Encounter>(`/v1/encounters/${id}`, defined)).id;
};

/* ---- prescriptions & pharmacy (§3.8, §3.9) ------------------------------------ */

export const createPrescription = async (
  encounterId: Id,
  _patientId: Id,
  _doctorId: Id,
  items: Array<Omit<PrescriptionItem, "id" | "prescription_id" | "dispensed_qty" | "status">>,
) => (await post<Prescription>(`/v1/encounters/${encounterId}/prescriptions`, {
  /* the patient and the prescriber come from the encounter and the session */
  items: items.map((i) => ({
    medicine: i.medicine, strength: i.strength, dosage: i.dosage, frequency: i.frequency,
    duration: i.duration, instructions: i.instructions, qty: i.qty, item_id: i.item_id,
  })),
})).id;

export const dispense = async (
  prescriptionId: Id, lines: Array<{ itemId: Id; qty: number; batch_no: string }>,
) => (await post<Prescription>(`/v1/pharmacy/prescriptions/${prescriptionId}/dispense`, {
  lines: lines
    .filter((l) => l.qty > 0)
    .map((l) => ({ item_id: l.itemId, qty: l.qty, batch_no: l.batch_no })),
})).id;

/* ---- lab (§3.10) -------------------------------------------------------------- */

export const createLabOrder = async (
  encounterId: Id,
  _patientId: Id,
  _orderedBy: Id,
  tests: Array<{ code: string; name: string; panel: string; note?: string }>,
) => {
  await post<LabOrder[]>(`/v1/encounters/${encounterId}/lab-orders`, { tests });
  return encounterId;
};

export const startLabOrder = async (id: Id) =>
  (await post<LabOrder>(`/v1/lab/orders/${id}/start`)).id;

export const saveLabResults = async (id: Id, results: LabResultLine[]) =>
  (await post<LabOrder>(`/v1/lab/orders/${id}/results`, { results })).id;

/** The transition that releases a result into the patient record. */
export const verifyLabOrder = async (id: Id) =>
  (await patch_<LabOrder>(`/v1/lab/orders/${id}`, { status: "verified" })).id;

/* ---- inventory (§3.11) --------------------------------------------------------- */

export const recordStockMovement = async (
  input: { item_id: Id; type: InventoryTxType; qty: number; batch_no: string; note?: string },
) => (await post<InventoryTransaction>("/v1/inventory/transactions", input)).item_id;

/* ---- billing (§3.12) ------------------------------------------------------------ */

export const createInvoice = async (input: {
  patient_id: Id; encounter_id: Id | null; line_items: Array<Omit<InvoiceLineItem, "id">>; issue: boolean;
}) => (await post<Invoice>("/v1/billing/invoices", input)).id;

export const addPayment = async (
  invoiceId: Id, amount: number, method: Payment["method"], reference?: string,
) => (await post<Invoice>(`/v1/billing/invoices/${invoiceId}/payments`, { amount, method, reference })).id;

export const issueInvoice = async (id: Id) =>
  (await post<Invoice>(`/v1/billing/invoices/${id}/issue`)).id;

export const voidInvoice = async (id: Id) =>
  (await post<Invoice>(`/v1/billing/invoices/${id}/void`)).id;

/** What this visit would bill for — the consultation, its labs, its dispenses. */
export const suggestedInvoiceLines = (encounterId: Id) =>
  get<Array<Omit<InvoiceLineItem, "id">>>("/v1/billing/invoices/suggestions", { encounter_id: encounterId });

/* ---- analytics (§3.14) ---------------------------------------------------------- */

export interface DayValue { date: string; value: number }
export interface AttendanceDay { date: string; kept: number; missed: number; cancelled: number }
export interface Labelled { label: string; value: number }

export interface Analytics {
  range: { from: string; to: string; days: number };
  core: {
    patients: number;
    new_patients: number;
    seen_today: number;
    never_visited: number;
    appointments_today: number;
    no_shows: number;
    encounters: number;
    prescriptions: number;
    revenue: number;
    waiting_now: number;
    in_consultation: number;
    completed_today: number;
    avg_wait_minutes: number;
    max_wait_minutes: number;
    avg_consultation_minutes: number;
    wait_samples: number;
    queue_funnel: Labelled[];
    visits_series: DayValue[];
    attendance_series: AttendanceDay[];
    top_diagnoses: Labelled[];
  };
  modules: {
    pharmacy?: {
      dispensed_units: number; dispensed_value: number;
      prescriptions_waiting: number; fully_dispensed: number;
    };
    lab?: {
      total: number; ordered: number; pending: number;
      resulted: number; verified: number; abnormal: number;
    };
    inventory?: {
      items: number;
      below_reorder: Array<{ item_id: Id; name: string; on_hand: number; reorder_level: number }>;
      expiring_soon: Array<{ batch_no: string; expiry: string; qty: number; item: string; days_left: number }>;
    };
    billing?: {
      billed: number; paid: number; outstanding: number;
      count: number; unpaid: number; drafts: number;
      revenue_mix: Labelled[];
    };
    advanced_reports?: {
      age_cohort: Labelled[];
      sex_split: Labelled[];
      clinicians: Array<{
        user_id: Id; name: string; initials: string; speciality: string | null;
        encounters: number; prescriptions: number; revenue: number;
      }>;
    };
  };
  clinical: {
    type: ClinicalTypeKey;
    breakdown: Labelled[];
    [key: string]: unknown;
  };
}

/**
 * §3.14 — every figure the dashboard and reports show, aggregated in the
 * database. The client renders what it is given: a module a clinic never bought
 * simply has no key here, which is why nothing needs a feature check to decide
 * what to compute.
 */
export const getAnalytics = (days: number) => get<Analytics>("/v1/analytics/dashboard", { days });

/* ---- platform (§3.1) ------------------------------------------------------------ */

export interface PlatformTenantRow {
  tenant: Tenant;
  active_features: FeatureKey[];
  users: number;
  patients: number;
  appointments: number;
  encounters: number;
  invoices: number;
  revenue: number;
  last_activity: string | null;
}

export interface PlatformSnapshot {
  tenants: PlatformTenantRow[];
  totals: Record<string, number>;
}

export const platformSnapshot = () => get<PlatformSnapshot>("/v1/platform/snapshot");
export const listTenants = () => get<Tenant[]>("/v1/platform/tenants");

export const createTenant = async (input: {
  name: string; slug: string; city: string; clinical_type: ClinicalTypeKey;
  admin_name: string; admin_email: string; admin_password: string;
}) => {
  const created = await post<{ tenant: Tenant; admin_user_id: Id }>("/v1/platform/tenants", input);
  return { tenantId: created.tenant.id, userId: created.admin_user_id, slug: created.tenant.slug };
};

export const setTenantStatus = async (tenantId: Id, status: Tenant["status"]) =>
  (await patch_<Tenant>(`/v1/platform/tenants/${tenantId}/status`, { status })).id;
