"use client";

import * as React from "react";
import { usePathname, useRouter as useNextRouter, useSearchParams } from "next/navigation";

/* ==========================================================================
   Navigation feedback.

   A click on a link, a `router.push` after a save, a redirect to sign-in —
   each is a moment where the screen has been asked to change and has not yet.
   Most of them are instant, and some are not: a route compiling, a guard
   deciding where to send somebody, a slow network. The bar across the top
   says "it heard you" for those, and stays out of the way for the rest.

   It starts from three places — any same-origin link clicked, the router
   below, and the browser's own back and forward — and finishes when the
   address the app is showing actually changes.
   ========================================================================== */

type State = "idle" | "loading" | "done";

let state: State = "idle";
const listeners = new Set<() => void>();
let safety: ReturnType<typeof setTimeout> | undefined;

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** Something has asked to go elsewhere. */
export function startNavigation() {
  clearTimeout(safety);
  /* a navigation that never lands — refused, or to where we already are —
     must not leave the bar crawling forever */
  safety = setTimeout(() => finishNavigation(), 12_000);
  set("loading");
}

/** The new address is showing. */
export function finishNavigation() {
  clearTimeout(safety);
  if (state === "loading") set("done");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Where the app is now, as a link would name it. */
function here() {
  return window.location.pathname + window.location.search;
}

/** Whether going to `href` would change what is on screen. */
function isElsewhere(href: string) {
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin && url.pathname + url.search !== here();
  } catch {
    return false;
  }
}

/**
 * `useRouter` from `next/navigation`, with the bar started on the way out.
 * Import this one instead of Next's — the API is the same.
 */
export function useRouter(): ReturnType<typeof useNextRouter> {
  const router = useNextRouter();
  return React.useMemo(() => ({
    ...router,
    push: (href, options) => {
      if (isElsewhere(href)) startNavigation();
      router.push(href, options);
    },
    replace: (href, options) => {
      if (isElsewhere(href)) startNavigation();
      router.replace(href, options);
    },
    back: () => { startNavigation(); router.back(); },
    forward: () => { startNavigation(); router.forward(); },
  }), [router]);
}

/* ---- the bar --------------------------------------------------------------- */

/** Finishes the bar when the address changes. Needs a Suspense boundary. */
function RouteWatcher() {
  const pathname = usePathname();
  const search = useSearchParams();
  React.useEffect(() => { finishNavigation(); }, [pathname, search]);
  return null;
}

/** How long a navigation may take before it is worth showing at all. */
const SHOW_AFTER_MS = 120;

export function NavigationProgress() {
  const current = React.useSyncExternalStore(subscribe, () => state, () => "idle" as State);
  const [width, setWidth] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  /* Links and history. A click is caught before Next handles it, on the
     capture phase; anything that is not a plain, same-tab, in-app link is
     left to the browser, which shows its own progress for a full load. */
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (isElsewhere(a.href)) startNavigation();
    };
    const onPop = () => startNavigation();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  React.useEffect(() => {
    if (current === "loading") {
      /* a second navigation while the last one's bar is still leaving starts
         the bar again from the left, not from the far end */
      setWidth((w) => (w >= 92 ? 0 : w));
      /* quick navigations finish inside the delay and never show a bar */
      const show = setTimeout(() => { setVisible(true); setWidth(18); }, SHOW_AFTER_MS);
      /* then it creeps, more slowly the further it gets, and never arrives —
         only the navigation landing takes it to the end */
      const creep = setInterval(() => setWidth((w) => (w < 18 ? w : Math.min(92, w + (92 - w) * 0.08))), 200);
      return () => { clearTimeout(show); clearInterval(creep); };
    }
    if (current === "done") {
      if (!visible) { set("idle"); return; }
      setWidth(100);
      const hide = setTimeout(() => { setVisible(false); }, 220);
      const reset = setTimeout(() => { setWidth(0); set("idle"); }, 480);
      return () => { clearTimeout(hide); clearTimeout(reset); };
    }
    /* `visible` is read at the moment the navigation finishes, not tracked */
  }, [current]);

  return (
    <>
      <React.Suspense fallback={null}>
        <RouteWatcher />
      </React.Suspense>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[2.5px]"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 220ms var(--ease)" }}
      >
        <div
          className="h-full bg-accent shadow-[0_0_8px_var(--accent)]"
          style={{
            width: `${width}%`,
            transition: width === 0 ? "none" : "width 260ms var(--ease-out)",
          }}
        />
      </div>
      {/* read by assistive technology as a status, not as the bar itself */}
      <span role="status" aria-live="polite" className="sr-only">
        {visible && current === "loading" ? "Loading" : ""}
      </span>
    </>
  );
}
