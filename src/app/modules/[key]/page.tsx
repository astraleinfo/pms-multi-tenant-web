"use client";

import * as React from "react";
import { notFound } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useTenant } from "@/lib/store/app-store";
import { qk } from "@/lib/query/keys";
import { FEATURE_BY_KEY } from "@/lib/data/catalog";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { SUPPORT, moduleMailto, telHref } from "@/lib/support";
import { currency } from "@/lib/format";
import type { Feature, TenantFeature } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { KV } from "@/components/ui/misc";
import {
  IconArrowRight, IconCheck, IconLock, IconMail, IconPhone, IconPlay, IconRefresh, IconShield,
} from "@/components/ui/icons";

/**
 * A module, explained to a clinic that does not have it.
 *
 * This is where a padlock in the rail leads. It is deliberately not Settings:
 * an entitlement is the platform's to grant (§3.2), so there is no switch here
 * for anybody inside the clinic to throw — what there is instead is what the
 * module does, a walkthrough, the price, and the desk to ask.
 */
export default function ModulePage(props: PageProps<"/modules/[key]">) {
  const { key } = React.use(props.params);
  const feature = FEATURE_BY_KEY[key];
  if (!feature) notFound();
  return <ModuleDetail feature={feature} />;
}

/** Where this module lives once it is on — `advanced_reports` sits inside Reports. */
function moduleHome(feature: Feature) {
  return ALL_NAV_ITEMS.find((i) => i.feature === feature.key)?.href ?? "/reports";
}

