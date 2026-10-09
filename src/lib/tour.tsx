"use client";

import type { Role } from "@/lib/types";

/* ==========================================================================
   The first-run tour.

   What it teaches is the thing this product is actually about: that the
   address is the clinic, that a clinical type changes the forms, and that a
   clinic's own fields and configuration sit on top of both. Every clinic has
   every module, so there is nothing about modules to explain beyond that.
   Everything else here is chrome.

   Steps are declarative and filtered before the tour starts — by role, and by
   whether their anchor is on screen at all — so nobody is ever shown a step
   pointing at something they cannot see. A step whose anchor
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
}

export interface TourContext {
  role: Role;
  clinicName: string;
  clinicalLabel: string;
  examLabel: string;
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
      title: "Every module, for every clinic",
      body: (
        <>
          From patients to billing and reports, every clinic on Astrale has every module. What this list shows
          you follows your role, never your clinic — and the server checks the same permissions on every request.
        </>
      ),
    },
    {
      id: "clinical-type",
      anchor: "topbar-context",
      placement: "bottom",
      title: `${ctx.clinicalLabel} shapes the work, not the menu`,
      body: (
        <>
          The clinical type decides what is recorded inside each module — here, {ctx.examLabel.toLowerCase()} — and
          the charts and reports that follow from it. It never decides which modules exist: a dental practice, an
          eye centre and a skin clinic have the same ones.
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
          <kbd className="rounded border border-line-strong bg-surface-2 px-1 font-mono text-micro">⌘K</kbd>{" "}
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
      id: "customisation",
      href: "/settings?tab=fields",
      anchor: "settings-fields",
      placement: "top",
      roles: ["tenant_admin"],
      title: "Your clinic's own fields",
      body: (
        <>
          A field added here sits on top of the common and {ctx.clinicalLabel.toLowerCase()} sets, and appears on
          the forms straight away. Configuration — hours, prefixes, tax, currency — changes how each module
          behaves. Neither ever hides a module.
        </>
      ),
    },
    {
      id: "done",
      title: "That is the shape of it",
      body: (
        <>
          Everything else follows the same three ideas. You can run this again whenever you like — it is under your
          name in the top right, and in Settings.
        </>
      ),
    },
  ];

  const yours = steps.filter((step) => {
    if (step.roles && !step.roles.includes(ctx.role) && ctx.role !== "tenant_admin") return false;
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
