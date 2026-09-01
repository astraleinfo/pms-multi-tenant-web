"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { qk } from "@/lib/query/keys";
import {
  useAppointments, useConfig, useFeatures, useHostTenant, useTenant as useTenantQuery, useUsers,
} from "@/lib/query/hooks";
import { SessionProvider, useSession } from "@/lib/store/session";
import { useQueueStream, type ConnectionState } from "@/lib/realtime";
import { setActiveCurrency, setToday, TODAY } from "@/lib/format";
import type {
  AccountStatus, Appointment, ClinicalTypeKey, Encounter, FeatureKey, FieldDefinition, Id,
  InventoryTxType, InvoiceLineItem, LabResultLine, NewAppointment, NewEncounter, Payment,
  PrescriptionItem, QueueEntry, Tenant, TenantConfig, User,
} from "@/lib/types";
import type { AuthResult, PlatformStaff } from "@/lib/api";

export type { Toast, Session, PlatformSession } from "@/lib/store/session";
export type { AuthResult } from "@/lib/api";
export { MAX_ATTEMPTS } from "@/lib/api";

/* ==========================================================================
   The component-facing facade.

   Reads come from TanStack Query hooks (`@/lib/query/hooks`); this module keeps
   the imperative half: the session, and every write as a mutation that
   invalidates the clinic's cache subtree when it lands.

   Every write below is a request. None of them takes a tenant: the clinic is
   the address and the session, and the server decides it. What comes back is
   the server's version of the row, so the UI never has to guess what a write
   did — a rejected state transition, a booking clash or a stock shortfall
   arrives as an error with a sentence in it, and the toast prints that.
   ========================================================================== */

interface AppContextValue {
  ready: boolean;
  /** the clinic's own date, from the server — never the browser's clock */
  today: string;
  host: ReturnType<typeof useSession>["host"];
  hostTenant: ReturnType<typeof useHostTenant>["tenant"];
  hostTenantPending: boolean;
  session: ReturnType<typeof useSession>["session"];
  platformSession: ReturnType<typeof useSession>["platformSession"];
  platformUser: PlatformStaff | null;
  permissions: string[];
  theme: "light" | "dark";
  toasts: ReturnType<typeof useSession>["toasts"];
  config: TenantConfig;
  /** whether the queue socket is currently carrying live updates */
  connection: ConnectionState;

  notify: ReturnType<typeof useSession>["notify"];
  dismissToast: (id: number) => void;
  toggleTheme: () => void;
  clinicUrl: (slug: string, path?: string) => string;
  consoleUrl: () => string;

  hasFeature: (key: FeatureKey) => boolean;
  can: (permission: string) => boolean;

  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => void;
  platformSignIn: (email: string, password: string) => Promise<api.PlatformAuthResult>;
  platformSignOut: () => void;
  createUser: (input: api.NewUser) => Promise<User>;
  setUserPassword: (userId: Id, password: string) => Promise<User>;
  setUserStatus: (userId: Id, status: AccountStatus) => void;

  updateConfig: (patch: Partial<TenantConfig>) => void;
  purchaseFeature: (key: FeatureKey) => void;
  deactivateFeature: (key: FeatureKey) => void;
  addFieldDefinition: (d: Omit<FieldDefinition, "id" | "tenant_id" | "scope" | "clinical_type">) => void;
  removeFieldDefinition: (id: Id) => void;

  createPatient: (values: Record<string, unknown>) => Promise<Id>;
  updatePatient: (id: Id, values: Record<string, unknown>) => void;

  createAppointment: (a: NewAppointment) => void;
  setAppointmentStatus: (id: Id, status: Appointment["status"]) => void;
  conflictsFor: (doctorId: Id, date: string, time: string, duration: number, ignoreId?: Id) => Appointment[];
  checkIn: (appointmentId: Id) => void;
  addWalkIn: (input: { patient_id: Id; doctor_id: Id; reason: string; priority: QueueEntry["priority"] }) => void;
  setQueueStatus: (id: Id, status: QueueEntry["status"]) => void;

