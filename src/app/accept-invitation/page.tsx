"use client";

import * as React from "react";
import { ChoosePassword } from "@/components/layout/choose-password";
import { StageLoader } from "@/components/ui/loader";

/**
 * Where an invitation link lands: the first password an account ever has.
 *
 * `useSearchParams` reads the token, so the page is wrapped in a Suspense
 * boundary — without one this route would have to be rendered on every
 * request, and there is nothing here worth rendering on the server.
 */
export default function AcceptInvitationPage() {
  return (
    <React.Suspense fallback={<StageLoader className="!bg-stage" />}>
      <ChoosePassword mode="invite" />
    </React.Suspense>
  );
}
