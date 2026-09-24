"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { qk } from "./keys";
import { useSession } from "@/lib/store/session";
import { defaultConfig } from "@/lib/data/repository";
import { withPrices } from "@/lib/data/catalog";
import type {
  Feature, FieldDefinition, FeatureKey, Id, Patient, ServiceKind, ServicePrice, SupportRequest, Tenant, TenantConfig,
  TenantFeature, User,
} from "@/lib/types";

/* ==========================================================================
   Read hooks.

   Each one is tenant-scoped without saying so: the request goes to this
   clinic's address carrying this clinic's session, and the server derives the
   tenant from those. There is no tenant argument to get wrong.

   Everything hangs off `["tenant", tenantId]`, so one write can invalidate the
   whole clinic subtree and nothing else is disturbed.
   ========================================================================== */

const useTenantId = () => useSession().session.tenantId;
const useSignedIn = () => useSession().session.signedIn;

/** One shared empty array: a fresh `[]` each render would restart every memo. */
const EMPTY: never[] = [];

const GUEST: User = {
  id: "", tenant_id: "", name: "Signed out", role: "receptionist", email: "",
  initials: "—", status: "active", failed_attempts: 0, last_sign_in: null,
};

/**
 * The clinic behind this address, for screens that render before anyone is
 * signed in — the login page and the unknown/suspended stages. It is the one
 * unauthenticated read the API offers, and it answers with a name and a status,
 * nothing about the people inside.
 */
export function useHostTenant() {
  const { host, ready } = useSession();
  const query = useQuery({
    queryKey: qk.hostTenant(host.slug ?? ""),
    queryFn: api.getPublicTenant,
    enabled: ready && host.kind === "tenant" && !!host.slug,
    retry: false,
    staleTime: 60_000,
  });
  return { tenant: query.data ?? null, isPending: query.isPending, isError: query.isError };
}

/** The full clinic record, once there is a session to read it with. */
export function useTenantRecord() {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.tenant(t),
    queryFn: api.getTenant,
    enabled: signedIn && !!t,
    staleTime: 5 * 60_000,
  });
}

/**
 * The current clinic and the person signed into it.
 *
 * While the authenticated record is in flight the public one stands in, so the
 * shell has a name and a clinical type from the first paint rather than a flash
 * of placeholder.
 */
export function useTenant(): { tenant: Tenant; user: User; role: User["role"] } {
  const { user } = useSession();
  const { data: record } = useTenantRecord();
  const { tenant: publicTenant } = useHostTenant();

  const tenant = useMemo<Tenant>(() => record ?? {
    id: "", name: publicTenant?.name ?? "…", slug: publicTenant?.slug ?? "",
    clinical_type: publicTenant?.clinical_type ?? "dental",
    status: publicTenant?.status ?? "active",
    city: "", plan: "", since: "", timezone: "", today: "",
  } as Tenant, [record, publicTenant]);

  return { tenant, user: user ?? GUEST, role: (user ?? GUEST).role };
}

function useClinicQuery<T>(key: readonly unknown[], fn: () => Promise<T>, enabled = true) {
  const signedIn = useSignedIn();
  return useQuery({ queryKey: key, queryFn: fn, enabled: signedIn && enabled });
}

/**
 * The shell-critical reads — who works here, what the clinic bought, how it is
 * configured, what the forms look like — decide *what renders at all*, and
 * every call site treats them as present. Rather than push a null check into
 * each one, they resolve to an empty set until the answer arrives; the shell
 * holds its loading stage until `useShellReady()` says they are all in.
 */
function useResolved<T>(query: { data: T | undefined }, fallback: T): T {
  return query.data ?? fallback;
}

export function useUsers() {
  const t = useTenantId();
  const query = useClinicQuery(qk.users(t), api.listUsers);
  return { ...query, data: useResolved<User[]>(query, EMPTY) };
}

export function useDoctors() {
  const t = useTenantId();
  const query = useClinicQuery(qk.doctors(t), api.listDoctors);
  return { ...query, data: useResolved<User[]>(query, EMPTY) };
}

