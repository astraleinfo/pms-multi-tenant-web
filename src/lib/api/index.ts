"use client";

import type {
  AccountStatus, Appointment, BillingDepartment, CatalogFeature, ClinicalTypeKey, Encounter,
  FeatureKey,
  Charge, FieldDefinition, HistoryEvent, Id, InventoryBatch, InventoryItem, InventoryItemPatch,
  InventoryTransaction, InventoryTxType, Invoice, InvoiceLineItem, LabAttachment, LabOrder,
  LabResultLine, NewAppointment, NewEncounter, NewInventoryItem, NewServicePrice, Patient,
  PatientAccount, Payment, Prescription, PrescriptionItem, PricingMode, QueueEntry, Role,
  ServiceKind,
  ServicePrice, ServicePricePatch, Subscription, SubscriptionInvoice, SubscriptionSummary,
  SuggestedLinesResponse, SupportRequest, SupportRequestKind, Tenant,
  TenantConfig, TenantFeature,
  User,
} from "@/lib/types";
import {
  ApiError, del, get, patch as patch_, post, put as put_, requestBlob, setAccessToken, upload,
} from "./client";

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
  /** they are using a password somebody else chose — see `mustChangePassword` */
  must_change_password?: boolean;
}

export interface PlatformStaff {
  id: Id;
  name: string;
  email: string;
  initials: string;
  title: string;
  /**
   * `super_admin` or `support`.
   *
   * The console hides what a role cannot reach; the API refuses it either way,
   * so reading this is a courtesy to the person, not a gate. Anything that
   * only checked here would be bypassed by typing the URL.
   */
  role: PlatformRole;
}

export type PlatformRole = "super_admin" | "support";

export const isSuperAdmin = (staff: PlatformStaff | null | undefined) =>
  staff?.role === "super_admin";

export type AuthResult =
  | { ok: true; user: User; mustChangePassword: boolean }
  | { ok: false; error: string; code?: string };
export type PlatformAuthResult =
  | { ok: true; user: PlatformStaff }
  | { ok: false; error: string; code?: string };

