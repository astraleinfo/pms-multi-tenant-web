"use client";

import type {
  AccountStatus, Appointment, BillingDepartment, ClinicalTypeKey, Encounter,
  Charge, FieldDefinition, FollowUp, PatientNote, FollowUpCall, FollowUpOutcome, FollowUpStatus, HistoryEvent, Id, InventoryBatch, InventoryItem, InventoryItemPatch,
  InventoryTransaction, InventoryTxType, Invoice, InvoiceLineItem, LabAttachment, LabOrder,
  LabResultLine, NewAppointment, NewEncounter, NewInventoryItem, NewServicePrice, Patient,
  PatientAccount, Payment, Prescription, PrescriptionItem, PricingMode, QueueEntry, Role,
  ServiceKind,
  ServicePrice, ServicePricePatch, Subscription, SubscriptionInvoice, SubscriptionSummary,
  SuggestedLinesResponse, SupportRequest, Tenant,
  TenantConfig, ReferralProgram, ReferralStatus,
  User,
} from "@/lib/types";
import type {
  ConsentContent, ConsentForm, ConsentTemplate, ConsentVersion, PatientConsent,
} from "@/lib/consent";
import { priceToSend } from "@/lib/prescription-pricing";
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
export type { ReferralProgram, ReferralStatus };

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
/** Every note on a patient, newest first — corrections included. */
export const listPatientNotes = (patientId: Id) => get<PatientNote[]>(`/v1/patients/${patientId}/notes`);

/** Add a note. With `amends_id` it is a correction to an earlier note of your own. */
export const addPatientNote = (patientId: Id, note: { body: string; amends_id?: Id }) =>
  post<PatientNote>(`/v1/patients/${patientId}/notes`, note);

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

export const getAppointment = (id: Id) => get<Appointment>(`/v1/appointments/${id}`);

export const listQueue = () => get<QueueEntry[]>("/v1/queue");

/* ---- follow-up calls ----------------------------------------------------------- */

export interface FollowUpQuery {
  /** how far ahead, counting today */
  days: number;
  /** the Today tab: one date rather than the window */
  date?: string;
  status?: FollowUpStatus;
  doctor_id?: Id;
  search?: string;
  limit?: number;
  offset?: number;
}

/** A page of the call list. `counts` (by status) and `today` cover the whole
    window, before the tab's own filter, so every tab's number stays true. */
export interface FollowUpPage extends Page<FollowUp> {
  counts: Record<FollowUpStatus, number>;
  today: number;
}

export const listFollowUps = (query: FollowUpQuery) =>
  get<FollowUpPage>("/v1/follow-ups", {
    days: query.days,
    date: query.date,
    status: query.status,
    doctor_id: query.doctor_id,
    search: query.search,
    limit: query.limit ?? 25,
    offset: query.offset ?? 0,
  });

export const listFollowUpCalls = (appointmentId: Id) =>
  get<FollowUpCall[]>(`/v1/follow-ups/${appointmentId}/calls`);

export interface NewFollowUpCall {
  outcome: FollowUpOutcome;
  notes?: string;
  /** `rescheduled` only — where the booking moves to */
  new_slot?: { date: string; time: string; doctor_id?: Id; duration_min?: number };
  /** `declined` only — cancel the booking as well */
  cancel_appointment?: boolean;
}

/** Log a call and act on it. A move is checked against the diary again on the
    server, under a lock, and answers 409 if the slot went in the meantime. */
export const recordFollowUpCall = (appointmentId: Id, call: NewFollowUpCall) =>
  post<FollowUp>(`/v1/follow-ups/${appointmentId}/calls`, call);

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

/** The patient's file as a printable document on the clinic's letterhead —
 *  clinical only, no billing; the lab section follows the reader's role. */
export const getPatientRecordPdf = (id: Id) => requestBlob(`/v1/patients/${id}/record.pdf`);

export interface PrescriptionQuery extends PageQuery {
  status?: Prescription["status"];
  patient_id?: Id;
}

export const listPrescriptions = async () =>
  (await get<CountedPage<Prescription>>("/v1/prescriptions", WHOLE_COLLECTION)).items;

export const getPrescription = (id: Id) => get<Prescription>(`/v1/prescriptions/${id}`);

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