  createEncounter: (e: NewEncounter, sign: boolean) => Promise<Id>;
  updateEncounter: (id: Id, patch: Partial<Encounter> & { sign?: boolean }) => void;

  createPrescription: (
    encounterId: Id, patientId: Id, doctorId: Id,
    items: Array<Omit<PrescriptionItem, "id" | "prescription_id" | "dispensed_qty" | "status">>,
  ) => void;
  dispense: (prescriptionId: Id, lines: Array<{ itemId: Id; qty: number; batch_no: string }>) => void;

  createLabOrder: (
    encounterId: Id, patientId: Id, orderedBy: Id,
    tests: Array<{ code: string; name: string; panel: string; note?: string }>,
  ) => void;
  startLabOrder: (id: Id) => void;
  saveLabResults: (id: Id, results: LabResultLine[]) => void;
  verifyLabOrder: (id: Id) => void;

  recordStockMovement: (input: { item_id: Id; type: InventoryTxType; qty: number; batch_no: string; note?: string }) => void;

  createInvoice: (input: {
    patient_id: Id; encounter_id: Id | null; line_items: Array<Omit<InvoiceLineItem, "id">>; issue: boolean;
  }) => Promise<Id>;
  addPayment: (invoiceId: Id, amount: number, method: Payment["method"], reference?: string) => void;
  issueInvoice: (id: Id) => void;
  voidInvoice: (id: Id) => void;

  createTenant: (input: {
    name: string; slug: string; city: string; clinical_type: ClinicalTypeKey;
    admin_name: string; admin_email: string; admin_password: string;
  }) => Promise<{ tenantId: Id; userId: Id; slug: string }>;
  setTenantStatus: (tenantId: Id, status: Tenant["status"]) => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppFacade>{children}</AppFacade>
    </SessionProvider>
  );
}

