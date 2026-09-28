"use client";

import * as React from "react";
import { useRouter } from "@/lib/navigation";
import { useApp } from "@/lib/store/app-store";
import { StageLoader } from "@/components/ui/loader";

/**
 * The root is three different places depending on the address it was asked
 * for, so it cannot redirect on the server without first knowing the host:
 *
 *   admin.<root>     the super-admin console
 *   <slug>.<root>    a clinic — its dashboard, or its sign-in screen
 *   <root>           the apex, which is neither (`AppShell` renders it)
 */
export default function Home() {
  const router = useRouter();
  const { ready, host } = useApp();

  React.useEffect(() => {
    if (!ready) return;
    if (host.kind === "admin") router.replace("/platform");
    else if (host.kind === "tenant") router.replace("/dashboard");
  }, [ready, host.kind, router]);

  return <StageLoader />;
}
