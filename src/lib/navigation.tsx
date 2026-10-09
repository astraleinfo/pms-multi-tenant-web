"use client";

import * as React from "react";
import { usePathname, useRouter as useNextRouter, useSearchParams } from "next/navigation";
import { PageSkeleton } from "@/components/ui/loader";

/* ==========================================================================
   Navigation feedback.

   A click on a link, a `router.push` after a save, a redirect to sign-in —
   each is a moment where the screen has been asked to change and has not yet.
   Most of them are instant, and some are not: a route compiling, a guard
   deciding where to send somebody, a slow network. A loader in the page's
   own content area says "it heard you" for those, and stays out of the way
   for the rest.

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
     must not leave the loader up forever */
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
 * `useRouter` from `next/navigation`, with the loader started on the way out.
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

/* ---- the loader ------------------------------------------------------------- */

/** Finishes the navigation when the address changes. Needs a Suspense boundary. */
function RouteWatcher() {
  const pathname = usePathname();
  const search = useSearchParams();
  React.useEffect(() => { finishNavigation(); }, [pathname, search]);
  return null;
}

/** How long a navigation may take before it is worth showing at all. */
const SHOW_AFTER_MS = 120;

/**
 * Whether a navigation has been going long enough to show. Quick ones finish
 * inside the delay and never flash a loader.
 */
export function useNavigationPending() {
  const current = React.useSyncExternalStore(subscribe, () => state, () => "idle" as State);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (current !== "loading") { setPending(false); return; }
    const show = setTimeout(() => setPending(true), SHOW_AFTER_MS);
    return () => clearTimeout(show);
  }, [current]);

  return pending;
}

/**
 * Covers a shell's content area with the page skeleton while a navigation is
 * on its way — the rail and topbar stay put, and the page under it stays
 * mounted so a navigation that never lands leaves it as it was. The parent
 * must be positioned; `className` is the shell's own content container, so
 * the skeleton sits exactly where the page will.
 */
export function NavigationPending({ className }: { className?: string }) {
  const pending = useNavigationPending();
  if (!pending) return null;
  return (
    <div className="absolute inset-0 z-20 bg-ground">
      <div className={className}>
        <PageSkeleton />
      </div>
    </div>
  );
}

/**
 * Starts navigations from links and history, and finishes them when the
 * address changes. Renders nothing visible — `NavigationPending` does that,
 * inside each shell.
 */
export function NavigationProgress() {
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

  return (
    <React.Suspense fallback={null}>
      <RouteWatcher />
    </React.Suspense>
  );
}