export function useFeatures() {
  const t = useTenantId();
  const query = useClinicQuery(qk.features(t), api.listFeatures);
  return { ...query, data: useResolved<TenantFeature[]>(query, EMPTY) };
}

/** The module catalogue, priced — see `useFeatureCatalog` and `usePlatformCatalog`. */
export interface FeatureCatalog {
  features: Feature[];
  byKey: Record<FeatureKey, Feature>;
  /** false until the prices have arrived; a price shown before then is a guess */
  priced: boolean;
  /** still waiting on the first answer — false again if that answer was an error */
  isPending: boolean;
}

function catalogOf(rows: Parameters<typeof withPrices>[0], isPending: boolean): FeatureCatalog {
  const features = withPrices(rows);
  return {
    features,
    byKey: Object.fromEntries(features.map((f) => [f.key, f])) as Record<FeatureKey, Feature>,
    priced: !!rows,
    isPending,
  };
}

/**
 * Every module with what this clinic would be charged for it.
 *
 * The price is the platform's, set in the console, so it is read rather than
 * compiled in: a clinic looking at a padlocked module is quoted the figure the
 * platform will actually bill. Screens render a placeholder until `priced`.
 */
export function useFeatureCatalog(): FeatureCatalog {
  const t = useTenantId();
  const query = useClinicQuery(qk.catalogFeatures(t), api.listCatalogFeatures, !!t);
  return useMemo(() => catalogOf(query.data, query.isPending), [query.data, query.isPending]);
}

/** The same catalogue from the console, where the super admin sets the prices. */
export function usePlatformCatalog(): FeatureCatalog {
  const { platformSession } = useSession();
  const query = useQuery({
    queryKey: qk.platformCatalog(),
    queryFn: api.listPlatformCatalogFeatures,
    enabled: platformSession.signedIn,
  });
  return useMemo(() => catalogOf(query.data, query.isPending), [query.data, query.isPending]);
}

export function usePlatformSettings() {
  const { platformSession } = useSession();
  return useQuery({
    queryKey: qk.platformSettings(),
    queryFn: api.getPlatformSettings,
    enabled: platformSession.signedIn,
  });
}

/** Astrale's own desk — shown until the live answer arrives, so the help
 *  menu and the on-hold screen never render a blank phone number or a
 *  `mailto:` with nobody in it. */
const SUPPORT_FALLBACK: api.PublicSettings = {
  support_email: "support@astrale.health",
  support_phone: "+91 80 4718 2200",
  support_hours: "Monday to Saturday, 9am – 7pm IST",
};

/** No session gate — anyone on a clinic's own address may read who to ask
 *  for help, signed in or not. */
export function useSupportInfo() {
  return useQuery({
    queryKey: qk.publicSettings(),
    queryFn: api.getPublicSettings,
    staleTime: 5 * 60_000,
    placeholderData: SUPPORT_FALLBACK,
  });
}

/**
 * What this clinic owes the platform — the practice admin's view. Only asked
 * for by someone who may see it; the API refuses everyone else with a 403.
 */
export function useSubscription(enabled = true) {
  const t = useTenantId();
  return useClinicQuery(qk.subscription(t), api.getSubscription, enabled && !!t);
}

/** Every clinic's bills, from the console. */
export function usePlatformBilling() {
  const { platformSession } = useSession();
  return useQuery({
    queryKey: qk.platformBilling(),
    queryFn: api.platformBilling,
    enabled: platformSession.signedIn,
  });
}

/** One clinic's bills, from the console. */
export function usePlatformSubscription(tenantId: Id | null) {
  const { platformSession } = useSession();
  return useQuery({
    queryKey: qk.platformSubscription(tenantId ?? ""),
    queryFn: () => api.tenantSubscription(tenantId!),
    enabled: platformSession.signedIn && !!tenantId,
  });
}

/** This clinic's asks of the support desk, newest first. */
export function useSupportRequests() {
  const t = useTenantId();
  const query = useClinicQuery(qk.supportRequests(t), api.listSupportRequests);
  return { ...query, data: useResolved<SupportRequest[]>(query, EMPTY) };
}