function AppFacade({ children }: { children: React.ReactNode }) {
  const s = useSession();
  const qc = useQueryClient();
  const tenantId = s.session.tenantId;

  const { tenant: hostTenant, isPending: hostTenantPending } = useHostTenant();
  const { tenant } = useTenantQuery();
  const { data: features } = useFeatures();
  const { data: config } = useConfig();
  const { data: appointments } = useAppointments();
  useUsers();

  /* the queue socket: §3.6's push, turned into cache invalidation */
  const connection = useQueueStream();

  /* every money figure follows the clinic's configured currency */
  React.useEffect(() => { setActiveCurrency(config.currency); }, [config.currency]);

  /* "today" is the clinic's, not the browser's — a practice in Manchester and
     a screen in its waiting room must never disagree about the date */
  React.useEffect(() => { if (tenant.today) setToday(tenant.today); }, [tenant.today]);

  /** Everything a clinic owns hangs off one key prefix. */
  const invalidateTenant = React.useCallback(
    () => { void qc.invalidateQueries({ queryKey: qk.tenant(tenantId) }); },
    [qc, tenantId],
  );
  const invalidatePlatform = React.useCallback(
    () => { void qc.invalidateQueries({ queryKey: qk.platform() }); },
    [qc],
  );

  /**
   * A mutation whose success refreshes this clinic's cache — and whose failure
   * says why. The API's messages are written for people, so they are shown as
   * they are rather than translated into something vaguer.
   */
  function useTenantMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
    return useMutation({
      mutationFn: fn,
      onSuccess: invalidateTenant,
      onError: (error: unknown) => {
        const message = error instanceof Error ? error.message : "That did not go through.";
        s.notify({ tone: "critical", title: "That change was refused", body: message });
        /* whatever the server thinks is true, re-read it */
        invalidateTenant();
      },
    });
  }

  const mCreatePatient = useTenantMutation((v: Record<string, unknown>) => api.createPatient(v));
  const mUpdatePatient = useTenantMutation((a: { id: Id; values: Record<string, unknown> }) => api.updatePatient(a.id, a.values));
  const mCreateAppointment = useTenantMutation((a: NewAppointment) => api.createAppointment(a));
  const mAppointmentStatus = useTenantMutation((a: { id: Id; status: Appointment["status"] }) => api.setAppointmentStatus(a.id, a.status));
  const mCheckIn = useTenantMutation((id: Id) => api.checkIn(id));
  const mWalkIn = useTenantMutation((i: Parameters<typeof api.addWalkIn>[0]) => api.addWalkIn(i));
  const mQueueStatus = useTenantMutation((a: { id: Id; status: QueueEntry["status"] }) => api.setQueueStatus(a.id, a.status));
  const mCreateEncounter = useTenantMutation((a: { e: NewEncounter; sign: boolean }) => api.createEncounter(a.e, a.sign));
  const mUpdateEncounter = useTenantMutation((a: { id: Id; patch: Partial<Encounter> & { sign?: boolean } }) => api.updateEncounter(a.id, a.patch));
  const mCreatePrescription = useTenantMutation((a: { encounterId: Id; patientId: Id; doctorId: Id; items: Array<Omit<PrescriptionItem, "id" | "prescription_id" | "dispensed_qty" | "status">> }) =>
    api.createPrescription(a.encounterId, a.patientId, a.doctorId, a.items));
  const mDispense = useTenantMutation((a: { id: Id; lines: Array<{ itemId: Id; qty: number; batch_no: string }> }) =>
    api.dispense(a.id, a.lines));
  const mCreateLabOrder = useTenantMutation((a: { encounterId: Id; patientId: Id; orderedBy: Id; tests: Array<{ code: string; name: string; panel: string; note?: string }> }) =>
    api.createLabOrder(a.encounterId, a.patientId, a.orderedBy, a.tests));
  const mStartLab = useTenantMutation((id: Id) => api.startLabOrder(id));
  const mSaveLab = useTenantMutation((a: { id: Id; results: LabResultLine[] }) => api.saveLabResults(a.id, a.results));
  const mVerifyLab = useTenantMutation((id: Id) => api.verifyLabOrder(id));
  const mStock = useTenantMutation((i: Parameters<typeof api.recordStockMovement>[0]) => api.recordStockMovement(i));
  const mCreateInvoice = useTenantMutation((i: Parameters<typeof api.createInvoice>[0]) => api.createInvoice(i));
  const mAddPayment = useTenantMutation((a: { id: Id; amount: number; method: Payment["method"]; reference?: string }) =>
    api.addPayment(a.id, a.amount, a.method, a.reference));
  const mIssueInvoice = useTenantMutation((id: Id) => api.issueInvoice(id));
  const mVoidInvoice = useTenantMutation((id: Id) => api.voidInvoice(id));
  const mUpdateConfig = useTenantMutation((p: Partial<TenantConfig>) => api.updateConfig(p));
  const mPurchase = useTenantMutation((k: FeatureKey) => api.purchaseFeature(k));
  const mDeactivate = useTenantMutation((k: FeatureKey) => api.deactivateFeature(k));
  const mAddField = useTenantMutation((d: Omit<FieldDefinition, "id" | "tenant_id" | "scope" | "clinical_type">) => api.addFieldDefinition(d));
  const mRemoveField = useTenantMutation((id: Id) => api.removeFieldDefinition(id));
  const mUserStatus = useTenantMutation((a: { id: Id; status: AccountStatus }) => api.setUserStatus(a.id, a.status));
  /* Not a `useTenantMutation`: the form that calls this awaits the answer and
     shows the refusal against the field it belongs to — a duplicate email is
     the one this happens to most — so a toast here would say it twice. */
  const mCreateUser = useMutation({
    mutationFn: (input: api.NewUser) => api.createUser(input),
    onSuccess: invalidateTenant,
  });
  const mUserPassword = useMutation({
    mutationFn: (a: { id: Id; password: string }) => api.setUserPassword(a.id, a.password),
    onSuccess: invalidateTenant,
  });

  const mCreateTenant = useMutation({
    mutationFn: (i: Parameters<typeof api.createTenant>[0]) => api.createTenant(i),
    onSuccess: invalidatePlatform,
  });
  const mTenantStatus = useMutation({
    mutationFn: (a: { id: Id; status: Tenant["status"] }) => api.setTenantStatus(a.id, a.status),
    onSuccess: invalidatePlatform,
  });

  const value = React.useMemo<AppContextValue>(() => ({
    ready: s.ready,
    today: tenant.today || TODAY,
    host: s.host,
    hostTenant,
    hostTenantPending,
    session: s.session,
    platformSession: s.platformSession,
    platformUser: s.platformUser,
    permissions: s.permissions,
    theme: s.theme,
    toasts: s.toasts,
    config,
    connection,

    notify: s.notify,
    dismissToast: s.dismissToast,
    toggleTheme: s.toggleTheme,
    clinicUrl: s.clinicUrl,
    consoleUrl: s.consoleUrl,

    /* UX only. The server's feature guard is the enforcement — a module that
       was never bought answers 403 whatever the nav shows. */
    hasFeature: (key) => features.some((f) => f.feature_key === key && f.status === "active"),
    can: (permission) => s.permissions.includes(permission),

    signIn: s.signIn,
    signOut: () => { void s.signOut().then(() => qc.clear()); },
    platformSignIn: s.platformSignIn,
    platformSignOut: () => { void s.platformSignOut().then(() => qc.clear()); },
    createUser: (input) => mCreateUser.mutateAsync(input),
    setUserPassword: (id, password) => mUserPassword.mutateAsync({ id, password }),
    setUserStatus: (id, status) => mUserStatus.mutate({ id, status }),

    updateConfig: (patch) => mUpdateConfig.mutate(patch),
    purchaseFeature: (key) => mPurchase.mutate(key),
    deactivateFeature: (key) => mDeactivate.mutate(key),
    addFieldDefinition: (d) => mAddField.mutate(d),
    removeFieldDefinition: (id) => mRemoveField.mutate(id),

    createPatient: (values) => mCreatePatient.mutateAsync(values),
    updatePatient: (id, values) => mUpdatePatient.mutate({ id, values }),

    createAppointment: (a) => mCreateAppointment.mutate(a),
    setAppointmentStatus: (id, status) => mAppointmentStatus.mutate({ id, status }),
    /* Worked out from the appointments already in cache, so the slot grid stays
       instant. The server checks again on POST and answers 409 if the slot went
       while the dialog was open. */
    conflictsFor: (doctorId, date, time, duration, ignoreId) =>
      api.conflictsIn(appointments ?? [], doctorId, date, time, duration, ignoreId),
    checkIn: (id) => mCheckIn.mutate(id),
    addWalkIn: (input) => mWalkIn.mutate(input),
    setQueueStatus: (id, status) => mQueueStatus.mutate({ id, status }),

    createEncounter: (e, sign) => mCreateEncounter.mutateAsync({ e, sign }),
    updateEncounter: (id, patch) => mUpdateEncounter.mutate({ id, patch }),

    createPrescription: (encounterId, patientId, doctorId, items) =>
      mCreatePrescription.mutate({ encounterId, patientId, doctorId, items }),
    dispense: (id, lines) => mDispense.mutate({ id, lines }),

    createLabOrder: (encounterId, patientId, orderedBy, tests) =>
      mCreateLabOrder.mutate({ encounterId, patientId, orderedBy, tests }),
    startLabOrder: (id) => mStartLab.mutate(id),
    saveLabResults: (id, results) => mSaveLab.mutate({ id, results }),
    verifyLabOrder: (id) => mVerifyLab.mutate(id),

    recordStockMovement: (input) => mStock.mutate(input),

    createInvoice: (input) => mCreateInvoice.mutateAsync(input),
    addPayment: (id, amount, method, reference) => mAddPayment.mutate({ id, amount, method, reference }),
    issueInvoice: (id) => mIssueInvoice.mutate(id),
    voidInvoice: (id) => mVoidInvoice.mutate(id),

    createTenant: (input) => mCreateTenant.mutateAsync(input),
    setTenantStatus: (id, status) => mTenantStatus.mutate({ id, status }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [s, hostTenant, hostTenantPending, tenant, features, config, appointments, connection, qc]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** The current clinic and the person signed into it. */
export { useTenant } from "@/lib/query/hooks";
