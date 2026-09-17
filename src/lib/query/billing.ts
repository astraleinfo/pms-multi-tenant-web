"use client";

/* ==========================================================================
   Platform billing — reads and writes.

   A file of its own rather than another two hundred lines in `hooks.ts`,
   because this is a whole domain and not another clinical collection: it has
   its own statuses, its own money, and a console half that reads across every
   clinic.

   The mutations invalidate the clinic's *whole* subtree, not just the billing
   branch. That matters more here than anywhere else — switching a module on
   changes what the clinic is entitled to as well as what it owes, so the nav,
   the dashboard and the billing screen all have to be re-read together or the
   rail will show a module the server has just started charging for.
   ========================================================================== */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { qk } from "./keys";
import { useSession } from "@/lib/store/session";
import type {
  BillingMetricsFilter, FeatureKey, Id, SubscriptionInvoiceStatus,
} from "@/lib/types";

const useTenantId = () => useSession().session.tenantId;
const useSignedIn = () => useSession().session.signedIn;

/* ---- reads --------------------------------------------------------------- */

/**
 * The billing screen, in one request.
 *
 * Deliberately not `staleTime`-cached for long: a payment can land by webhook
 * while the tab is open — if somebody paid on their phone, or closed the
 * window mid-payment — so the screen re-reads when it is focused rather than
 * showing a balance that was true a minute ago.
 */
export function useBillingSummary() {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.billingSummary(t),
    queryFn: api.getBillingSummary,
    enabled: signedIn && !!t,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

export function usePlans() {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.billingPlans(t),
    queryFn: api.listPlans,
    enabled: signedIn && !!t,
    staleTime: 5 * 60_000,
  });
}

export function useSubscriptionInvoices(query: {
  status?: SubscriptionInvoiceStatus;
  limit?: number;
  offset?: number;
} = {}) {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.billingInvoices(t, query),
    queryFn: () => api.listSubscriptionInvoices(query),
    enabled: signedIn && !!t,
    refetchOnWindowFocus: true,
  });
}

export function useSubscriptionPayments() {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.billingPayments(t),
    queryFn: api.listSubscriptionPayments,
    enabled: signedIn && !!t,
  });
}

/**
 * The console's figures. Outside every clinic subtree, because it reads across
 * all of them — one clinic's write must not invalidate it, and it is the
 * server that adds the money up.
 */
export function useBillingMetrics(filter: BillingMetricsFilter = {}) {
  const { platformSession } = useSession();
  return useQuery({
    queryKey: qk.billingMetrics(filter as Record<string, unknown>),
    queryFn: () => api.billingMetrics(filter),
    enabled: platformSession.signedIn,
    staleTime: 30_000,
  });
}

/* ---- writes -------------------------------------------------------------- */

/**
 * The shared shape for every billing write.
 *
 * Failures are shown as the API wrote them: its messages are written for a
 * person to read ("That module is already active", "This period has already
 * been paid for"), so translating them into something vaguer would only lose
 * information the reader needs.
 */
function useBillingMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  options: { onDone?: (result: TResult) => void } = {},
) {
  const qc = useQueryClient();
  const t = useTenantId();
  const { notify } = useSession();

  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      /* the whole clinic, not just the billing branch — see the file note */
      void qc.invalidateQueries({ queryKey: qk.tenant(t) });
      options.onDone?.(result);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "That did not go through.";
      notify({ tone: "critical", title: "That change was refused", body: message });
      void qc.invalidateQueries({ queryKey: qk.tenant(t) });
    },
  });
}

export const useSubscribe = () =>
  useBillingMutation((planCode: string) => api.subscribeToPlan(planCode));

export const useChangePlan = () =>
  useBillingMutation((planCode: string) => api.changePlan(planCode));

export const usePauseSubscription = () =>
  useBillingMutation(() => api.pauseSubscription());

export const useResumeSubscription = () =>
  useBillingMutation(() => api.resumeSubscription());

export const useCancelSubscription = () =>
  useBillingMutation((reason: string) => api.cancelSubscription(reason));

export const useKeepSubscription = () =>
  useBillingMutation(() => api.keepSubscription());

export const useUpdateBillingAccount = () =>
  useBillingMutation((changes: api.BillingAccountEdit) => api.updateBillingAccount(changes));

export const useActivateAddon = () =>
  useBillingMutation((key: FeatureKey) => api.activateAddon(key));

export const useCancelAddon = () =>
  useBillingMutation((key: FeatureKey) => api.cancelAddon(key));

/**
 * Verify a payment the browser has just been handed.
 *
 * This resolving is what makes an invoice paid — not the Checkout handler
 * firing. A `409` here means the gateway's own record did not match what the
 * server asked for, and the invoice is still owing.
 */
export const useVerifyPayment = () =>
  useBillingMutation((args: {
    invoiceId: Id;
    claim: { order_id: string; payment_id: string; signature: string };
  }) => api.verifyPayment(args.invoiceId, args.claim));