export function useConfig() {
  const t = useTenantId();
  const query = useClinicQuery(qk.config(t), api.getConfig);
  const fallback = useMemo(() => defaultConfig(t), [t]);
  return { ...query, data: useResolved<TenantConfig>(query, fallback) };
}

export function useFieldDefinitions() {
  const t = useTenantId();
  const query = useClinicQuery(qk.fields(t), api.listFieldDefinitions);
  return { ...query, data: useResolved<FieldDefinition[]>(query, EMPTY) };
}

/** §3.3 — resolved on the server: common → clinical_type → tenant. */
export function useSchema(entity: FieldDefinition["entity"]) {
  const t = useTenantId();
  const { tenant } = useTenant();
  const query = useClinicQuery(
    qk.schema(t, entity, tenant.clinical_type),
    () => api.getSchema(entity),
    !!tenant.clinical_type,
  );
  return { ...query, data: useResolved<FieldDefinition[]>(query, EMPTY) };
}

/** Common medicines for the prescription editor — tenant- and clinical-type-
 *  filtered on the server. Catalog data changes rarely, so it stays fresh for
 *  a while, mirroring `useTenantRecord`. */
export function useMedicines() {
  const t = useTenantId();
  const signedIn = useSignedIn();
  const query = useQuery({
    queryKey: qk.medicines(t),
    queryFn: api.getMedicines,
    enabled: signedIn && !!t,
    staleTime: 5 * 60_000,
  });
  return { ...query, data: useResolved<api.MedicineSuggestionOut[]>(query, EMPTY) };
}

/* ---- clinic data ---------------------------------------------------------- */

/**
 * One page of the register, straight from the database.
 *
 * `placeholderData` keeps the previous page on screen while the next one is in
 * flight, so paging does not blink through an empty table.
 */
export function usePatientPage(query: api.PatientQuery) {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.patientPage(t, query as Record<string, unknown>),
    queryFn: () => api.listPatients(query),
    enabled: signedIn,
    placeholderData: (previous) => previous,
  });
}

/** A short list for pickers: the server does the matching, debounced by the caller. */
export function usePatientSearch(term: string, { enabled = true } = {}) {
  const t = useTenantId();
  const signedIn = useSignedIn();
  const trimmed = term.trim();
  const query = useQuery({
    queryKey: qk.patientSearch(t, trimmed),
    queryFn: () => api.searchPatients(trimmed, 8),
    enabled: signedIn && enabled && trimmed.length >= 2,
    placeholderData: (previous) => previous,
  });
  return { ...query, data: useResolved<Patient[]>(query, EMPTY) };
}

/* ---- the paged lists -------------------------------------------------------

   One hook per list screen. Each sends the whole question — search, filter,
   sort and page — to the database and gets back that page and the number of
   rows it matched. `placeholderData` keeps the page already on screen while the
   next one is in flight, so paging does not blink through an empty table.

   These sit alongside the whole-collection hooks below rather than replacing
   them: a day grid, a patient's own history and the rail's badge counts are not
   pages, and still ask for everything.
   ============================================================================ */

function usePagedQuery<T extends { total: number }>(
  key: readonly unknown[], fn: () => Promise<T>, enabled = true,
) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: key,
    queryFn: fn,
    enabled: signedIn && enabled,
    placeholderData: (previous) => previous,
  });
}

/** One page of the diary — the list view, not the day or week grid. */
export function useAppointmentPage(query: api.AppointmentQuery, { enabled = true } = {}) {
  const t = useTenantId();
  return usePagedQuery(
    qk.appointmentPage(t, query as Record<string, unknown>),
    () => api.listAppointmentPage(query),
    enabled,
  );
}

/** One page of the case book. */
export function useEncounterPage(query: api.EncounterQuery, { enabled = true } = {}) {
  const t = useTenantId();
  return usePagedQuery(
    qk.encounterPage(t, query as Record<string, unknown>),
    () => api.listEncounterPage(query),
    enabled,
  );
}

