"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { cn } from "@/lib/cn";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useSession } from "@/lib/store/session";
import { buildTour, TOUR_VERSION, type TourStep } from "@/lib/tour";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { NAV } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { IconArrowRight, IconChevronLeft, IconX, IconSpark } from "@/components/ui/icons";

/* ==========================================================================
   The guided tour.

   A dimmed page with one thing cut out of it, and a card beside that thing.
   The mechanics worth knowing:

   * the cut-out is a single element with a very large spread shadow, so there
     is no four-rectangle mask to keep in sync while the page scrolls;
   * anchors are found by `[data-tour]`, waited for rather than assumed, and a
     step whose anchor never arrives is skipped — which is what makes
     route-changing steps safe;
   * it is a dialog: focus moves into the card, Tab is trapped, Escape leaves,
     arrow keys move, and the step is announced.
   ========================================================================== */

const CARD_WIDTH = 340;
const GAP = 14;
const PAD = 8;
/** how close the lit area may come to the edge of the screen */
const MARGIN = 12;

interface TourState {
  running: boolean;
  start: () => void;
  stop: (reason: "finished" | "skipped") => void;
  available: boolean;
}

const TourContext = React.createContext<TourState | null>(null);

export function useTour() {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside <TourProvider>");
  return ctx;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { hasFeature, ready } = useApp();
  const { preferences, savePreferences, session } = useSession();
  const { tenant, role } = useTenant();
  const pathname = usePathname();

  const [running, setRunning] = React.useState(false);
  const [index, setIndex] = React.useState(0);

  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type);

  const steps = React.useMemo(() => {
    const anyLocked = NAV.flatMap((g) => g.items).some((i) => i.feature && !hasFeature(i.feature));
    return buildTour({
      role,
      clinicName: tenant.name,
      clinicalLabel: clinical?.label ?? "General",
      examLabel: clinical?.examLabel ?? "the clinical exam",
      hasFeature,
      anyLocked,
    });
  }, [role, tenant.name, clinical, hasFeature]);

  /* The waiting room is a public screen and the login page is not the app. */
  const allowedHere = session.signedIn && pathname !== "/display" && !pathname.startsWith("/login");

  const start = React.useCallback(() => {
    setIndex(0);
    setRunning(true);
  }, []);

  const stop = React.useCallback((reason: "finished" | "skipped") => {
    setRunning(false);
    setIndex(0);
    /* Finishing and giving up are recorded differently: one means "they have
       seen this version", the other "they would rather not be asked". */
    void savePreferences(
      reason === "finished" ? { tour_version_seen: TOUR_VERSION } : { tour_dismissed: true },
    );
  }, [savePreferences]);

  /* First run: offered once the shell has what it needs, and never mid-task.
     The wait is deliberate — landing on the dashboard and being grabbed in the
     same frame reads as a malfunction. It is scheduled once and cleared only on
     unmount, because `preferences` arriving from the server re-runs this effect
     and a cleanup on every run would cancel the very timer it just set. */
  const [offered, setOffered] = React.useState(false);

  const shouldOffer =
    ready
    && allowedHere
    && pathname === "/dashboard"
    && !preferences.tour_dismissed
    && (preferences.tour_version_seen ?? 0) < TOUR_VERSION;

  React.useEffect(() => {
    if (!shouldOffer || offered) return;
    /* State rather than a ref, so a remount (React runs effects twice in
       development) re-schedules rather than seeing a guard already set and
       quietly never firing. */
    const id = setTimeout(() => {
      setOffered(true);
      start();
    }, 700);
    return () => clearTimeout(id);
  }, [shouldOffer, offered, start]);

  const value = React.useMemo<TourState>(
    () => ({ running, start, stop, available: steps.length > 1 }),
    [running, start, stop, steps.length],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {running && allowedHere && (
        <TourStage
          steps={steps}
          index={index}
          onIndex={setIndex}
          onClose={stop}
        />
      )}
    </TourContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */

interface Rect { top: number; left: number; width: number; height: number }

function TourStage({
  steps, index, onIndex, onClose,
}: {
  steps: TourStep[];
  index: number;
  onIndex: (n: number) => void;
  onClose: (reason: "finished" | "skipped") => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [ready, setReady] = React.useState(false);

  const step = steps[index];
  const last = index === steps.length - 1;

  /* Navigate first, if this step lives somewhere else. */
  React.useEffect(() => {
    if (!step?.href) return;
    const [path] = step.href.split("?");
    if (pathname !== path) router.push(step.href);
  }, [step, pathname, router]);

  /* Find the anchor — waiting for it, because a route may still be rendering.
     If it never turns up, move on rather than pointing at nothing. */
  React.useEffect(() => {
    setReady(false);
    setRect(null);
    if (!step) return;
    if (!step.anchor) { setReady(true); return; }

    let cancelled = false;
    let attempts = 0;

    const look = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (el && el.offsetParent !== null) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => {
          if (cancelled) return;
          measure(el);
          setReady(true);
        }, 260);
        return;
      }
      if (++attempts > 24) {
        /* 3 seconds of nothing: this step has no anchor on this screen. */
        if (index < steps.length - 1) onIndex(index + 1);
        else onClose("finished");
        return;
      }
      setTimeout(look, 125);
    };

    const measure = (el: HTMLElement) => setRect(measureAnchor(el));

    look();
    return () => { cancelled = true; };
  }, [step, index, steps.length, onIndex, onClose]);

  /* Keep the cut-out on the anchor while the page moves under it. */
  React.useEffect(() => {
    if (!step?.anchor || !ready) return;
    const track = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (el) setRect(measureAnchor(el));
    };
    window.addEventListener("scroll", track, true);
    window.addEventListener("resize", track);
    return () => {
      window.removeEventListener("scroll", track, true);
      window.removeEventListener("resize", track);
    };
  }, [step, ready]);

  const next = React.useCallback(() => {
    if (last) onClose("finished");
    else onIndex(index + 1);
  }, [last, index, onIndex, onClose]);

  const back = React.useCallback(() => { if (index > 0) onIndex(index - 1); }, [index, onIndex]);

  /* Focus follows the card, once it is actually on screen — while an anchor is
     still being found there is nothing to focus. */
  React.useEffect(() => {
    if (ready) cardRef.current?.focus();
  }, [ready, index]);

  /* Dialog behaviour: Tab trapped, Escape out, arrows to move. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose("skipped"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
      else if (e.key === "Tab") {
        const focusable = cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!focusable?.length) return;
        const first = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [next, back, onClose, index]);

  if (!step || !ready) {
    /* Dim the page while the next anchor is found, so nothing flickers. */
    return <div className="fixed inset-0 z-[90] bg-[hsl(var(--sh)/.45)]" aria-hidden />;
  }

  const card = cardPosition(rect, step.placement);

  return (
    <div className="fixed inset-0 z-[90]" role="presentation">
      {rect ? (
        <>
          {/* one cut-out, lit by its own shadow — no mask to keep in sync */}
          <div
            className="pointer-events-none absolute rounded-[var(--r)] ring-2 ring-accent/70 transition-all duration-300 ease-[var(--ease-brand)]"
            style={{
              top: rect.top, left: rect.left, width: rect.width, height: rect.height,
              boxShadow: "0 0 0 9999px hsl(var(--sh)/.55)",
            }}
            aria-hidden
          />
          {/* clicks anywhere outside the cut-out leave the tour */}
          <button
            className="absolute inset-0 cursor-default"
            onClick={() => onClose("skipped")}
            tabIndex={-1}
            aria-label="Close the tour"
          />
        </>
      ) : (
        <button
          className="absolute inset-0 cursor-default bg-[hsl(var(--sh)/.55)]"
          onClick={() => onClose("skipped")}
          tabIndex={-1}
          aria-label="Close the tour"
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        data-tour-card
        className={cn(
          "pop absolute rounded-[var(--r-lg)] border border-line bg-surface p-4 shadow-e4 outline-none",
          "transition-[top,left] duration-300 ease-[var(--ease-brand)]",
        )}
        style={{ top: card.top, left: card.left, width: CARD_WIDTH, maxWidth: "calc(100vw - 24px)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-2 text-micro font-semibold uppercase tracking-[0.14em] text-accent-text">
            <IconSpark size={13} /> Tour
          </span>
          <button
            onClick={() => onClose("skipped")}
            className="-mr-1 -mt-1 rounded-[var(--r-sm)] p-1 text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            aria-label="Skip the tour"
          >
            <IconX size={15} />
          </button>
        </div>

        <h2 id="tour-title" className="mt-2 font-display text-title-sm font-semibold text-ink">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-label leading-relaxed text-ink-2">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line-soft pt-3">
          <span className="flex items-center gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === index ? "w-4 bg-accent" : i < index ? "w-1.5 bg-accent/40" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </span>
          <span className="sr-only" aria-live="polite">Step {index + 1} of {steps.length}</span>

          <span className="flex items-center gap-2">
            {index > 0 && (
              <Button variant="ghost" size="sm" onClick={back}>
                <IconChevronLeft size={14} /> Back
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={next}>
              {last ? "Finish" : <>Next <IconArrowRight size={14} /></>}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The lit rectangle, clamped to what is actually on screen.
 *
 * An anchor can easily be taller than the viewport — a queue board with twenty
 * tokens on it — and a cut-out running off both edges lights up nothing in
 * particular. Clamping keeps the highlight where the eye is.
 */
function measureAnchor(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  const top = Math.max(MARGIN, r.top - PAD);
  const left = Math.max(MARGIN, r.left - PAD);
  const bottom = Math.min(window.innerHeight - MARGIN, r.bottom + PAD);
  const right = Math.min(window.innerWidth - MARGIN, r.right + PAD);
  return { top, left, width: Math.max(24, right - left), height: Math.max(24, bottom - top) };
}

/** Put the card beside the anchor, or in the middle when there is not one. */
function cardPosition(rect: Rect | null, placement: TourStep["placement"] = "bottom") {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const height = 232;

  if (!rect) {
    return { top: Math.max(24, vh / 2 - height / 2), left: Math.max(12, vw / 2 - CARD_WIDTH / 2) };
  }

  const room = {
    right: vw - (rect.left + rect.width) - GAP,
    left: rect.left - GAP,
    bottom: vh - (rect.top + rect.height) - GAP,
    top: rect.top - GAP,
  };

  /* Preferred side first, then whichever side actually has room. */
  const order: Array<TourStep["placement"]> = [placement, "right", "bottom", "left", "top"];
  const side = order.find((p) => (p === "right" || p === "left" ? room[p] >= CARD_WIDTH : room[p!] >= height)) ?? "bottom";

  const clampX = (x: number) => Math.min(Math.max(12, x), vw - CARD_WIDTH - 12);
  const clampY = (y: number) => Math.min(Math.max(12, y), vh - height - 12);

  switch (side) {
    case "right":
      return { top: clampY(rect.top), left: clampX(rect.left + rect.width + GAP) };
    case "left":
      return { top: clampY(rect.top), left: clampX(rect.left - CARD_WIDTH - GAP) };
    case "top":
      return { top: clampY(rect.top - height - GAP), left: clampX(rect.left + rect.width / 2 - CARD_WIDTH / 2) };
    default:
      return { top: clampY(rect.top + rect.height + GAP), left: clampX(rect.left + rect.width / 2 - CARD_WIDTH / 2) };
  }
}
