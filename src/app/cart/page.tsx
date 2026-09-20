"use client";

/* ==========================================================================
   The cart: several modules, one payment.

   The screen exists to answer one question honestly — what does pressing Pay
   actually cost — and the honest answer is two numbers, not one:

     * **Due now** is this payment. Modules bought partway through a cycle are
       charged only for the days left of it, so this is usually the smaller
       figure, and each line shows its own day count to explain itself.
     * **Then every month** is what the next invoice carries. It is bigger, it
       arrives later, and a screen that showed only the first number would be
       read as promising the second.

   Nothing here adds anything up. Every figure on this page is the server's,
   re-priced on each read — a total the browser computed is a total the
   browser could get wrong, and this one ends in a card payment.
   ========================================================================== */

import * as React from "react";
import Link from "next/link";
import {
  useCart, useCheckoutCart, useEmptyCart, usePayInvoice, useRemoveFromCart,
} from "@/lib/query/billing";
import { useSession } from "@/lib/store/session";
import { currency, formatDate, pluralise } from "@/lib/format";
import type { CartLine } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { PageLoader } from "@/components/ui/loader";
import { RoleGate } from "@/components/domain/gates";
import { IconCard, IconTrash } from "@/components/ui/icons";

export default function CartPage() {
  return (
    <RoleGate allow={[]}>
      <CartScreen />
    </RoleGate>
  );
}

function CartScreen() {
  const { data: cart, isPending } = useCart();
  const checkout = useCheckoutCart();
  const empty = useEmptyCart();
  const { pay, busy: paying } = usePayInvoice();
  const { notify } = useSession();

  const busy = checkout.isPending || empty.isPending || paying;

  /* Checkout and payment are two steps, and the gap between them is real:
     the modules are switched on and the invoice raised by the first, and the
     second collects the money. A cart that owed nothing has no invoice to
     pay, and saying so is the whole point of `reinstated`. */
  const buy = () => {
    checkout.mutate(undefined, {
      onSuccess: (result) => {
        if (result.invoice === null) {
          notify({
            tone: "ok",
            title: "Switched on, with nothing to pay",
            body: result.reinstated.length
              ? "These modules were already paid for this cycle, so no new invoice was raised."
              : "Nothing was owed for the rest of this cycle.",
          });
          return;
        }
        void pay(result.invoice);
      },
    });
  };

  if (isPending) return <PageLoader />;

  const lines = cart?.lines ?? [];

  if (lines.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Subscription" title="Cart" />
        <EmptyState
          icon={<IconCard size={20} />}
          title="The cart is empty"
          body="Modules you add will collect here, and you pay for all of them at once."
          action={<ButtonLink href="/modules" variant="primary">Browse modules</ButtonLink>}
        />
      </>
    );
  }

  const blocked = lines.filter((l) => l.blocked);

  return (
    <>
      <PageHeader
        eyebrow="Subscription"
        title="Cart"
        description={`${pluralise(lines.length, "module")} ready to switch on.`}
        actions={
          <Button variant="ghost" disabled={busy} onClick={() => empty.mutate(undefined)}>
            Empty the cart
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="What you are buying"
            subtitle={
              cart
                ? `Priced against the cycle ending ${formatDate(cart.period_end)}.`
                : undefined
            }
          />
          <CardBody className="divide-y divide-line-1 p-0">
            {lines.map((line) => (
              <CartRow key={line.feature_key} line={line} busy={busy} />
            ))}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Total" />
            <CardBody className="space-y-3">
              <Row label="Due now" value={currency(cart?.subtotal ?? 0)} />
              {cart && cart.tax_total > 0 ? (
                <Row label="Tax" value={currency(cart.tax_total)} muted />
              ) : null}
              <div className="border-t border-line-1 pt-3">
                <Row
                  label="To pay today"
                  value={currency(cart?.total ?? 0)}
                  strong
                />
              </div>

              {/* The second figure, never omitted. */}
              <div className="rounded-lg bg-surface-2 p-3">
                <Row
                  label="Then every month"
                  value={currency(cart?.recurring_total ?? 0)}
                  muted
                />
                <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-3">
                  Today you pay only for the days left in this cycle. The full
                  amount joins your next invoice.
                </p>
              </div>
            </CardBody>
            <CardFooter>
              <Button
                variant="primary"
                className="w-full"
                disabled={busy || !cart?.purchasable}
                onClick={buy}
              >
                {busy ? "Working…" : `Pay ${currency(cart?.total ?? 0)}`}
              </Button>
            </CardFooter>
          </Card>

          {blocked.length > 0 ? (
            <Card>
              <CardHeader title="Needs attention" />
              <CardBody className="space-y-2">
                {blocked.map((line) => (
                  <p key={line.feature_key} className="text-[0.8125rem] text-warn">
                    <strong className="text-ink-1">{line.name}:</strong> {line.blocked}
                  </p>
                ))}
                <p className="text-[0.75rem] text-ink-3">
                  Nothing is bought until every line is clear — remove these to
                  carry on.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({
  label, value, muted, strong,
}: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? "text-[0.8125rem] text-ink-3" : "text-[0.8125rem] text-ink-2"}>
        {label}
      </span>
      <span
        className={
          strong
            ? "text-[1.0625rem] font-semibold text-ink-1"
            : "text-[0.875rem] text-ink-1"
        }
      >
        {value}
      </span>
    </div>
  );
}

function CartRow({ line, busy }: { line: CartLine; busy: boolean }) {
  const remove = useRemoveFromCart();

  /* Why this line costs what it costs. The three cases are genuinely
     different and a person who is not told which one applies will assume the
     wrong one. */
  const note = line.blocked
    ? null
    : line.reinstated
      ? "Already paid for this cycle — switching it back on costs nothing."
      : line.already_paid
        ? "Already paid for this cycle."
        : line.prorated_days !== null && line.cycle_days !== null
          && line.prorated_days < line.cycle_days
          ? `${line.prorated_days} of ${line.cycle_days} days`
          : null;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/modules/${line.feature_key}`}
            className="text-[0.875rem] font-medium text-ink-1 hover:underline"
          >
            {line.name}
          </Link>
          {line.blocked ? <Badge tone="warn">Cannot buy</Badge> : null}
        </div>
        <p className="mt-0.5 text-[0.75rem] text-ink-3">
          {line.blocked ?? note ?? `${currency(line.list_amount)} a month`}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[0.875rem] font-medium text-ink-1">
          {currency(line.amount_now)}
        </div>
        {line.amount_now !== line.list_amount && !line.blocked ? (
          <div className="text-[0.75rem] text-ink-3">
            then {currency(line.list_amount)}
          </div>
        ) : null}
      </div>

      <Button
        size="sm"
        variant="ghost"
        aria-label={`Remove ${line.name}`}
        disabled={busy || remove.isPending}
        onClick={() => remove.mutate(line.feature_key)}
      >
        <IconTrash size={15} />
      </Button>
    </div>
  );
}