/** One page of prescriptions, with the tab counts the server worked out. */
export function usePrescriptionPage(query: api.PrescriptionQuery, { enabled = true } = {}) {
  const t = useTenantId();
  return usePagedQuery(
    qk.prescriptionPage(t, query as Record<string, unknown>),
    () => api.listPrescriptionPage(query),
    enabled,
  );
}

/** §3.14 — the whole read model, computed server-side. */
export function useAnalytics(days: number) {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.analytics(t, days),
    queryFn: () => api.getAnalytics(days),
    enabled: signedIn,
    placeholderData: (previous) => previous,
  });
}

export function usePatient(id: Id) {
  const t = useTenantId();
  return useClinicQuery(qk.patient(t, id), () => api.getPatient(id), !!id);
}

export function usePatientHistory(id: Id) {
  const t = useTenantId();
  return useClinicQuery(qk.patientHistory(t, id), () => api.getPatientHistory(id), !!id);
}

export function useAppointments() {
  const t = useTenantId();
  return useClinicQuery(qk.appointments(t), api.listAppointments);
}

export function useQueue() {
  const t = useTenantId();
  return useClinicQuery(qk.queue(t), api.listQueue);
}

export function useEncounters() {
  const t = useTenantId();
  return useClinicQuery(qk.encounters(t), api.listEncounters);
}

export function useEncounter(id: Id) {
  const t = useTenantId();
  return useClinicQuery(qk.encounter(t, id), () => api.getEncounter(id), !!id);
}

export function usePrescriptions() {
  const t = useTenantId();
  return useClinicQuery(qk.prescriptions(t), api.listPrescriptions);
}

/* The purchasable modules answer 403 when a clinic has not bought them, so
   these three only ask when the entitlement says they can. */
function useFeatureEnabled(key: Parameters<typeof api.purchaseFeature>[0]) {
  const { data: features } = useFeatures();
  return (features ?? EMPTY).some((f) => f.feature_key === key && f.status === "active");
}

export function useLabOrders() {
  const t = useTenantId();
  return useClinicQuery(qk.labOrders(t), api.listLabOrders, useFeatureEnabled("lab"));
}

/**
 * One order, kept in step with what the bench does to it.
 *
 * The drawer used to read its order out of the list it was opened from, which
 * only worked while the list held everything: verifying an order takes it off
 * the Open page, and the drawer would have been left showing the row as it was.
 */
export function useLabOrder(id: Id) {
  const t = useTenantId();
  return useClinicQuery(qk.labOrder(t, id), () => api.getLabOrder(id), !!id);
}

/** One page of the lab's order book. */
export function useLabOrderPage(query: api.LabOrderQuery, { enabled = true } = {}) {
  const t = useTenantId();
  const gated = useFeatureEnabled("lab");
  return usePagedQuery(
    qk.labOrderPage(t, query as Record<string, unknown>),
    () => api.listLabOrderPage(query),
    enabled && gated,
  );
}

/**
 * The files filed against one lab order.
 *
 * Names and sizes only — the file itself is a separate request, made when
 * somebody actually opens it.
 */
export function useLabAttachments(orderId: Id) {
  const t = useTenantId();
  const gated = useFeatureEnabled("lab");
  return useClinicQuery(
    qk.labAttachments(t, orderId),
    () => api.listLabAttachments(orderId),
    !!orderId && gated,
  );
}

/**
 * What this clinic charges (§3.12).
 *
 * Not behind a feature gate: a tariff is configuration, and the composer needs
 * it whether or not the lab module was ever bought. It changes rarely, so it
 * stays fresh for a while — like the catalogues.
 */
export function useServicePrices(query: { kind?: ServiceKind; active?: boolean } = {}) {
  const t = useTenantId();
  const signedIn = useSignedIn();
  const key = query as Record<string, unknown>;
  const result = useQuery({
    queryKey: qk.servicePrices(t, key),
    queryFn: () => api.listServicePrices(query),
    enabled: signedIn && !!t,
    staleTime: 5 * 60_000,
  });
  return { ...result, data: useResolved<ServicePrice[]>(result, EMPTY) };
}

export function useInventoryItems() {
  const t = useTenantId();
  return useClinicQuery(qk.inventoryItems(t), api.listInventoryItems, useFeatureEnabled("inventory"));
}