/* ---- referral credits ---------------------------------------------------- */

export const getReferralProgram = () => get<ReferralProgram>("/v1/tenant/referrals");

/** Mints on the first call; every call after that returns the same code. */
export const mintReferralCode = () => post<ReferralProgram>("/v1/tenant/referral-code");

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
  qualifications?: string;
  registration_no?: string;
  password?: string;
}

export const createUser = (input: NewUser) =>
  post<User>("/v1/users", {
    name: input.name,
    email: input.email,
    role: input.role,
    speciality: input.speciality?.trim() || null,
    qualifications: input.qualifications?.trim() || null,
    registration_no: input.registration_no?.trim() || null,
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

export interface UserChanges {
  name?: string;
  /** a new username; anyone still invited is sent a fresh link at it */
  email?: string;
  role?: Role;
  /** "" clears it */
  speciality?: string;
  /** "" clears it */
  qualifications?: string;
  /** "" clears it */
  registration_no?: string;
}

/**
 * Correct a colleague's details. Refused (409) for an admin's own role, for
 * the clinic's last practice admin, and for an email somebody else uses.
 */
export const updateUser = (userId: Id, changes: UserChanges) =>
  patch_<User>(`/v1/users/${userId}`, changes);

/**
 * Remove an account that never recorded anything. Anyone whose name is on a
 * record is refused (409) with what they recorded — lock them instead.
 */
export const deleteUser = (userId: Id) => del<void>(`/v1/users/${userId}`);

/* ---- configuration (§3.3) --------------------------------------------------- */

export const updateConfig = (changes: Partial<TenantConfig>) =>
  patch_<TenantConfig>("/v1/tenant/config", stripReadOnly(changes));

/** The clinic's own mark. A second upload replaces the first — there is only
 *  ever one, so there is nothing here to list or address by id. */
export const uploadClinicLogo = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return upload<TenantConfig>("/v1/tenant/config/logo", form);
};

export const deleteClinicLogo = () => del<TenantConfig>("/v1/tenant/config/logo");

/** The logo's own bytes, as a blob the caller turns into an object URL. Only
 *  called once `has_logo` says there is one, or this 404s. */
export const getClinicLogoFile = () => requestBlob("/v1/tenant/config/logo");

/**
 * `tenant_id` and `timezone` are the server's to decide — it sends them, and
 * rejects them coming back (the patch refuses unknown keys), which used to
 * fail every save from the configuration tab.
 */
function stripReadOnly(config: Partial<TenantConfig>) {
  const { tenant_id: _tenantId, timezone: _timezone, has_logo: _hasLogo, ...rest } =
    config as Partial<TenantConfig> & { tenant_id?: string; timezone?: string; has_logo?: boolean };
  return rest;
}

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

/* Both return the whole encounter: a signed one names the queue token it
   closed, which the store writes straight into the cached board. */
export const createEncounter = (
  e: NewEncounter, sign: boolean,
) => post<Encounter>("/v1/encounters", {
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
});

export const updateEncounter = (id: Id, changes: Partial<Encounter> & { sign?: boolean }) => {
  const { chief_complaint, notes, diagnosis, follow_up_days, clinical_ext, sign } = changes;
  const body = { chief_complaint, notes, diagnosis, follow_up_days, clinical_ext, sign };
  const defined = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  return patch_<Encounter>(`/v1/encounters/${id}`, defined);
};

/* ---- prescriptions & pharmacy (§3.8, §3.9) ------------------------------------ */

/** One line as the API takes it. A prescribe-only line goes without a price —
 *  the server would drop it anyway. */
const prescriptionLineBody = (
  i: Omit<PrescriptionItem, "id" | "prescription_id" | "dispensed_qty" | "status">,
) => ({
  medicine: i.medicine, strength: i.strength, dosage: i.dosage, frequency: i.frequency,
  duration: i.duration, instructions: i.instructions, qty: i.qty, item_id: i.item_id,
  dispense: i.dispense, unit_price: priceToSend(i),
});

export const createPrescription = async (
  encounterId: Id,
  _patientId: Id,
  _doctorId: Id,
  items: Array<Omit<PrescriptionItem, "id" | "prescription_id" | "dispensed_qty" | "status">>,
) => (await post<Prescription>(`/v1/encounters/${encounterId}/prescriptions`, {
  /* the patient and the prescriber come from the encounter and the session */
  items: items.map(prescriptionLineBody),
})).id;

/** The prescription as it should now read, until the visit is billed. An
 *  empty list takes it away; the server answers null then. */
export const replacePrescription = async (
  encounterId: Id,
  items: Array<Omit<PrescriptionItem, "id" | "prescription_id" | "dispensed_qty" | "status">>,
) => (await put_<Prescription | null>(`/v1/encounters/${encounterId}/prescription`, {
  items: items.map(prescriptionLineBody),
}))?.id ?? null;

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

/* A sheet of stock lines, in and out. A row is matched on its SKU — a known
   code updates the line, a new one opens it — and a quantity received goes on
   the ledger as a purchase. The import runs in the background: the upload is
   answered with a job, the worker writes every row or none, and the file is
   deleted when it finishes either way. The export is in the import's own
   layout, so it can be edited and sent back. */

/** What a finished background import says — the counts for its kind, and on a
    failure the rows to fix. */
export interface ImportJobReport {
  total: number;
  valid: number;
  invalid: number;
  committed: boolean;
  created: number;
  updated: number;
  /** inventory: rows that brought stock with them */
  stocked: number;
  /** staff: invitations that left */
  invited: number;
  /** rows that repeat another row, or something already here */
  duplicates: number;
  /** on a failure, the rows that need fixing */
  rows: {
    row: number;
    label: string;
    ok: boolean;
    errors: string[];
    action: "create" | "update";
    qty: number;
    /** set when the row repeats another: "row 4", or the SKU or email already here */
    duplicate_of: string | null;
  }[];
}

export interface ImportJob {
  id: Id;
  status: "queued" | "running" | "done" | "failed";
  filename: string;
  created_at: string;
  finished_at: string | null;
  /** on a failure, the one sentence that says why */
  error: string;
  report: ImportJobReport | null;
  /** still queued well after the upload — the worker never got it; offer Retry */
  retryable: boolean;
}

/** The sample sheet: every field, the fixed choices as dropdowns, an example per pricing mode. */
export const inventoryImportTemplate = () => requestBlob("/v1/inventory/import/template");

/** Hand a sheet to the worker. Answers at once with the job to poll. */
export const startInventoryImport = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return upload<ImportJob>("/v1/inventory/import", form);
};

