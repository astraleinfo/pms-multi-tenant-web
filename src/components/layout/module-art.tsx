import * as React from "react";
import { Illustration, hasIllustration } from "./module-illustrations";

/* ==========================================================================
   A module's picture: an open-source flat illustration in Astrale's palette.

   The drawings are unDraw's (MIT, see `module-illustrations.tsx`). They arrive
   greyscale and are repainted on render from the application's own tokens, so
   the whole set is one palette — blue, navy and the two pale blues — rather
   than ten different moods. That is deliberate: the sign-in screen is the
   application before sign-in, not a product tour, and a carousel that changes
   hue every five seconds reads as a marketing site.

   What this file adds around a drawing is the quiet ground it stands on: one
   pale disc, a hairline ring and a contact shadow, all barely there, so a
   cut-out figure is not floating in an empty panel.

   A module with no drawing is not a gap: it falls back to a composed card
   carrying its own initial, so a module added to the catalogue tomorrow
   appears in the carousel today and can be given artwork later without
   anything else moving.
   ========================================================================== */

/**
 * What an unDraw drawing is painted with once it is ours. Set as custom
 * properties on the drawing itself, which is what lets one set of vendored
 * markup follow the theme a user has picked — night shift included.
 */
const PALETTE = {
  "--u-ink": "var(--ink)",
  "--u-ink-2": "var(--ink-2)",
  "--u-tint": "var(--accent-soft)",
  "--u-tint-2": "var(--accent-border)",
  "--u-surface": "var(--surface)",
  "--u-surface-2": "var(--surface-2)",
} as React.CSSProperties;

/**
 * The ground a drawing stands on. Kept near-invisible on purpose — it is
 * there to seat the figure, not to be noticed.
 */
function Ground() {
  return (
    <svg
      viewBox="0 0 400 300"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx={200} cy={140} r={120} className="fill-accent-soft" opacity={0.6} />
      <circle
        cx={200} cy={140} r={142}
        className="fill-none stroke-accent-border" strokeWidth={1.25} opacity={0.4}
      />
      <ellipse cx={200} cy={268} rx={112} ry={11} className="fill-accent-soft" opacity={0.75} />
      <circle cx={44} cy={76} r={6} className="fill-accent-border" opacity={0.8} />
      <circle cx={360} cy={220} r={8} className="fill-accent-border" opacity={0.8} />
      <rect
        x={346} y={80} width={12} height={12} rx={4}
        className="fill-accent-border" opacity={0.8} transform="rotate(20 352 86)"
      />
    </svg>
  );
}

/**
 * The drawing a module gets before anybody has drawn it one: the same ground
 * and a card carrying the module's initial. Deliberately plain — it should
 * read as "a module", not as a thing pretending to be finished.
 */
function GenericArt({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 320 264" className="relative h-full w-full" aria-hidden="true" focusable="false">
      <rect x={82} y={62} width={156} height={140} rx={18} className="fill-surface" />
      <rect x={106} y={86} width={60} height={60} rx={18} className="fill-accent-soft" />
      <text
        x={136} y={116}
        textAnchor="middle"
        className="fill-accent"
        style={{ fontSize: 30, fontWeight: 600 }}
      >
        {label.slice(0, 1).toUpperCase()}
      </text>
      <rect x={106} y={166} width={108} height={8} rx={4} className="fill-line-strong" />
      <rect x={106} y={182} width={76} height={8} rx={4} className="fill-line" />
    </svg>
  );
}

/** The picture for a module, from the drawn set where one exists. */
export function ModuleArt({ featureKey, name }: { featureKey: string; name: string }) {
  return (
    <div className="relative mx-auto h-[150px] w-full sm:h-[190px] lg:h-[252px] xl:h-[300px]">
      <Ground />
      {hasIllustration(featureKey) ? (
        <Illustration featureKey={featureKey} vars={PALETTE} className="relative" />
      ) : (
        <GenericArt label={name} />
      )}
    </div>
  );
}