export function useInventoryTx() {
  const t = useTenantId();
  return useClinicQuery(qk.inventoryTx(t), api.listInventoryTx, useFeatureEnabled("inventory"));
}

export function useInventoryBatches() {
  const t = useTenantId();
  return useClinicQuery(qk.inventoryBatches(t), api.listInventoryBatches, useFeatureEnabled("inventory"));
}

export function useInvoices() {
  const t = useTenantId();
  return useClinicQuery(qk.invoices(t), api.listInvoices, useFeatureEnabled("billing"));
}

/** One page of the ledger, with the tab counts the server worked out. */
export function useInvoicePage(query: api.InvoiceQuery, { enabled = true } = {}) {
  const t = useTenantId();
  const gated = useFeatureEnabled("billing");
  return usePagedQuery(
    qk.invoicePage(t, query as Record<string, unknown>),
    () => api.listInvoicePage(query),
    enabled && gated,
  );
}

/**
 * What this visit would bill for, priced from the clinic's own tariff.
 *
 * The arithmetic is the server's — the consultation, each scan by its code, and
 * anything dispensed at its stock price — so the composer quotes what the
 * practice admin set rather than a number in the browser.
 */
export function useSuggestedLines(encounterId: Id | null) {
  const t = useTenantId();
  const gated = useFeatureEnabled("billing");
  return useClinicQuery(
    qk.suggestedLines(t, encounterId ?? ""),
    () => api.suggestedInvoiceLines(encounterId as Id),
    !!encounterId && gated,
  );
}

/**
 * A patient's account across all three counters.
 *
 * Both the dispensing window and the billing desk read this, so they can never
 * disagree about what is owed. It is deliberately not cached for long: money
 * moves while somebody is standing at the counter.
 */
export function usePatientAccount(patientId: Id | null) {
  const t = useTenantId();
  const gated = useFeatureEnabled("billing");
  return useClinicQuery(
    qk.patientAccount(t, patientId ?? ""),
    () => api.getPatientAccount(patientId as Id),
    !!patientId && gated,
  );
}

export function useInvoice(id: Id) {
  const t = useTenantId();
  return useClinicQuery(qk.invoice(t, id), () => api.getInvoice(id), !!id && useFeatureEnabled("billing"));
}

/**
 * The rail's badges: four numbers, four counts, no collections.
 *
 * Each of these is `total` off a page of one row — the database counts, the
 * browser renders the number. It used to be `.filter().length` over every
 * prescription, lab order and invoice the clinic had ever written, on every
 * screen, because the rail is always on screen.
 */
export function useRailCounters() {
  const t = useTenantId();
  const signedIn = useSignedIn();
  const hasLab = useFeatureEnabled("lab");
  const hasBilling = useFeatureEnabled("billing");

  const { data: queue } = useQueue();

  const rx = useQuery({
    queryKey: qk.prescriptionPage(t, { badge: "pending" }),
    queryFn: () => api.listPrescriptionPage({ limit: 1 }),
    enabled: signedIn,
  });

  const lab = useQuery({
    queryKey: qk.labOrderPage(t, { badge: "unverified" }),
    queryFn: () => api.listLabOrderPage({ unverified: true, limit: 1 }),
    enabled: signedIn && hasLab,
  });

  const unpaid = useQuery({
    queryKey: qk.invoicePage(t, { badge: "unpaid" }),
    queryFn: () => api.listInvoicePage({ unpaid: true, limit: 1 }),
    enabled: signedIn && hasBilling,
  });

  const counts = rx.data?.counts ?? {};
  return {
    queue: (queue ?? EMPTY).filter((e) => e.status === "waiting" || e.status === "called").length,
    pendingRx: (counts.pending ?? 0) + (counts.partially_dispensed ?? 0),
    labPending: lab.data?.total ?? 0,
    unpaid: unpaid.data?.total ?? 0,
  };
}