/** §4 step 1. The clinic comes from the address, so it is not a parameter. */
export async function authenticate(email: string, password: string): Promise<AuthResult> {
  try {
    const session = await post<SessionPayload>("/v1/auth/login", { email, password });
    setAccessToken(session.access_token);
    return {
      ok: true,
      user: session.user as User,
      mustChangePassword: session.must_change_password === true,
    };
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

/* ---- passwords ------------------------------------------------------------
 *
 * Nobody is ever handed a password. An account is created without one, its
 * owner is emailed a single-use link, and the password it ends up with is one
 * only they have seen. These four calls are the whole of that road, and three
 * of them run before anyone is signed in — the clinic comes from the address,
 * exactly as it does for sign-in.
 */

/** What the "choose a password" page is told about a link it was given. */
export interface InvitationPreview {
  valid: boolean;
  /** `invite` for a first password, `reset` for a replacement */
  purpose: "invite" | "reset" | "";
  name: string;
  email: string;
  clinic: string;
  problem: string | null;
}

/**
 * Inspect a link without spending it.
 *
 * An expired or already-used link is a page to render, not an error to catch:
 * this resolves with `valid: false` and a sentence rather than throwing.
 */
export const inspectInvitation = (token: string) =>
  get<InvitationPreview>("/v1/auth/invitation", { token });

/**
 * Ask for a reset link.
 *
 * Always succeeds, and says the same thing whether or not that address has an
 * account here — the form cannot be used to find out who works at a clinic.
 */
export const requestPasswordReset = (email: string) =>
  post<{ status: string; message: string }>("/v1/auth/password/forgot", { email });

/**
 * Spend a link and choose a password.
 *
 * No session comes back on purpose: they sign in with the password they just
 * chose, which proves it went in as they intended. Every session the account
 * had is ended, including any opened with the password being replaced.
 */
export const acceptPasswordReset = (token: string, password: string) =>
  post<{ ok: boolean; email: string; message: string }>("/v1/auth/password/reset", {
    token,
    password,
  });

/**
 * Change your own password, having proved you know the current one.
 *
 * This is what clears `must_change_password`, so it is also the way out of a
 * session that is good for one thing only. Every other session this account
 * holds ends; the browser doing it is spared.
 */
export const changeOwnPassword = (currentPassword: string, newPassword: string) =>
  post<User>("/v1/auth/password/change", {
    current_password: currentPassword,
    new_password: newPassword,
  });


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

export const setDoctorConsultationFee = (doctorId: Id, fee: number | null) =>
  patch_<User>(`/v1/pricing/doctors/${doctorId}`, { consultation_fee: fee });

export const listFeatures = () => get<TenantFeature[]>("/v1/tenant/features");
export const getConfig = () => get<TenantConfig>("/v1/tenant/config");

export const listFieldDefinitions = () => get<FieldDefinition[]>("/v1/tenant/fields");
export const getSchema = (entity: FieldDefinition["entity"]) =>
  get<FieldDefinition[]>(`/v1/tenant/schema/${entity}`);

/** Common medicines offered when writing a prescription — tenant- and
 *  clinical-type-filtered server-side, so there is nothing to pass. */
export interface MedicineSuggestionOut {
  medicine: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration: string;
}
export const getMedicines = () => get<MedicineSuggestionOut[]>("/v1/catalog/medicines");

/** The module catalogue with today's prices, as a clinic is quoted them. */
export const listCatalogFeatures = () => get<CatalogFeature[]>("/v1/catalog/features");

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

/** The printable consultation record — encounter, prescription and patient,
 *  rendered server-side as a PDF. */
export const getConsultationPdf = (id: Id) => requestBlob(`/v1/encounters/${id}/consultation-pdf`);

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
  /** which counter raised it — the lab and the pharmacy bill separately */
  department?: BillingDepartment;
  patient_id?: Id;
}

export const listInvoices = async () =>
  (await get<CountedPage<Invoice>>("/v1/billing/invoices", WHOLE_COLLECTION)).items;

export const listInvoicePage = (query: InvoiceQuery = {}) =>
  get<CountedPage<Invoice>>("/v1/billing/invoices", {
    ...pageParams(query),
    status: query.status,
    unpaid: query.unpaid || undefined,
    department: query.department,
    patient_id: query.patient_id,
  });

export const getInvoice = (id: Id) => get<Invoice>(`/v1/billing/invoices/${id}`);

/** The invoice on the clinic's letterhead, rendered by the API from the same
    totals the screen shows. */
export const getInvoicePdf = (id: Id) => requestBlob(`/v1/billing/invoices/${id}/pdf`);

/* ---- the clinic's own subscription bills (practice admin) ------------------ */

/** What this clinic owes the platform. Open even while the clinic is on hold. */
export const getSubscription = () => get<Subscription>("/v1/tenant/subscription");
export const getSubscriptionBillPdf = (billId: Id) =>
  requestBlob(`/v1/tenant/subscription/invoices/${billId}/pdf`);

/* ---- staff ---------------------------------------------------------------- */

/**
 * What a practice admin sends to give a colleague an account. As everywhere
 * else there is no tenant: the clinic is the address and the session. The id,
 * the initials and the account status are the server's to decide.
 *
 * `password` decides which of two accounts is created, and the ordinary answer
 * is to leave it out: the row is then `invited` with no hash at all, and the
 * server emails them a link to choose their own.
 *
 * Supplying one is the fallback for somebody standing at the desk. It works,
 * but the admin typing it knows it — so the account comes back with
 * `must_change_password` set and its owner is held at the change-password
 * screen until they have replaced it.
 */
export interface NewUser {
  name: string;
  email: string;
  role: Role;
  speciality?: string;
  password?: string;
}

export const createUser = (input: NewUser) =>
  post<User>("/v1/users", {
    name: input.name,
    email: input.email,
    role: input.role,
    speciality: input.speciality?.trim() || null,
    password: input.password || null,
  });

/**
 * Give someone a password they did not choose. There is no current password:
 * the point of the route is that an admin does not know theirs.
 *
 * The first password an account is given is what accepts its invitation — an
 * `invited` row has no hash and the sign-in refuses it by name. Every session
 * opened with the old password ends, except the one making the request when an
 * admin is rotating their own. It is not an unlock: a locked account stays
 * locked, which is `setUserStatus`'s job.
 */
export const setUserPassword = (userId: Id, password: string) =>
  post<User>(`/v1/users/${userId}/password`, { password });

/**
 * Send this colleague their link again.
 *
 * Handles both cases: an invitation never accepted, and a password simply
 * forgotten. Issuing a link spends every earlier one, so the newest email is
 * the only one that opens anything. A locked account is refused — releasing it
 * is `setUserStatus`, and a resend must not quietly undo a lockout.
 */
export const resendInvitation = (userId: Id) => post<User>(`/v1/users/${userId}/invite`);

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

/* ---- entitlements (§3.2) ----------------------------------------------------
 *
 * Nothing in the app calls these two any more: a clinic asks the support desk
 * for a module and a super admin grants it with `setTenantFeature`. They stay
 * because the endpoints do — if the API withdraws the clinic-side purchase,
 * withdraw them with it.
 */

/* ---- support desk ------------------------------------------------------------
 *
 * How a clinic asks for a module. The API stores the request and a background
 * worker emails the desk, so "sent" here means "the platform has it" — not
 * that the email has already left.
 */

export const listSupportRequests = () => get<SupportRequest[]>("/v1/tenant/support-requests");

export const createSupportRequest = (input: {
  kind: SupportRequestKind;
  feature_key?: FeatureKey;
  message?: string;
}) => post<SupportRequest>("/v1/tenant/support-requests", input);

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

/* The files an order collects — a scanned request form, a machine printout, a
   signed report. They are reached through the order, never by a bare file id,
   so the tenant check that protects the order protects the file. */

export const listLabAttachments = (orderId: Id) =>
  get<LabAttachment[]>(`/v1/lab/orders/${orderId}/attachments`);

export const uploadLabAttachment = (orderId: Id, file: File, note?: string) => {
  const form = new FormData();
  form.append("file", file);
  if (note?.trim()) form.append("note", note.trim());
  return upload<LabAttachment>(`/v1/lab/orders/${orderId}/attachments`, form);
};

export const deleteLabAttachment = (orderId: Id, attachmentId: Id) =>
  del<void>(`/v1/lab/orders/${orderId}/attachments/${attachmentId}`);

/** The file itself, as a blob the caller can open or save. */
export const getLabAttachmentFile = (orderId: Id, attachmentId: Id) =>
  requestBlob(`/v1/lab/orders/${orderId}/attachments/${attachmentId}`);

/* ---- inventory (§3.11) ---------------------------------------------------------

   A stock line is opened before any stock exists: on hand is the sum of the
   ledger, so a new item starts at nothing and the first purchase puts it on the
   shelf. How it is priced — a typed price, a margin over cost, or the MRP less
   a discount — is the server's arithmetic, so two screens cannot disagree. */

export const createInventoryItem = (input: NewInventoryItem) =>
  post<InventoryItem>("/v1/inventory/items", input);

export const updateInventoryItem = (id: Id, changes: InventoryItemPatch) =>
  patch_<InventoryItem>(`/v1/inventory/items/${id}`, changes);

export interface StockMovement {
  item_id: Id;
  type: InventoryTxType;
  qty: number;
  batch_no: string;
  expiry?: string;
  note?: string;
  /* A delivery is when the supplier's figures are in front of somebody. Sent,
     they re-price the line; left out, it keeps the price it had. */
  unit_price?: number;
  cost_price?: number;
  mrp?: number;
  margin_pct?: number;
  pricing_mode?: PricingMode;
}

export const recordStockMovement = async (input: StockMovement) =>
  (await post<InventoryTransaction>("/v1/inventory/transactions", input)).item_id;

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

/* ---- a patient's account (§3.12) -------------------------------------------

   One patient, three counters. The clinic, the lab and the pharmacy each keep
   their own invoices and each is settled on its own — paying for your medicine
   at the window is not paying for your scan. */

export const getPatientAccount = (patientId: Id) =>
  get<PatientAccount>(`/v1/billing/patients/${patientId}/account`);

/** Just the unbilled half — what the dispensing window shows when it asks for
 *  money, optionally for one counter. */
export const listUnbilledCharges = (patientId: Id, department?: BillingDepartment) =>
  get<Charge[]>(`/v1/billing/patients/${patientId}/charges`, { department });

/**
 * Put a counter's outstanding charges onto one invoice.
 *
 * `ref_ids` narrows it to particular charges — the window billing exactly what
 * it just handed over. Each line points back at what it bills, so calling this
 * twice cannot charge for the same box of tablets twice.
 */
export const raiseCounterInvoice = (
  patientId: Id,
  input: { department: BillingDepartment; issue?: boolean; ref_ids?: Id[] },
) => post<Invoice>(`/v1/billing/patients/${patientId}/invoices`, input);

export interface CounterPayment {
  department: BillingDepartment;
  paid: number;
  /** what that counter is still owed afterwards */
  remaining: number;
  invoices: Invoice[];
}

/** One amount, handed over at one counter. Oldest invoice first. */
export const takeCounterPayment = (
  patientId: Id,
  input: {
    department: BillingDepartment;
    amount: number;
    method: Payment["method"];
    reference?: string;
  },
) => post<CounterPayment>(`/v1/billing/patients/${patientId}/payments`, input);

/** What this visit would bill for — the consultation, its labs, its dispenses,
 *  each priced from the clinic's own tariff. */
export const suggestedInvoiceLines = (encounterId: Id) =>
  get<SuggestedLinesResponse>("/v1/billing/invoices/suggestions", { encounter_id: encounterId });

/* ---- the tariff (§3.12) ---------------------------------------------------

   What this clinic charges for everything that is not stock. Reading is open to
   anyone who can see a price; setting one is the practice admin's, which the
   server enforces — the page below only hides the buttons. */

export const listServicePrices = (query: { kind?: ServiceKind; active?: boolean } = {}) =>
  get<ServicePrice[]>("/v1/pricing/services", {
    kind: query.kind,
    active: query.active || undefined,
  });

export const createServicePrice = (input: NewServicePrice) =>
  post<ServicePrice>("/v1/pricing/services", input);

export const updateServicePrice = (id: Id, changes: ServicePricePatch) =>
  patch_<ServicePrice>(`/v1/pricing/services/${id}`, changes);

export const deleteServicePrice = (id: Id) => del<void>(`/v1/pricing/services/${id}`);

/** Give every test this clinic can order a row to price, at one starting
 *  figure. Anything already priced is left exactly as it is. */
export const importLabCataloguePrices = (price: number, tax_pct = 0) =>
  post<ServicePrice[]>("/v1/pricing/services/import-lab-catalogue", { price, tax_pct });

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

/** The reports page as a PDF — the same read model, for filing or printing. */
export const getReportPdf = (days: number) =>
  requestBlob("/v1/analytics/report.pdf", { query: { days } });

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

/** Whether a subdomain can be claimed, answered while somebody types it. */
export interface SlugCheck {
  slug: string;
  available: boolean;
  problem: string | null;
  /** the address the clinic would answer on */
  url: string;
}

export const checkSlug = (slug: string) =>
  get<SlugCheck>("/v1/platform/tenants/slug-check", { slug });

export interface TenantCreated {
  tenantId: Id;
  userId: Id;
  slug: string;
  adminEmail: string;
  /** the clinic row, so the console can act on what it just made */
  tenant: Tenant;
  /** false means the clinic exists but nobody can sign into it yet */
  invitationSent: boolean;
  /** only under the development mail transport — otherwise it is in an inbox */
  invitationUrl: string | null;
}

interface TenantCreatedBody {
  tenant: Tenant;
  admin_user_id: Id;
  admin_email: string;
  invitation_sent: boolean;
  invitation_url: string | null;
}

const asCreated = (body: TenantCreatedBody): TenantCreated => ({
  tenant: body.tenant,
  tenantId: body.tenant.id,
  userId: body.admin_user_id,
  slug: body.tenant.slug,
  adminEmail: body.admin_email,
  invitationSent: body.invitation_sent,
  invitationUrl: body.invitation_url,
});

/**
 * Create a clinic.
 *
 * No password, anywhere: the first administrator is written without one and
 * emailed a link to choose their own. `invitationSent` is the part worth
 * reading — a clinic whose admin never got the link exists but cannot be
 * signed into, and the console should say so rather than report success.
 */
export const createTenant = async (input: {
  name: string; slug: string; city: string; clinical_type: ClinicalTypeKey;
  admin_name: string; admin_email: string;
}) => asCreated(await post<TenantCreatedBody>("/v1/platform/tenants", input));

/** Send a clinic's administrator their link again. */
export const resendTenantInvitation = async (tenantId: Id, userId: Id) =>
  asCreated(
    await post<TenantCreatedBody>(`/v1/platform/tenants/${tenantId}/users/${userId}/invite`),
  );

/**
 * Edit a clinic's record.
 *
 * `slug` is absent and cannot be added: it is the clinic's address, it is
 * inside every live session token, and changing it would sign the whole
 * practice out. Status has its own call, because suspending is not an edit.
 */
export interface TenantEdit {
  name?: string;
  city?: string;
  plan?: string;
  timezone?: string;
  clinical_type?: ClinicalTypeKey;
  /** never bill this clinic, and lift any hold it is under */
  billing_exempt?: boolean;
}

export const updateTenant = (tenantId: Id, changes: TenantEdit) =>
  patch_<Tenant>(`/v1/platform/tenants/${tenantId}`, changes);

export const setTenantStatus = async (tenantId: Id, status: Tenant["status"]) =>
  (await patch_<Tenant>(`/v1/platform/tenants/${tenantId}/status`, { status })).id;

/** This clinic's staff, as the console sees them — support accounts excluded. */
export const tenantUsers = (tenantId: Id) =>
  get<User[]>(`/v1/platform/tenants/${tenantId}/users`);

/** What one clinic has asked the desk for, newest first. */
export const tenantSupportRequests = (tenantId: Id) =>
  get<SupportRequest[]>(`/v1/platform/tenants/${tenantId}/support-requests`);

/** The module catalogue with today's prices, as the console sells it. */
export const listPlatformCatalogFeatures = () =>
  get<CatalogFeature[]>("/v1/platform/catalog/features");

/**
 * Set what a module costs per month, for every clinic at once.
 *
 * Super admin only: the API answers 403 to the support desk, so hiding the
 * control from `support` is presentation, not protection. A core module
 * carries no price and is refused with a 409.
 */
export const setFeaturePrice = (featureKey: FeatureKey, priceMonthly: number) =>
  patch_<CatalogFeature>(`/v1/platform/catalog/features/${featureKey}`, {
    price_monthly: priceMonthly,
  });

/* ---- platform settings (§ platform settings) --------------------------------- */

export interface PlatformSettings {
  support_email: string;
  support_phone: string;
  support_hours: string;
  default_day_start: string;
  default_day_end: string;
  default_slot_minutes: 15 | 20 | 30;
  default_duration: number;
  default_tax_pct: number;
  default_payment_terms_days: number;
  default_expiry_alert_days: number;
  default_currency: "GBP" | "EUR" | "USD" | "INR";
}

export const getPlatformSettings = () => get<PlatformSettings>("/v1/platform/settings");

export const updatePlatformSettings = (changes: Partial<PlatformSettings>) =>
  patch_<PlatformSettings>("/v1/platform/settings", changes);

export interface PublicSettings {
  support_email: string;
  support_phone: string;
  support_hours: string;
}

/** No session needed — this is what a clinic that can't self-serve reads to
 *  know who to ask. */
export const getPublicSettings = () => get<PublicSettings>("/v1/public/settings");

/* ---- subscription billing, from the console ---------------------------------- */

export interface PlatformBillingRow {
  tenant: Tenant;
  summary: SubscriptionSummary;
  invoices: SubscriptionInvoice[];
}

export interface PlatformBilling {
  /** whether the beat raises bills by itself; "run now" works either way */
  enabled: boolean;
  currency: string;
  due_days: number;
  grace_days: number;
  reminder_days_before_due: number;
  clinics: PlatformBillingRow[];
}

export interface BillingRun {
  clinics: number;
  raised: string[];
  reminded: string[];
  held: string[];
  lifted: string[];
  failed: string[];
}

export const platformBilling = () => get<PlatformBilling>("/v1/platform/billing");
/** Super admin: raise this month's bills and send what is due now. Idempotent. */
export const runBilling = () => post<BillingRun>("/v1/platform/billing/run");
export const tenantSubscription = (tenantId: Id) =>
  get<Subscription>(`/v1/platform/tenants/${tenantId}/subscription`);
export const tenantBillPdf = (tenantId: Id, billId: Id) =>
  requestBlob(`/v1/platform/tenants/${tenantId}/subscription/invoices/${billId}/pdf`);
/** Super admin: record a bill as paid. Lifts the hold if it was the last thing holding the clinic. */
export const settleBill = (tenantId: Id, billId: Id, reference: string) =>
  post<Subscription>(`/v1/platform/tenants/${tenantId}/subscription/invoices/${billId}/settle`, { reference });
/** Super admin: withdraw a bill raised in error. */
export const voidBill = (tenantId: Id, billId: Id) =>
  post<Subscription>(`/v1/platform/tenants/${tenantId}/subscription/invoices/${billId}/void`);

/* ---- onboarding from a spreadsheet ------------------------------------------ */

export type ImportKind = "users" | "patients";

export interface ImportReport {
  kind: ImportKind;
  total: number;
  valid: number;
  invalid: number;
  /** false for a preview — nothing was written */
  committed: boolean;
  created: number;
  /** staff only: invitations that left */
  invited: number;
  rows: { row: number; label: string; ok: boolean; errors: string[] }[];
}

/** The sample sheet for this clinic — its own custom patient fields included. */
export const importTemplate = (tenantId: Id, kind: ImportKind) =>
  requestBlob(`/v1/platform/tenants/${tenantId}/imports/${kind}/template`);

/**
 * Check a filled-in sheet; with `commit`, write it. A commit is refused (422)
 * unless every row passes, and then nothing at all is written.
 */
export const runImport = (tenantId: Id, kind: ImportKind, file: File, commit: boolean) => {
  const form = new FormData();
  form.append("file", file);
  return upload<ImportReport>(
    `/v1/platform/tenants/${tenantId}/imports/${kind}?commit=${commit ? "true" : "false"}`, form,
  );
};

export const tenantFeatures = (tenantId: Id) =>
  get<TenantFeature[]>(`/v1/platform/tenants/${tenantId}/features`);

/**
 * Switch a module on or off for one clinic.
 *
 * The clinic-side call records a clinic buying something; this is the
 * platform's own hand on the switch. Both write the same row, so the feature
 * guard reads one answer either way.
 */
export const setTenantFeature = (
  tenantId: Id,
  featureKey: FeatureKey,
  status: TenantFeature["status"],
) => put_<TenantFeature>(`/v1/platform/tenants/${tenantId}/features/${featureKey}`, { status });

/**
 * Open a support session inside a clinic.
 *
 * What comes back is an access token and nothing else — no refresh token and
 * no cookie — so it lasts one access-token lifetime and then has to be opened
 * again from here. Inside, it carries a practice admin's permissions, and
 * everything it does is recorded against the platform person who opened it.
 *
 * The token is handed over in the URL fragment, which browsers do not send to
 * a server and which does not survive into history the way a query string
 * does. The clinic tab reads it, drops it from the address bar, and holds it
 * in memory like any other access token.
 */
export interface SupportSession {
  access_token: string;
  expires_in: number;
  tenant: Tenant;
  url: string;
}

export const openSupportSession = (tenantId: Id) =>
  post<SupportSession>(`/v1/platform/tenants/${tenantId}/impersonate`);

/* ---- background jobs (super admin only) ------------------------------------
 *
 * Celery's work, read through Flower. Flower's own port is not published
 * anywhere: these all go to the API, which checks that the caller is a
 * platform super admin before it relays a byte. A clinic session of any role
 * — practice admin included — is answered 403 here, so hiding the menu item
 * is presentation, not protection.
 */

export type JobStatus = "pending" | "active" | "completed" | "failed" | "retried" | "revoked";

export interface Job {
  id: Id;
  /** the registered task name, e.g. `pms.support.deliver` */
  name: string;
  status: JobStatus;
  /** Celery's own state — the buckets above fold some of them together */
  state: string;
  worker: string | null;
  queue: string | null;
  /** the call as the worker was handed it, already rendered by Celery */
  args: string;
  kwargs: string;
  /** ISO-8601, UTC — a job belongs to no clinic, so it has no local clock */
  received_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  /** how long it ran, or how long it has been running so far */
  runtime_seconds: number | null;
  running: boolean;
  retries: number;
  exception: string | null;
  /** only on the single-job read */
  traceback: string | null;
  result: string | null;
  eta: string | null;
}

export interface JobWorker {
  name: string;
  online: boolean;
  active: number;
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  concurrency: number | null;
  queues: string[];
  load_average: number[];
}

export interface JobSummary {
  active: number;
  pending: number;
  completed: number;
  failed: number;
  retried: number;
  revoked: number;
  workers_online: number;
  workers_total: number;
  /** how many task records the counts above were taken over */
  window: number;
}

export interface JobsPage {
  /** false while the monitor is unreachable — the page says so rather than
      drawing zeroes, which would read like a quiet platform */
  available: boolean;
  problem: string | null;
  summary: JobSummary;
  workers: JobWorker[];
  task_names: string[];
  worker_names: string[];
  items: Job[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobQuery {
  status?: JobStatus;
  task?: string;
  worker?: string;
  /** ISO-8601; a value without a zone is read as UTC */
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const listJobs = (query: JobQuery = {}) =>
  get<JobsPage>("/v1/platform/jobs", {
    status: query.status,
    task: query.task,
    worker: query.worker,
    since: query.since,
    until: query.until,
    search: query.search,
    limit: query.limit,
    offset: query.offset,
  });

export const getJob = (taskId: Id) => get<Job>(`/v1/platform/jobs/tasks/${taskId}`);

/**
 * Ask for a short-lived cookie, then open Flower's own interface.
 *
 * A browser loading an interface cannot put an `Authorization` header on the
 * stylesheet, the script and the dozen requests that page fires, so the API
 * mints an HttpOnly cookie that opens that one route and nothing else. What
 * comes back is the path to point a tab or a frame at.
 */
export interface FlowerSession {
  url: string;
  expires_in: number;
}

export const openFlowerSession = () =>
  post<FlowerSession>("/v1/platform/jobs/flower-session");

export const closeFlowerSession = () =>
  del<void>("/v1/platform/jobs/flower-session").catch(() => undefined);
