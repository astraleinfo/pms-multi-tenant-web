"use client";

/* ==========================================================================
   The shop window.

   Every module the platform publishes, with what it does, what it costs and
   whether this clinic already has it — the three things a card has to answer
   at once, which is why they arrive in one request rather than three.

   Two distinctions the cards are careful about, because getting either wrong
   misleads somebody about money:

     * **included is not free.** A module bundled by the base plan is switched
       on and never invoiced on its own. It shows "In your plan", never "£0" —
       a zero reads as a free extra that could be taken away.
     * **no price is not free either.** `monthly` is null when the catalogue
       sells nothing at that interval. That card says so and offers no button,
       rather than a Buy that cannot work.
   ========================================================================== */

import * as React from "react";
import Link from "next/link";
import { useModules, useCart, useAddToCart, useBuyNow } from "@/lib/query/billing";
import { useBillingSummary } from "@/lib/query/billing";
import { currency } from "@/lib/format";
import type { ModuleCard } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { SearchInput } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { PageLoader } from "@/components/ui/loader";
import { RoleGate } from "@/components/domain/gates";
import { IconCard, IconCheck, IconPlus } from "@/components/ui/icons";

type Tab = "all" | "available" | "mine";

export default function ModulesPage() {
  /* Empty allow list: the practice admin alone. The server enforces the same
     thing — `subscription:manage` — so hiding the buttons is a courtesy. */
  return (
    <RoleGate allow={[]}>
      <Modules />
    </RoleGate>
  );
}

function Modules() {
  const { data: modules, isPending } = useModules();
  const { data: cart } = useCart();
  const { data: summary } = useBillingSummary();

  const [tab, setTab] = React.useState<Tab>("all");
  const [q, setQ] = React.useState("");

  const rows = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return (modules ?? [])
      .filter((m) => {
        if (tab === "available") return m.purchasable;
        if (tab === "mine") return m.subscribed || m.included;
        return true;
      })
      .filter(
        (m) =>
          !term ||
          `${m.name} ${m.summary} ${m.headline} ${m.highlights.join(" ")}`
            .toLowerCase()
            .includes(term),
      );
  }, [modules, tab, q]);

  const counts = React.useMemo(
    () => ({
      all: modules?.length ?? 0,
      available: modules?.filter((m) => m.purchasable).length ?? 0,
      mine: modules?.filter((m) => m.subscribed || m.included).length ?? 0,
    }),
    [modules],
  );

  const inCart = cart?.lines.length ?? 0;

  if (isPending) return <PageLoader />;

  return (
    <>
      <PageHeader
        eyebrow="Subscription"
        title="Modules"
        description="What this clinic can switch on, and what each one costs. Buy one on its own, or put several in the cart and pay for them together."
        meta={
          summary?.subscription ? (
            <span className="text-[0.8125rem] text-ink-2">
              On {summary.subscription.plan.name}
            </span>
          ) : null
        }
        actions={
          inCart > 0 ? (
            <ButtonLink href="/cart" variant="primary">
              <IconCard size={15} /> Cart ({inCart})
            </ButtonLink>
          ) : null
        }
      />

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "all", label: "Everything", count: counts.all },
          { value: "available", label: "Available", count: counts.available },
          { value: "mine", label: "Switched on", count: counts.mine },
        ]}
      />

      <div className="mb-4">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search modules"
          wrapperClassName="w-64"
          className="h-8 text-[0.8125rem]"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconCard size={20} />}
          title="Nothing here"
          body={
            q
              ? "No module matches that search."
              : "The platform has not published any modules for this clinic yet."
          }
        />
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((m) => (
            <ModuleTile key={m.feature_key} module={m} />
          ))}
        </section>
      )}
    </>
  );
}

/** What a module costs, said the way it is actually true. */
function Price({ module: m }: { module: ModuleCard }) {
  if (m.is_core) {
    return <span className="text-[0.8125rem] text-ink-2">Part of the product</span>;
  }
  if (m.included) {
    /* Never a zero: "in your plan" is a different fact from "free", and the
       clinic is already paying for it. */
    return <span className="text-[0.8125rem] text-ink-2">Included in your plan</span>;
  }
  if (m.monthly === null) {
    return <span className="text-[0.8125rem] text-ink-2">Not currently for sale</span>;
  }
  return (
    <span className="text-[0.9375rem] font-semibold text-ink-1">
      {currency(m.monthly)}
      <span className="text-[0.8125rem] font-normal text-ink-2">/month</span>
    </span>
  );
}

function ModuleTile({ module: m }: { module: ModuleCard }) {
  const addToCart = useAddToCart();
  const buyNow = useBuyNow();
  const busy = addToCart.isPending || buyNow.isPending;

  return (
    <Card className="flex flex-col">
      <CardBody className="flex-1">
        <div className="mb-2 flex items-start justify-between gap-2">
          <Link
            href={`/modules/${m.feature_key}`}
            className="text-[0.9375rem] font-semibold text-ink-1 hover:underline"
          >
            {m.name}
          </Link>
          <div className="flex shrink-0 gap-1">
            {m.badge ? <Badge tone="accent">{m.badge}</Badge> : null}
            {m.subscribed ? (
              <Badge tone={m.cancels_on ? "warn" : "ok"}>
                {m.cancels_on ? "Ending" : "On"}
              </Badge>
            ) : null}
          </div>
        </div>

        <p className="text-[0.8125rem] leading-relaxed text-ink-2">
          {m.headline || m.summary}
        </p>

        {m.highlights.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {m.highlights.slice(0, 3).map((h) => (
              <li key={h} className="flex gap-1.5 text-[0.8125rem] text-ink-2">
                <IconCheck size={14} className="mt-0.5 shrink-0 text-ok" />
                {h}
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>

      <CardFooter className="flex items-center justify-between gap-2">
        <Price module={m} />

        {m.purchasable ? (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || m.in_cart}
              onClick={() => addToCart.mutate({ key: m.feature_key })}
            >
              {m.in_cart ? "In cart" : <><IconPlus size={14} /> Add</>}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => buyNow.mutate({ key: m.feature_key })}
            >
              Buy now
            </Button>
          </div>
        ) : (
          <ButtonLink size="sm" variant="ghost" href={`/modules/${m.feature_key}`}>
            Details
          </ButtonLink>
        )}
      </CardFooter>
    </Card>
  );
}
