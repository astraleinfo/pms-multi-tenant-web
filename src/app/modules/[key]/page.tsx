"use client";

import * as React from "react";
import { notFound } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useApp, useTenant } from "@/lib/store/app-store";
import * as api from "@/lib/api";
import { qk } from "@/lib/query/keys";
import { useFeatureCatalog, useSupportInfo, useSupportRequests } from "@/lib/query/hooks";
import { FEATURE_BY_KEY } from "@/lib/data/catalog";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { moduleMailto, telHref } from "@/lib/support";
import { currency } from "@/lib/format";
import type { Feature, FeatureKey, SupportRequest, TenantFeature } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { KV } from "@/components/ui/misc";
import { ModuleScreens, hasScreens } from "@/components/domain/module-screens";
import { MODULE_DOCS, type ModuleDocs } from "@/lib/data/module-docs";
import { ROLE_LABEL } from "@/lib/nav";
import { PageLoader } from "@/components/ui/loader";
import {
  IconArrowRight, IconCheck, IconInfo, IconLock, IconMail, IconMonitor, IconPhone, IconPlay, IconRefresh,
  IconShield, IconUsers,
} from "@/components/ui/icons";

/**
 * A module, explained to a clinic that does not have it.
 *
 * This is where a padlock in the rail leads. It is deliberately not Settings:
 * an entitlement is the platform's to grant (§3.2), so there is no switch here
 * for anybody inside the clinic to throw — what there is instead is what the
 * module does, a walkthrough, the price, and the desk to ask.
 *
 * Asking goes through the API rather than the clinic's own mail client: the
 * request is stored against the clinic and the platform emails the desk from
 * it, so it arrives whether or not this machine has a mail client set up, and
 * the page can say "requested" instead of offering the same button again.
 */
export default function ModulePage(props: PageProps<"/modules/[key]">) {
  const { key } = React.use(props.params);
  const catalog = useFeatureCatalog();
  if (!FEATURE_BY_KEY[key]) notFound();
  /* The price is quoted in three places on this page and in the email to the
     desk, so the page waits for the live figure rather than printing a guess. */
  if (catalog.isPending) return <PageLoader label="Reading the price…" />;
  return <ModuleDetail feature={catalog.byKey[key as FeatureKey]} />;
}

/** Where this module lives once it is on — `advanced_reports` sits inside Reports. */
function moduleHome(feature: Feature) {
  return ALL_NAV_ITEMS.find((i) => i.feature === feature.key)?.href ?? "/reports";
}

type Ask = "activation" | "walkthrough";

/**
 * One ask of the desk about this module: the latest request of that kind, and
 * a way to make one. A repeat inside the API's dedupe window comes back as the
 * earlier request, so a double click cannot email the desk twice.
 */
function useModuleAsk(feature: Feature) {
  const { notify, session } = useApp();
  const qc = useQueryClient();
  const { data: requests } = useSupportRequests();
  const { data: support } = useSupportInfo();
  const supportEmail = support?.support_email ?? "";
  const [busy, setBusy] = React.useState<Ask | null>(null);

  /* Newest first from the API. A request whose email failed still counts as
     asked — the request is on the platform's side either way. */
  const latest = (kind: Ask): SupportRequest | undefined =>
    requests.find((r) => r.kind === kind && r.feature_key === feature.key);

  const ask = async (kind: Ask) => {
    setBusy(kind);
    try {
      await api.createSupportRequest({ kind, feature_key: feature.key });
      await qc.invalidateQueries({ queryKey: qk.supportRequests(session.tenantId) });
      notify({
        tone: "ok",
        title: kind === "activation" ? "Activation requested" : "Walkthrough requested",
        body: `The Astrale team has your request for ${feature.name} and will be in touch.`,
      });
    } catch (error) {
      notify({
        tone: "warn",
        title: "Could not send the request",
        body: `${error instanceof Error ? error.message : "Something went wrong."} You can also write to ${supportEmail}.`,
      });
    } finally {
      setBusy(null);
    }
  };

  return { latest, ask, busy };
}

