"use client";

/* ==========================================================================
   Razorpay Checkout, loaded on demand.

   The script is fetched the first time someone presses Pay Now rather than on
   every page load: most sessions never open a payment, and a third-party
   script on the critical path of a clinical application is a cost paid by
   everybody for the benefit of very few.

   Nothing here decides an amount. `openCheckout` on the server prices the
   order from the invoice and returns the gateway's *public* key id; this file
   hands both to the widget and passes whatever comes back to the server to be
   verified. The handler firing is not proof of payment — the verify call
   resolving is.
   ========================================================================== */

import type { Checkout } from "@/lib/types";

const SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** What Checkout hands back. A claim, and treated as one. */
export interface CheckoutClaim {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (claim: CheckoutClaim) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<boolean> | null = null;

/** Load the widget once. Resolves false when it cannot be reached — an office
    behind a proxy that blocks it, most often — so the caller can say so
    instead of leaving a button that does nothing. */
export function loadCheckout(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  loading ??= new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(!!window.Razorpay));
    script.addEventListener("error", () => resolve(false));
    if (!existing) document.body.appendChild(script);
  }).finally(() => {
    /* let a later attempt retry a failed load */
    queueMicrotask(() => { loading = null; });
  });

  return loading;
}

export type CheckoutOutcome =
  | { ok: true; claim: CheckoutClaim }
  | { ok: false; reason: "unavailable" | "dismissed" | "failed"; message?: string };

/**
 * Open the widget and resolve with what the person did.
 *
 * Resolves rather than throws for a dismissal, because closing a payment
 * window is not an error — it is the most common thing that happens to one.
 */
export function openRazorpay(checkout: Checkout): Promise<CheckoutOutcome> {
  return new Promise<CheckoutOutcome>((resolve) => {
    void loadCheckout().then((ready) => {
      if (!ready || !window.Razorpay) {
        resolve({ ok: false, reason: "unavailable" });
        return;
      }

      let settled = false;
      const finish = (outcome: CheckoutOutcome) => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };

      const widget = new window.Razorpay({
        key: checkout.key_id,
        order_id: checkout.order_id,
        /* Minor units, and display only — the server already priced the order
           and will re-check the amount before anything counts as paid. */
        amount: Math.round(checkout.amount * 100),
        currency: checkout.currency,
        name: checkout.customer_name || "Astrale PMS",
        description: checkout.description,
        prefill: { name: checkout.customer_name, email: checkout.customer_email },
        notes: { invoice: checkout.invoice_number },
        theme: { color: "#2b4fd8" },
        handler: (claim) => finish({ ok: true, claim }),
        modal: { ondismiss: () => finish({ ok: false, reason: "dismissed" }) },
      });

      widget.on("payment.failed", (payload) => {
        const error = (payload as { error?: { description?: string } } | undefined)?.error;
        finish({ ok: false, reason: "failed", message: error?.description });
      });

      widget.open();
    });
  });
}