function ModuleDetail({ feature }: { feature: Feature }) {
  const { hasFeature } = useApp();
  const { tenant, user } = useTenant();
  const active = hasFeature(feature.key);
  const mail = (ask: "activation" | "walkthrough") => moduleMailto(ask, { feature, tenant, user });

  return (
    <>
      <PageHeader
        eyebrow="Module"
        title={feature.name}
        description={feature.summary}
        meta={
          <>
            {active ? (
              <Badge tone="ok" size="sm" dot>Enabled for {tenant.name}</Badge>
            ) : (
              <Badge tone="neutral" size="sm"><IconLock size={11} /> Not enabled for {tenant.name}</Badge>
            )}
            <span className="tnum font-mono text-[0.75rem] text-ink-3">
              {feature.is_core ? "included" : `${currency(feature.price_monthly)}/mo`}
            </span>
          </>
        }
        actions={
          active ? (
            <ButtonLink href={moduleHome(feature)} variant="primary">
              Open {feature.name} <IconArrowRight size={15} />
            </ButtonLink>
          ) : (
            <>
              <a className={buttonClass({ variant: "secondary" })} href={mail("walkthrough")}>
                <IconPlay size={15} /> Ask for a walkthrough
              </a>
              <a className={buttonClass({ variant: "primary" })} href={mail("activation")}>
                <IconMail size={15} /> Request activation
              </a>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              icon={<IconCheck size={16} />}
              title={`What ${feature.name} does`}
              /* the nav items it lights up, minus the one that shares its name */
              subtitle={feature.unlocks.filter((u) => u !== feature.name).join(" · ") || undefined}
            />
            <CardBody className="pt-0">
              <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-ink">{feature.overview}</p>

              <p className="mt-6 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">
                How it works
              </p>
              <ol className="mt-3 space-y-4">
                {feature.how_it_works.map((step, i) => (
                  <li key={step.title} className="flex gap-3.5">
                    <span
                      className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-line-strong bg-surface-2 font-mono text-[0.75rem] font-medium text-ink-2"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.875rem] font-semibold text-ink">{step.title}</p>
                      <p className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-2">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <DemoVideo feature={feature} walkthroughHref={mail("walkthrough")} />
        </div>

        <aside className="space-y-5">
          <div className="lg:sticky lg:top-[calc(var(--topbar-h)+1.25rem)] space-y-5">
            <Pricing feature={feature} />
            <ContactSupport feature={feature} active={active} activationHref={mail("activation")} />
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * The walkthrough.
 *
 * There is no recording yet, and a dead play button that does nothing when it
 * is pressed would be worse than saying so — the panel says what the film will
 * cover and offers the live version in the meantime.
 */
function DemoVideo({ feature, walkthroughHref }: { feature: Feature; walkthroughHref: string }) {
  return (
    <Card>
      <CardHeader
        icon={<IconPlay size={16} />}
        title="Demo video"
        subtitle={`Three minutes of ${feature.name.toLowerCase()}, as it runs in a clinic.`}
      />
      <CardBody className="pt-0">
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-dashed border-line-strong bg-surface-inset px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-3">
            <IconPlay size={20} />
          </span>
          <div>
            <p className="text-[0.875rem] font-semibold text-ink">The recording is being cut</p>
            <p className="mx-auto mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-ink-2">
              Until it is here, support will walk you through the module on a call, in your own clinic&rsquo;s data.
            </p>
          </div>
          <a className={buttonClass({ variant: "secondary", size: "sm" })} href={walkthroughHref}>
            Book a live walkthrough
          </a>
        </div>

        <p className="mt-4 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">
          What it covers
        </p>
        <ul className="mt-2 space-y-1.5">
          {feature.demo_chapters.map((chapter, i) => (
            <li key={chapter} className="flex items-baseline gap-2.5 text-[0.875rem] text-ink">
              <span className="tnum shrink-0 font-mono text-[0.75rem] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              {chapter}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function Pricing({ feature }: { feature: Feature }) {
  return (
    <Card>
      <CardHeader icon={<IconShield size={16} />} title="Pricing" />
      <CardBody className="pt-0">
        {feature.is_core ? (
          <p className="font-display text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">Included</p>
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span className="tnum font-display text-[1.75rem] font-semibold tracking-[-0.02em] text-ink">
              {currency(feature.price_monthly)}
            </span>
            <span className="text-[0.8125rem] text-ink-2">per month</span>
          </p>
        )}
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">{feature.pricing_note}</p>

        <dl className="mt-4 space-y-3 border-t border-line-soft pt-4">
          <KV label="Unlocks" value={feature.unlocks.join(", ")} />
          <KV label="Billed to" value="The clinic, alongside your plan" />
        </dl>
        <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">
          The figure above is the list price. Support confirms what your clinic will actually be charged before
          anything is switched on.
        </p>
      </CardBody>
    </Card>
  );
}

function ContactSupport({
  feature, active, activationHref,
}: {
  feature: Feature;
  active: boolean;
  activationHref: string;
}) {
  const { notify, session } = useApp();
  const qc = useQueryClient();
  const [checking, setChecking] = React.useState(false);

  const copyEmail = () => {
    navigator.clipboard?.writeText(SUPPORT.email).then(
      () => notify({ tone: "ok", title: "Address copied", body: SUPPORT.email }),
      () => notify({ tone: "warn", title: "Could not copy", body: `Write to ${SUPPORT.email}.` }),
    );
  };

  /* Entitlements are read once and cached for the session, so a module switched
     on while this page is open would otherwise stay locked until a reload. This
     re-reads them and says which answer came back. */
  const checkAgain = async () => {
    setChecking(true);
    try {
      await qc.invalidateQueries({ queryKey: qk.features(session.tenantId) });
      const rows = qc.getQueryData<TenantFeature[]>(qk.features(session.tenantId)) ?? [];
      const on = rows.some((r) => r.feature_key === feature.key && r.status === "active");
      notify(
        on
          ? { tone: "ok", title: `${feature.name} is on`, body: "It is in the rail now." }
          : { tone: "warn", title: `${feature.name} is still locked`, body: "Nothing has changed on the platform's side yet." },
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<IconMail size={16} />}
        title={active ? "Talk to support" : `Ask for ${feature.name}`}
        subtitle={SUPPORT.hours}
      />
      <CardBody className="space-y-3 pt-0">
        {!active && (
          <p className="text-[0.8125rem] leading-relaxed text-ink-2">
            Modules are switched on by the Astrale team, not from inside the clinic. Send the request and it reaches
            a super admin with your clinic and this module already filled in.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <a className={buttonClass({ variant: active ? "secondary" : "primary" })} href={activationHref}>
            <IconMail size={15} /> {active ? "Write to support" : "Request activation"}
          </a>
          <a className={buttonClass({ variant: "secondary" })} href={telHref(SUPPORT.phone)}>
            <IconPhone size={15} /> {SUPPORT.phone}
          </a>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-3">
          <span className="min-w-0 truncate font-mono text-[0.75rem] text-ink-2">{SUPPORT.email}</span>
          <Button size="sm" variant="ghost" onClick={copyEmail}>Copy</Button>
        </div>

        {!active && (
          <div className="border-t border-line-soft pt-3">
            <p className="text-[0.75rem] leading-relaxed text-ink-3">
              {feature.name} stays locked until a super admin enables it. Spoken to us already?
            </p>
            <Button
              size="sm"
              variant="quiet"
              className="mt-2 w-full"
              onClick={() => void checkAgain()}
              disabled={checking}
            >
              <IconRefresh size={14} /> {checking ? "Checking…" : "Check again"}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
