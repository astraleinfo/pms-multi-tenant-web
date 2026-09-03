"use client";

import * as React from "react";
import { ChoosePassword } from "@/components/layout/choose-password";
import { StageLoader } from "@/components/ui/loader";

/** Where a reset link lands. Same page as an invitation; different wording. */
export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<StageLoader className="!bg-stage" />}>
      <ChoosePassword mode="reset" />
    </React.Suspense>
  );
}