export const getInventoryImport = (id: Id) => get<ImportJob>(`/v1/inventory/import/jobs/${id}`);

/** The clinic's most recent import — null when there has never been one. */
export const latestInventoryImport = () => get<ImportJob | null>("/v1/inventory/import/jobs/latest");

/** Hand a stuck import to the worker again. Only a `retryable` one; anything else is a 409. */
export const retryInventoryImport = (id: Id) => post<ImportJob>(`/v1/inventory/import/jobs/${id}/retry`);

/* ---- the staff list as a spreadsheet — the Team tab's import and export.
   The import only adds people: an email the clinic already has is a
   duplicate, never an update. Each person is emailed an invitation. */

export const staffImportTemplate = () => requestBlob("/v1/users/import/template");

export const exportStaff = () => requestBlob("/v1/users/export");

export const startStaffImport = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return upload<ImportJob>("/v1/users/import", form);
};

export const getStaffImport = (id: Id) => get<ImportJob>(`/v1/users/import/jobs/${id}`);

export const latestStaffImport = () => get<ImportJob | null>("/v1/users/import/jobs/latest");

export const retryStaffImport = (id: Id) => post<ImportJob>(`/v1/users/import/jobs/${id}/retry`);

/** Every stock line with what is on hand, and the batches on the shelf. */
export const exportInventory = () => requestBlob("/v1/inventory/export");

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

/** What became of one emailed invoice. `failed` is an answer, not an error: the
 *  mail server would not take it, and `detail` says so in a sentence. */
export interface InvoiceEmailResult {
  status: "sent" | "failed";
  to: string;
  detail: string;
  invoice: Invoice;
}

/**
 * Email an invoice to its patient, the PDF attached, worded as the clinic set
 * it up in Settings. `to` left out sends it to the address on their record.
 * Refused with a sentence when there is nobody to send to (422), or the
 * invoice is void or still a draft (409).
 */