/* ---- module figures --------------------------------------------------------
   Three small readers over the same analytics response, so the module pages and
   the reports page quote the same numbers — computed once, in the database.
   Each resolves to zeroes while the request is in flight, and stays at zeroes
   for a clinic that has not bought the module (the API sends no key at all). */

const ZERO_BILLING = {
  billed: 0, paid: 0, outstanding: 0, count: 0, unpaid: 0, drafts: 0,
  revenue_mix: EMPTY as api.Labelled[],
};
const ZERO_PHARMACY = {
  dispensed_units: 0, dispensed_value: 0, prescriptions_waiting: 0, fully_dispensed: 0,
};
const ZERO_LAB = { total: 0, ordered: 0, pending: 0, resulted: 0, verified: 0, abnormal: 0 };

export function useBillingStats() {
  const { data } = useAnalytics(30);
  return data?.modules.billing ?? ZERO_BILLING;
}

export function usePharmacyStats() {
  const { data } = useAnalytics(30);
  return data?.modules.pharmacy ?? ZERO_PHARMACY;
}

export function useLabStats() {
  const { data } = useAnalytics(30);
  return data?.modules.lab ?? ZERO_LAB;
}

/* ---- the platform console -------------------------------------------------- */

/**
 * Every clinic, from the console. The API gathers it one clinic at a time with
 * that clinic bound to the connection, so even this cross-clinic view never
 * runs an unscoped query.
 */
export function usePlatformSnapshot() {
  const { platformSession } = useSession();
  return useQuery({
    queryKey: qk.platform(),
    queryFn: api.platformSnapshot,
    enabled: platformSession.signedIn,
  });
}

/**
 * The background-job monitor.
 *
 * Polled rather than subscribed: the numbers are a live picture of work in
 * flight, and a page that only moved when somebody reloaded it would be worse
 * than no page. The interval is deliberately unhurried — this is a monitor
 * somebody leaves open, and Flower is reading Celery's event stream either way.
 *
 * `enabled` follows the role as well as the session. A member of the support
 * desk has no business firing this every few seconds to collect 403s, and the
 * API would refuse it anyway.
 */
export function usePlatformJobs(query: api.JobQuery, options: { poll?: boolean } = {}) {
  const { platformSession, platformUser } = useSession();
  return useQuery({
    queryKey: qk.platformJobs(query as Record<string, unknown>),
    queryFn: () => api.listJobs(query),
    enabled: platformSession.signedIn && api.isSuperAdmin(platformUser),
    refetchInterval: options.poll === false ? false : 5_000,
    /* A page already on screen stays while the next one lands, so the tiles
       do not blink back to nothing every five seconds. */
    placeholderData: (previous) => previous,
  });
}

/** One job in full — the traceback and the return value the list leaves out. */
export function usePlatformJob(taskId: Id | null) {
  const { platformSession, platformUser } = useSession();
  return useQuery({
    queryKey: ["platform", "jobs", "task", taskId ?? ""],
    queryFn: () => api.getJob(taskId!),
    enabled: platformSession.signedIn && api.isSuperAdmin(platformUser) && !!taskId,
    retry: false,
  });
}

/** One clinic's entitlement rows, read from the console rather than inside it. */
export function usePlatformTenantFeatures(tenantId: Id | null) {
  const { platformSession } = useSession();
  const query = useQuery({
    queryKey: qk.platformFeatures(tenantId ?? ""),
    queryFn: () => api.tenantFeatures(tenantId!),
    enabled: platformSession.signedIn && !!tenantId,
  });
  return { ...query, data: useResolved<TenantFeature[]>(query, EMPTY) };
}

/** That clinic's staff, as the console sees them — support accounts excluded. */
export function usePlatformTenantUsers(tenantId: Id | null) {
  const { platformSession } = useSession();
  const query = useQuery({
    queryKey: qk.platformUsers(tenantId ?? ""),
    queryFn: () => api.tenantUsers(tenantId!),
    enabled: platformSession.signedIn && !!tenantId,
  });
  return { ...query, data: useResolved<User[]>(query, EMPTY) };
}

