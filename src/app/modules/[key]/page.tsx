"use client";

/* ==========================================================================
   One module's page: what it does, a demo, and what it looks like.

   The listing is written by the platform and may be half-filled — a module
   can bill perfectly well before anybody has recorded a demo for it. So every
   block here is conditional, and an empty one is simply absent rather than a
   frame around nothing. There is deliberately no placeholder video and no
   stock screenshot: a picture that is not of this module is worse than no
   picture.
   ========================================================================== */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useModule, useAddToCart, useBuyNow } from "@/lib/query/billing";
import { currency } from "@/lib/format";
import type { ModuleCard } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV } from "@/components/ui/misc";
import { PageLoader } from "@/components/ui/loader";
import { RoleGate } from "@/components/domain/gates";
import { IconCard, IconCheck, IconChevronLeft, IconPlus } from "@/components/ui/icons";

export default function ModulePage(props: PageProps<"/modules/[key]">) {
  const { key } = React.use(props.params);
  return (
    <RoleGate allow={[]}>
      <ModuleDetail featureKey={key} />
    </RoleGate>
  );
}

function ModuleDetail({ featureKey }: { featureKey: string }) {
  const router = useRouter();
  const { data: m, isPending, isError } = useModule(featureKey as ModuleCard["feature_key"]);
  const addToCart = useAddToCart();
  const buyNow = useBuyNow();
  const busy = addToCart.isPending || buyNow.isPending;

  if (isPending) return <PageLoader />;
  if (isError || !m) {
    return (
      <EmptyState
        icon={<IconCard size={20} />}
        title="No such module"
        body="It may have been withdrawn from the catalogue."
        action={<ButtonLink href="/modules">Back to modules</ButtonLink>}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <button
            type="button"
            onClick={() => router.push("/modules")}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <IconChevronLeft size={14} /> Modules
          </button>
        }
        title={m.name}
        description={m.headline || m.summary}
        meta={
          <div className="flex items-center gap-2">
            {m.badge ? <Badge tone="accent">{m.badge}</Badge> : null}
            {m.subscribed ? (
              <Badge tone={m.cancels_on ? "warn" : "ok"}>
                {m.cancels_on ? `Ends ${m.cancels_on}` : "Switched on"}
              </Badge>
            ) : null}
          </div>
        }
        actions={
          m.purchasable ? (
            <>
              <Button
                variant="secondary"
                disabled={busy || m.in_cart}
                onClick={() => addToCart.mutate({ key: m.feature_key })}
              >
                {m.in_cart ? "In cart" : <><IconPlus size={15} /> Add to cart</>}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => buyNow.mutate({ key: m.feature_key })}
              >
                Buy now
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {m.video_url ? (
            <Card className="overflow-hidden">
              <CardHeader title="How it works" subtitle="A short walkthrough." />
              <CardBody>
                {/* Controls, no autoplay: this sits inside a clinical
                    application and a video that starts talking on its own in a
                    waiting room is a genuine problem. */}
                <video
                  controls
                  preload="none"
                  poster={m.video_poster_url || undefined}
                  className="aspect-video w-full rounded-lg bg-surface-3"
                >
                  <source src={m.video_url} />
                  Your browser cannot play this demo.
                </video>
              </CardBody>
            </Card>
          ) : null}

          {m.long_description ? (
            <Card>
              <CardHeader title="What it does" />
              <CardBody>
                {m.long_description.split("\n\n").map((para, i) => (
                  <p key={i} className="mb-3 text-[0.875rem] leading-relaxed text-ink-2 last:mb-0">
                    {para}
                  </p>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {m.screenshots.length > 0 ? (
            <Card>
              <CardHeader title="What it looks like" />
              <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {m.screenshots.map((shot) => (
                  <figure key={shot.url}>
                    {/* A plain <img>: these are platform-hosted marketing
                        assets of unknown origin, and next/image would need
                        every host allow-listed in next.config to render one. */}
                    <img
                      src={shot.url}
                      alt={shot.alt}
                      loading="lazy"
                      className="w-full rounded-lg border border-line-1 bg-surface-3"
                    />
                    {shot.caption ? (
                      <figcaption className="mt-1.5 text-[0.75rem] text-ink-3">
                        {shot.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Price" />
            <CardBody className="space-y-3">
              {m.is_core ? (
                <p className="text-[0.8125rem] text-ink-2">
                  Part of the product. Every clinic has it.
                </p>
              ) : m.included ? (
                <p className="text-[0.8125rem] text-ink-2">
                  Included in your plan — switched on, and never invoiced separately.
                </p>
              ) : (
                <>
                  <KV
                    label="Monthly"
                    value={m.monthly === null ? "Not for sale" : currency(m.monthly)}
                  />
                  <KV
                    label="Yearly"
                    value={m.yearly === null ? "Not sold yearly" : currency(m.yearly)}
                  />
                  <p className="text-[0.75rem] leading-relaxed text-ink-3">
                    Bought partway through a month, you pay only for the days that
                    are left of it. The full amount starts on the next invoice.
                  </p>
                </>
              )}
            </CardBody>
          </Card>

          {m.highlights.length > 0 ? (
            <Card>
              <CardHeader title="What you get" />
              <CardBody>
                <ul className="space-y-2">
                  {m.highlights.map((h) => (
                    <li key={h} className="flex gap-2 text-[0.8125rem] text-ink-2">
                      <IconCheck size={15} className="mt-0.5 shrink-0 text-ok" />
                      {h}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {m.doc_links.length > 0 ? (
            <Card>
              <CardHeader title="Documentation" />
              <CardBody>
                <ul className="space-y-2">
                  {m.doc_links.map((doc) => (
                    <li key={doc.url}>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[0.8125rem] text-accent hover:underline"
                      >
                        {doc.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