function ModuleDetail({ feature }: { feature: Feature }) {
  const { hasFeature } = useApp();
  const { tenant, user } = useTenant();
  const active = hasFeature(feature.key);
  const { latest, ask, busy } = useModuleAsk(feature);
  const { data: support } = useSupportInfo();
  const activation = latest("activation");
  const walkthrough = latest("walkthrough");

  return (
    <>
      <PageHeader
        eyebrow="Module"
        title={feature.name}
        description={feature.summary}
        meta={
          <>
            {active ? (
              <Badge tone="ok" size="sm" dot><span className="whitespace-nowrap">Enabled</span></Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                <IconLock size={11} /> <span className="whitespace-nowrap">Not enabled</span>
              </Badge>
            )}
            <span className="tnum font-mono text-caption text-ink-3">
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
              <AskButton
                variant="secondary"
                request={walkthrough}
                busy={busy === "walkthrough"}
                onAsk={() => void ask("walkthrough")}
                idle={<><IconPlay size={15} /> Ask for a walkthrough</>}
                done="Walkthrough requested"
              />
              <AskButton
                variant="primary"
                request={activation}
                busy={busy === "activation"}
                onAsk={() => void ask("activation")}
                idle={<><IconMail size={15} /> Request activation</>}
                done="Activation requested"
              />
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              tone="ok" icon={<IconCheck size={16} />}
              title={`What ${feature.name} does`}
              /* the nav items it lights up, minus the one that shares its name */
              subtitle={feature.unlocks.filter((u) => u !== feature.name).join(" · ") || undefined}
            />
            <CardBody className="pt-0">
              <p className="max-w-2xl text-body leading-relaxed text-ink">{feature.overview}</p>

              <p className="mt-6 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">
                How it works
              </p>
              <ol className="mt-3 space-y-4">
                {feature.how_it_works.map((step, i) => (
                  <li key={step.title} className="flex gap-3.5">
                    <span
                      className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-line-strong bg-surface-2 font-mono text-caption font-medium text-ink-2"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-ink">{step.title}</p>
                      <p className="mt-0.5 text-body leading-relaxed text-ink-2">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          {hasScreens(feature.key) && (
            <Card>
              <CardHeader
                tone="accent" icon={<IconMonitor size={16} />}
                title={`${feature.name}, on screen`}
                hint="The screens your team works in, filled with sample data."
              />
              <CardBody className="pt-0">
                <ModuleScreens feature={feature.key} />
              </CardBody>
            </Card>
          )}

          {MODULE_DOCS[feature.key] && <ModuleDocumentation feature={feature} docs={MODULE_DOCS[feature.key]!} />}

          <DemoVideo
            feature={feature}
            walkthrough={
              <AskButton
                variant="secondary"
                size="sm"
                request={walkthrough}
                busy={busy === "walkthrough"}
                onAsk={() => void ask("walkthrough")}
                idle="Book a live walkthrough"
                done="Walkthrough requested"
              />
            }
          />
        </div>

        <aside className="space-y-5">
          <div className="lg:sticky lg:top-[calc(var(--topbar-h)+1.25rem)] space-y-5">
            <Pricing feature={feature} />
            <ContactSupport
              feature={feature}
              active={active}
              writeHref={moduleMailto("activation", { feature, tenant, user, supportEmail: support?.support_email ?? "" })}
              activation={activation}
              activate={
                <AskButton
                  variant="primary"
                  request={activation}
                  busy={busy === "activation"}
                  onAsk={() => void ask("activation")}
                  idle={<><IconMail size={15} /> Request activation</>}
                  done="Activation requested"
                />
              }
            />
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * The documentation: what exactly is in it, who uses it, what to do first, and
 * the questions every clinic asks support anyway. Enough to decide on, and
 * enough to start with the day it is switched on.
 */
function ModuleDocumentation({ feature, docs }: { feature: Feature; docs: ModuleDocs }) {
  return (
    <Card>
      <CardHeader
        tone="info" icon={<IconInfo size={16} />}
        title={`About ${feature.name}`}
        hint="What you get, who uses it, and how to start."
      />
      <CardBody className="space-y-6 pt-0">
        <section>
          <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">What&rsquo;s included</p>
          <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {docs.included.map((item) => (
              <li key={item} className="flex items-start gap-2 text-label leading-relaxed text-ink">
                <IconCheck size={14} className="mt-0.5 shrink-0 text-ok" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">
            <IconUsers size={12} /> Who uses it
          </p>
          <dl className="mt-3 divide-y divide-line-soft rounded-[var(--r)] border border-line">
            {docs.roles.map((r) => (
              <div key={r.role} className="flex flex-col gap-0.5 px-3.5 py-2.5 sm:flex-row sm:gap-4">
                <dt className="w-36 shrink-0 text-label font-medium text-ink">{ROLE_LABEL[r.role]}</dt>
                <dd className="text-label leading-relaxed text-ink-2">{r.does}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Once it&rsquo;s switched on</p>
          <ol className="mt-3 space-y-2">
            {docs.setup.map((step, i) => (
              <li key={step} className="flex gap-3 text-label leading-relaxed text-ink">
                <span className="tnum mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-micro font-semibold text-accent-text">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Questions clinics ask</p>
          <div className="mt-3 divide-y divide-line-soft rounded-[var(--r)] border border-line">
            {docs.faq.map((item) => (
              <details key={item.q} className="group px-3.5 py-2.5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-label font-medium text-ink">
                  {item.q}
                  <span className="shrink-0 text-ink-3 transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-1.5 text-label leading-relaxed text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </CardBody>
    </Card>
  );
}

/**
 * The walkthrough.
 *
 * There is no recording yet, and a dead play button that does nothing when it
 * is pressed would be worse than saying so — the panel says what the film will
 * cover and offers the live version in the meantime.
 */
function DemoVideo({ feature, walkthrough }: { feature: Feature; walkthrough: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        tone="violet" icon={<IconPlay size={16} />}
        title="Demo video"
        hint={`Three minutes of ${feature.name.toLowerCase()}, as it runs in a clinic.`}
      />
      <CardBody className="pt-0">
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-dashed border-line-strong bg-surface-inset px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-3">
            <IconPlay size={20} />
          </span>
          <div>
            <p className="text-body font-semibold text-ink">The recording is being cut</p>
            <p className="mx-auto mt-1 max-w-sm text-label leading-relaxed text-ink-2">
              Until it is here, support will walk you through the module on a call, in your own clinic&rsquo;s data.
            </p>
          </div>
          {walkthrough}
        </div>

        <p className="mt-4 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">
          What it covers
        </p>
        <ul className="mt-2 space-y-1.5">
          {feature.demo_chapters.map((chapter, i) => (
            <li key={chapter} className="flex items-baseline gap-2.5 text-body text-ink">
              <span className="tnum shrink-0 font-mono text-caption text-ink-3">{String(i + 1).padStart(2, "0")}</span>
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
      <CardHeader tone="info" icon={<IconShield size={16} />} title="Pricing" />
      <CardBody className="pt-0">
        {feature.is_core ? (
          <p className="font-display text-h2 font-semibold text-ink">Included</p>
        ) : (
          <p className="flex items-baseline gap-1.5">
            <span className="tnum font-display text-display font-semibold text-ink">
              {currency(feature.price_monthly)}
            </span>
            <span className="text-label text-ink-2">per month</span>
          </p>
        )}
        <p className="mt-2 text-label leading-relaxed text-ink-2">{feature.pricing_note}</p>

        <dl className="mt-4 border-t border-line-soft pt-4">
          <KV label="Unlocks" value={feature.unlocks.join(", ")} />
          <KV label="Billed to" value="The clinic, alongside your plan" />
        </dl>
        <p className="mt-4 text-caption leading-relaxed text-ink-3">
          The figure above is the list price. Support confirms what your clinic will actually be charged before
          anything is switched on.
        </p>
      </CardBody>
    </Card>
  );
}

/** `YYYY-MM-DD HH:mm` → `YYYY-MM-DD`: the day is what anybody asks about. */
const askedOn = (r: SupportRequest) => r.created_at?.slice(0, 10) ?? "";

/** "Hema Nair <admin@…>" → "Hema Nair". */
const askedBy = (r: SupportRequest) => r.requested_by.replace(/\s*<.*>$/, "");

/**
 * A button that asks once. After the ask it says so, and when — the request is
 * stored on the platform's side, so pressing it again would only repeat it.
 */
function AskButton({
  variant, size, request, busy, onAsk, idle, done,
}: {
  variant: "primary" | "secondary";
  size?: "sm";
  request: SupportRequest | undefined;
  busy: boolean;
  onAsk: () => void;
  idle: React.ReactNode;
  done: string;
}) {
  if (request) {
    return (
      <Button variant="secondary" size={size} disabled title={`Asked by ${askedBy(request)}`}>
        <IconCheck size={15} /> {done}
        {askedOn(request) && <span className="text-ink-3">· {askedOn(request)}</span>}
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} onClick={onAsk} disabled={busy}>
      {busy ? "Sending…" : idle}
    </Button>
  );
}

function ContactSupport({
  feature, active, writeHref, activation, activate,
}: {
  feature: Feature;
  active: boolean;
  /** a prefilled mail, for a module already on — there is nothing to request */
  writeHref: string;
  activation: SupportRequest | undefined;
  /** the request button, owned by the page so every copy of it agrees */
  activate: React.ReactNode;
}) {
  const { notify, session } = useApp();
  const qc = useQueryClient();
  const { data: support } = useSupportInfo();
  const supportEmail = support?.support_email ?? "";
  const supportPhone = support?.support_phone ?? "";
  const supportHours = support?.support_hours ?? "";
  const [checking, setChecking] = React.useState(false);

  const copyEmail = () => {
    navigator.clipboard?.writeText(supportEmail).then(
      () => notify({ tone: "ok", title: "Address copied", body: supportEmail }),
      () => notify({ tone: "warn", title: "Could not copy", body: `Write to ${supportEmail}.` }),
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
        subtitle={supportHours}
      />
      <CardBody className="space-y-3 pt-0">
        {!active && (
          <p className="text-label leading-relaxed text-ink-2">
            {activation
              ? `Requested${askedOn(activation) ? ` on ${askedOn(activation)}` : ""} by ${askedBy(activation)}. A super admin switches it on once it is agreed — there is nothing more to send.`
              : "Modules are switched on by the Astrale team, not from inside the clinic. Send the request and it reaches a super admin with your clinic and this module already filled in."}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {active ? (
            <a className={buttonClass({ variant: "secondary" })} href={writeHref}>
              <IconMail size={15} /> Write to support
            </a>
          ) : (
            activate
          )}
          <a className={buttonClass({ variant: "secondary" })} href={telHref(supportPhone)}>
            <IconPhone size={15} /> {supportPhone}
          </a>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-3">
          <span className="min-w-0 truncate font-mono text-caption text-ink-2">{supportEmail}</span>
          <Button size="sm" variant="ghost" onClick={copyEmail}>Copy</Button>
        </div>

        {!active && (
          <div className="border-t border-line-soft pt-3">
            <p className="text-caption leading-relaxed text-ink-3">
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