export const sendInvoiceEmail = (id: Id, to?: string) =>
  post<InvoiceEmailResult>(`/v1/billing/invoices/${id}/send-email`, to ? { to } : {});

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

export interface FinalSettlement {
  /** the one bill raised now, if anything was left to bill */
  invoice: Invoice | null;
  /** counter bills that were issued and never paid, now on that one */
  folded: string[];
  paid: number;
  remaining: number;
}

/** The patient is leaving: one bill for everything still owing — unpaid
 *  counter bills folded in, what a window was paid left out — and, unless
 *  they pay later, one payment for it. */
export const finalSettlement = (
  patientId: Id,
  input: { collect: boolean; method: Payment["method"]; reference?: string },
) => post<FinalSettlement>(`/v1/billing/patients/${patientId}/final-settlement`, input);

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

/*
 * The money figures below are optional because the server leaves them out for
 * anyone but a practice admin — `revenue:read` — rather than sending them for
 * the screen to hide. `revenue_visible` says which answer this is.
 */
export interface Analytics {
  range: { from: string; to: string; days: number };
  /** false when the money figures were left out */
  revenue_visible: boolean;
  core: {
    patients: number;
    new_patients: number;
    seen_today: number;
    never_visited: number;
    appointments_today: number;
    no_shows: number;
    encounters: number;
    prescriptions: number;
    revenue?: number;
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
    pharmacy: {
      dispensed_units: number; dispensed_value?: number;
      prescriptions_waiting: number; fully_dispensed: number;
    };
    lab: {
      total: number; ordered: number; pending: number;
      resulted: number; verified: number; abnormal: number;
    };
    inventory: {
      items: number;
      below_reorder: Array<{ item_id: Id; name: string; on_hand: number; reorder_level: number }>;
      expiring_soon: Array<{ batch_no: string; expiry: string; qty: number; item: string; days_left: number }>;
    };
    billing: {
      billed?: number; paid?: number; outstanding?: number;
      count: number; unpaid: number; drafts: number;
      revenue_mix?: Labelled[];
    };
    advanced_reports: {
      age_cohort: Labelled[];
      sex_split: Labelled[];
      clinicians: Array<{
        user_id: Id; name: string; initials: string; speciality: string | null;
        encounters: number; prescriptions: number; revenue?: number;
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
 * database. Every clinic has every module, so every panel is always present;
 * only the money figures inside them are withheld from a role without
 * `revenue:read` (`revenue_visible`).
 */
export const getAnalytics = (days: number) => get<Analytics>("/v1/analytics/dashboard", { days });

/** The reports page as a PDF — the same read model, for filing or printing. */
export const getReportPdf = (days: number) =>
  requestBlob("/v1/analytics/report.pdf", { query: { days } });

/* ---- platform (§3.1) ------------------------------------------------------------ */

export interface PlatformTenantRow {
  tenant: Tenant;
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
}

interface TenantCreatedBody {
  tenant: Tenant;
  admin_user_id: Id;
  admin_email: string;
  /** always `queued`: the worker sends it; the admin's `link_email_status` says how it went */
  invitation_status: string;
}

const asCreated = (body: TenantCreatedBody): TenantCreated => ({
  tenant: body.tenant,
  tenantId: body.tenant.id,
  userId: body.admin_user_id,
  slug: body.tenant.slug,
  adminEmail: body.admin_email,
});

/**
 * Create a clinic.
 *
 * No password, anywhere: the first administrator is written without one and
 * emailed a link to choose their own — by the worker, after this answers. A
 * clinic whose admin never got the link exists but cannot be signed into, so
 * the console watches the admin's `link_email_status` until it says.
 */
export const createTenant = async (input: {
  name: string; slug: string; city: string; clinical_type: ClinicalTypeKey;
  admin_name: string; admin_email: string; referral_code?: string;
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

/** Email the desk about a failed or stuck request again. Only a `retryable` one; anything else is a 409. */
export const retrySupportRequest = (tenantId: Id, requestId: Id) =>
  post<SupportRequest>(`/v1/platform/tenants/${tenantId}/support-requests/${requestId}/retry`);

/** Who referred this clinic (if anyone), and its own referral programme. */
export const tenantReferrals = (tenantId: Id) =>
  get<{ referred_by: { referrer_tenant_name: string; code_used: string; status: ReferralStatus; created_at: string } | null; program: ReferralProgram }>(
    `/v1/platform/tenants/${tenantId}/referrals`,
  );

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
  invite_token_ttl_seconds: number;
  reset_token_ttl_seconds: number;
  reminder_lead_hours: number;
  rent_due_days: number;
  rent_grace_days: number;
  rent_reminder_days_before_due: number;
  /** the one monthly fee every billed clinic pays, for the whole product */
  subscription_fee_monthly: number;
  referral_credit_amount: number;
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
  /** the flat monthly fee, as `PlatformSettings.subscription_fee_monthly` —
   *  repeated here because the support desk can read this and not settings */
  fee_monthly: number;
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
  /** what the job is, in words — "Password reset email", "Spreadsheet import" */
  label: string;
  status: JobStatus;
  /** Celery's own state — the buckets above fold some of them together */
  state: string;
  worker: string | null;
  queue: string | null;
  /** the call as the worker was handed it, already rendered by Celery */
  args: string;
  kwargs: string;
  /** the call, labelled — clinics and accounts by name where they were found */
  arguments: { label: string; value: string }[];
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
  /** each task name in words, for the dropdown */
  task_labels: Record<string, string>;
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

/* ---- consent forms ----------------------------------------------------------
   The clinic's forms are versioned on the server: edits go to the one draft,
   publishing turns it into the published version and archives the last, and
   a patient's consent copies the exact version it was asked against. */

export const listConsentTemplates = () => get<ConsentTemplate[]>("/v1/consent/templates");
export const listConsentForms = () => get<ConsentForm[]>("/v1/consent/forms");
export const getConsentForm = (id: Id) => get<ConsentForm>(`/v1/consent/forms/${id}`);
export const createConsentForm = (template_key: string) =>
  post<ConsentForm>("/v1/consent/forms", { template_key });
export const getConsentVersion = (formId: Id, n: number) =>
  get<ConsentVersion>(`/v1/consent/forms/${formId}/versions/${n}`);
/** Begin editing — or, with `fromVersion`, copy an older version into the draft. */
export const startConsentDraft = (formId: Id, fromVersion?: number) =>
  post<ConsentForm>(`/v1/consent/forms/${formId}/draft`, fromVersion ? { from_version: fromVersion } : {});
export const saveConsentDraft = (formId: Id, content: ConsentContent) =>
  put_<ConsentForm>(`/v1/consent/forms/${formId}/draft`, { content });
export const discardConsentDraft = (formId: Id) => del<ConsentForm>(`/v1/consent/forms/${formId}/draft`);
export const publishConsentForm = (formId: Id) => post<ConsentForm>(`/v1/consent/forms/${formId}/publish`);
export const resetConsentForm = (formId: Id) => post<ConsentForm>(`/v1/consent/forms/${formId}/reset`);
/** One version as its printed document — the preview, the print and the blank form are this file. */
export const consentVersionPdf = (formId: Id, n: number) =>
  requestBlob(`/v1/consent/forms/${formId}/versions/${n}/document.pdf`);

export const listPatientConsents = (patientId: Id) =>
  get<PatientConsent[]>("/v1/consent/records", { patient_id: patientId });
export const getPatientConsent = (id: Id) => get<PatientConsent>(`/v1/consent/records/${id}`);
export const requestPatientConsent = (body: {
  patient_id: Id; form_id: Id; provider_id?: Id | null; field_values: Record<string, string>;
}) => post<PatientConsent>("/v1/consent/records", body);
export const signPatientConsent = (id: Id, body: {
  signer_name: string; signer_relationship: string; acknowledged: string[];
  patient_signature: string; provider_signature: string | null;
}) => post<PatientConsent>(`/v1/consent/records/${id}/sign`, body);
export const declinePatientConsent = (id: Id, reason: string) =>
  post<PatientConsent>(`/v1/consent/records/${id}/decline`, { reason });
export const patientConsentPdf = (id: Id) => requestBlob(`/v1/consent/records/${id}/document.pdf`);
