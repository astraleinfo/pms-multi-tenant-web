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

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { qk } from "./keys";
import { useSession } from "@/lib/store/session";
import { openRazorpay } from "@/lib/razorpay";
import { currency } from "@/lib/format";
import type {
  BillingInterval, BillingMetricsFilter, FeatureKey, Id, SubscriptionInvoice,
  SubscriptionInvoiceStatus,
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

/**
 * The module catalogue.
 *
 * Cached for a few minutes: what is for sale changes when the platform says
 * so, not while somebody is reading about it. Buying something invalidates the
 * whole clinic subtree, which takes this with it.
 */
export function useModules() {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.modules(t),
    queryFn: api.listModules,
    enabled: signedIn && !!t,
    staleTime: 5 * 60_000,
  });
}

export function useModule(key: FeatureKey) {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.module(t, key),
    queryFn: () => api.getModule(key),
    enabled: signedIn && !!t && !!key,
    staleTime: 5 * 60_000,
  });
}

/**
 * The cart, priced by the server.
 *
 * Not cached for long, and re-read on focus, because the figures in it are
 * the server's and can move: a plan change or a catalogue change in another
 * tab must not leave a stale total on a page with a Pay button.
 */
export function useCart() {
  const t = useTenantId();
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: qk.cart(t),
    queryFn: api.getCart,
    enabled: signedIn && !!t,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
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
 * Pay one invoice, end to end.
 *
 * Three steps and the middle one is somebody else's window: the server prices
 * an order, Checkout collects the money, and the server verifies what comes
 * back before the invoice is treated as paid. The widget's handler firing is
 * not proof of payment — the verify call resolving is.
 *
 * Shared by the billing screen and the cart rather than written twice. A
 * second copy of a payment flow is a second place for the verify step to be
 * forgotten, and a forgotten verify step looks exactly like success.
 *
 * A dismissal is not an error — closing a payment window is the most common
 * thing that happens to one — so it reports nothing at all.
 */
export function usePayInvoice() {
  const verify = useVerifyPayment();
  const { notify } = useSession();
  const [busy, setBusy] = React.useState(false);

  const pay = React.useCallback(
    async (invoice: Pick<SubscriptionInvoice, "id">) => {
      setBusy(true);
      try {
        const checkout = await api.openCheckout(invoice.id);
        const outcome = await openRazorpay(checkout);

        if (!outcome.ok) {
          if (outcome.reason === "unavailable") {
            notify({
              tone: "critical",
              title: "The payment window could not load",
              body: "It may be blocked on this network. The invoice is unchanged.",
            });
          } else if (outcome.reason === "failed") {
            notify({
              tone: "critical",
              title: "That payment did not go through",
              body: outcome.message ?? "Nothing has been charged. You can try again.",
            });
          }
          return; /* dismissed — say nothing */
        }

        verify.mutate(
          {
            invoiceId: invoice.id,
            claim: {
              order_id: outcome.claim.razorpay_order_id,
              payment_id: outcome.claim.razorpay_payment_id,
              signature: outcome.claim.razorpay_signature,
            },
          },
          {
            onSuccess: (settled) =>
              notify({
                tone: "ok",
                title: `Invoice ${settled.number} settled`,
                body:
                  settled.balance > 0
                    ? `${currency(settled.balance)} still outstanding.`
                    : "Thank you — nothing further is owed on it.",
              }),
          },
        );
      } catch (error: unknown) {
        notify({
          tone: "critical",
          title: "Payment could not be started",
          body: error instanceof Error ? error.message : "Try again in a moment.",
        });
      } finally {
        setBusy(false);
      }
    },
    [notify, verify],
  );

  return { pay, busy: busy || verify.isPending };
}

/* ---- the cart ------------------------------------------------------------ */

export const useAddToCart = () =>
  useBillingMutation((args: { key: FeatureKey; interval?: BillingInterval }) =>
    api.addToCart(args.key, args.interval ?? "monthly"),
  );

export const useRemoveFromCart = () =>
  useBillingMutation((key: FeatureKey) => api.removeFromCart(key));

export const useEmptyCart = () => useBillingMutation(() => api.emptyCart());

/**
 * Buy the whole cart on one invoice.
 *
 * What comes back may carry no invoice at all — every module in the cart was
 * free this cycle, or already paid for. That is a success, and the screen has
 * to say so rather than wait for a payment that is not coming.
 */
export const useCheckoutCart = () => useBillingMutation(() => api.checkoutCart());

/** Buy one module from its own page, leaving the cart alone. */
export const useBuyNow = () =>
  useBillingMutation((args: { key: FeatureKey; interval?: BillingInterval }) =>
    api.buyNow(args.key, args.interval ?? "monthly"),
  );

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
