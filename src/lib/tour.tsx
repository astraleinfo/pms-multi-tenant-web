"use client";

import type { FeatureKey, Role } from "@/lib/types";

/* ==========================================================================
   The first-run tour.

   What it teaches is the thing this product is actually about: that the
   address is the clinic, that a clinical type changes the forms, that an
   entitlement locks whole modules, and that a clinic's own fields sit on top
   of all three. Everything else here is chrome.

   Steps are declarative and filtered before the tour starts — by role, by
   entitlement, and by whether their anchor is on screen at all — so nobody is
   ever shown a step pointing at something they cannot see. A step whose anchor
   never appears is skipped rather than left hanging.
   ========================================================================== */

/** Raise this to show the tour again, once, to everyone who has seen an older one. */
export const TOUR_VERSION = 1;

export interface TourStep {
  id: string;
  title: string;
  body: React.ReactNode;
  /** `[data-tour="…"]`; omitted for a step that stands in the middle of the screen */
  anchor?: string;
  /** the route this step lives on — the tour navigates there first */
  href?: string;
  /** which side of the anchor the card prefers */
  placement?: "top" | "bottom" | "left" | "right";
  /** only for these roles */
  roles?: Role[];
  /** only when this module is switched on */
  feature?: FeatureKey;
  /** only when it is *not* — for the step that explains locked modules */
  whenLocked?: FeatureKey;
}

export interface TourContext {
  role: Role;
  clinicName: string;
  clinicalLabel: string;
  examLabel: string;
  hasFeature: (key: FeatureKey) => boolean;
  /** true when at least one module in the nav is locked */
  anyLocked: boolean;
}

export function buildTour(ctx: TourContext): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "welcome",
      title: `Welcome to ${ctx.clinicName}`,
      /* The count is filled in below, once the steps this person actually gets
         are known — promising six stops and giving nine is a small lie the
         first thing you ever say should not contain. */
      body: null,
    },
    {
      id: "tenant",
      anchor: "rail-tenant",
      placement: "right",
      title: "This address is the clinic",
      body: (
        <>
          Every request you make from here is scoped to {ctx.clinicName} because of the address it arrives on.
          There is no clinic selector to get wrong, and a session here is not a session anywhere else.
        </>
      ),
    },
    {
      id: "modules",
      anchor: "rail-nav",
      placement: "right",
      title: ctx.anyLocked ? "Modules, and the ones you do not have" : "The modules you run",
      body: ctx.anyLocked ? (
        <>
          Patients, appointments, queue, consultation and prescriptions are always on. The rest are entitlements —
          a padlock means this clinic has not been given that one. Clicking it opens the module&rsquo;s own page:
          what it does, what it costs, and how to ask for it.
        </>
      ) : (
        <>
          Patients, appointments, queue, consultation and prescriptions are always on; this clinic has the rest as
          well. Entitlements are enforced by the server, not by what appears here.
        </>
      ),
    },
    {
      id: "clinical-type",
      anchor: "topbar-context",
      placement: "bottom",
      title: `${ctx.clinicalLabel} is not the same as what you have bought`,
      body: (
        <>
          The clinical type decides the shape of the work — here, {ctx.examLabel.toLowerCase()} — while entitlements
          decide which modules exist at all. The two never touch: a feature check never reads your discipline.
        </>
      ),
    },
    {
      id: "search",
      anchor: "topbar-search",
      placement: "bottom",
      title: "Find anyone, from anywhere",
      body: (
        <>
          <kbd className="rounded border border-line-strong bg-surface-2 px-1 font-mono text-[0.6875rem]">⌘K</kbd>{" "}
          searches patients and jumps between modules. Patient search runs in the database, so it is the same speed
          on a register of fifty as on one of fifty thousand.
        </>
      ),
    },
    {
      id: "queue",
      href: "/queue",
      anchor: "queue-board",
      placement: "top",
      feature: "queue",
      title: "The day runs on the board",
      body: (
        <>
          Tokens are issued per clinic per day, and every move — called, in consultation, completed — is a
          transition the server will refuse if it does not make sense. The waiting-room screen follows it live.
        </>
      ),
    },
    {
      id: "patients",
      href: "/patients",
      anchor: "patients-search",
      placement: "bottom",
      feature: "patient",
      roles: ["tenant_admin", "receptionist", "doctor", "pharmacist", "lab_tech"],
      title: "The register, and the fields your clinic added",
      body: (
        <>
          Searching, sorting and paging all happen in the database. The registration form is built from your
          clinic&rsquo;s effective schema: common fields, then {ctx.clinicalLabel.toLowerCase()} fields, then anything
          an admin has added here.
        </>
      ),
    },
    {
      id: "entitlements",
      href: "/settings?tab=features",
      anchor: "settings-features",
      placement: "top",
      roles: ["tenant_admin"],
      title: "What this clinic has, and what it has not",
      body: (
        <>
          Every module is listed here with its price and whether it is on. The switch itself is the platform&rsquo;s:
          a super admin grants a module, and it unlocks for everyone on the next request. The clinic&rsquo;s own
          custom fields live on the next tab.
        </>
      ),
    },
    {
      id: "done",
      title: "That is the shape of it",
      body: (
        <>
          Everything else follows the same four ideas. You can run this again whenever you like — it is under your
          name in the top right, and in Settings.
        </>
      ),
    },
  ];

  const yours = steps.filter((step) => {
    if (step.roles && !step.roles.includes(ctx.role) && ctx.role !== "tenant_admin") return false;
    if (step.feature && !ctx.hasFeature(step.feature)) return false;
    if (step.whenLocked && ctx.hasFeature(step.whenLocked)) return false;
    return true;
  });

  const stops = yours.length - 2; /* the welcome and the sign-off are not stops */
  return yours.map((step) => (step.id === "welcome"
    ? {
      ...step,
      body: (
        <>
          A couple of minutes, {stops} stops, and you can leave at any point. This is a{" "}
          {ctx.clinicalLabel.toLowerCase()} practice, and the product knows it — the forms, the charts and the
          reports all follow from that.
        </>
      ),
    }
    : step));
}