/**
 * Every clinic's entitlement rows, for the views that read across all of them.
 *
 * The snapshot already says which modules are *on*; this is what says which are
 * on trial and when each was switched on, which is the whole of what the
 * console knows about subscriptions. It is one request per clinic because that
 * is the route the API offers — each one scoped to its own tenant, which is the
 * property worth keeping — and they are cached under the same `["platform"]`
 * subtree as the snapshot, so one grant refreshes the lot.
 *
 * The screens above render from the snapshot until these land, so this is
 * detail arriving rather than a page waiting.
 */
export function usePlatformEntitlements() {
  const { platformSession } = useSession();
  const { data: snapshot } = usePlatformSnapshot();
  const ids = useMemo(
    () => (snapshot?.tenants ?? []).map((r) => r.tenant.id),
    [snapshot],
  );

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.platformFeatures(id),
      queryFn: () => api.tenantFeatures(id),
      enabled: platformSession.signedIn,
    })),
  });

  const settled = queries.every((q) => !q.isPending);
  /* Keyed by clinic, so a row can ask for its own without scanning. Rebuilt
     only when an answer actually changes — `useQueries` hands back a new array
     every render, so the array itself is no use as a dependency. */
  const signature = queries.map((q) => q.dataUpdatedAt).join(",");

  const byTenant = useMemo(() => {
    const map = new Map<Id, TenantFeature[]>();
    ids.forEach((id, i) => {
      const data = queries[i]?.data;
      if (data) map.set(id, data);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, signature]);

  return { byTenant, isPending: !settled && ids.length > 0 };
}

/* ---- composition ----------------------------------------------------------- */

/**
 * A `Db`-shaped snapshot assembled from the individual queries above.
 *
 * The cache is still per-collection — this only groups the results so the pure
 * derivations in `repository.ts` and `analytics.ts` keep working as written.
 * Anything that needs one collection should use its own hook instead.
 */
export function useClinicDb(): import("@/lib/data/repository").Db {
  /* eslint-disable react-hooks/rules-of-hooks -- fixed hook order, one call per collection */
  const { tenant } = useTenant();
  const users = useUsers().data;
  const tenantFeatures = useFeatures().data;
  const config = useConfig().data;
  const fieldDefinitions = useFieldDefinitions().data;
  const appointments = useAppointments().data;
  const queue = useQueue().data;
  const encounters = useEncounters().data;
  const prescriptions = usePrescriptions().data;
  const labOrders = useLabOrders().data;
  const inventoryItems = useInventoryItems().data;
  const inventoryTx = useInventoryTx().data;
  const inventoryBatches = useInventoryBatches().data;
  const invoices = useInvoices().data;

  return useMemo(() => ({
    tenants: tenant.id ? [tenant] : EMPTY,
    users: users ?? EMPTY,
    tenantFeatures: tenantFeatures ?? EMPTY,
    fieldDefinitions: fieldDefinitions ?? EMPTY,
    tenantConfigs: config ? [config] : EMPTY,
    appointments: appointments ?? EMPTY,
    queue: queue ?? EMPTY,
    encounters: encounters ?? EMPTY,
    prescriptions: prescriptions ?? EMPTY,
    labOrders: labOrders ?? EMPTY,
    inventoryItems: inventoryItems ?? EMPTY,
    inventoryTx: inventoryTx ?? EMPTY,
    inventoryBatches: inventoryBatches ?? EMPTY,
    invoices: invoices ?? EMPTY,
  }), [
    tenant, users, tenantFeatures, fieldDefinitions, config, appointments,
    queue, encounters, prescriptions, labOrders, inventoryItems, inventoryTx,
    inventoryBatches, invoices,
  ]);
}

/** True once the shell has what it needs: which clinic, what it bought, how it is set up. */
export function useShellReady() {
  const tenant = useTenantRecord();
  const features = useFeatures();
  const config = useConfig();
  return !tenant.isPending && !features.isPending && !config.isPending;
}

/** True once every collection this clinic needs has arrived. */
export function useClinicDataReady() {
  const queries = [
    useAppointments(), useQueue(), useEncounters(),
    usePrescriptions(), useLabOrders(), useInvoices(),
  ];
  return queries.every((q) => !q.isPending);
}
