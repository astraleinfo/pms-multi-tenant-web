"use client";

import * as React from "react";
import { RoleGate } from "@/components/domain/gates";
import { ConsultationWorkspace } from "@/components/domain/consultation-workspace";

export default function NewConsultationPage(props: PageProps<"/consultations/new">) {
  const sp = React.use(props.searchParams);
  const queueId = typeof sp.queue === "string" ? sp.queue : undefined;
  const patientId = typeof sp.patient === "string" ? sp.patient : undefined;
  /* Where the caller wants this workspace opened. The patient record's "Add
     prescription" and "Order lab test" both land here, because in this product
     neither exists outside an encounter — so the least the link can do is put
     the reader in front of the section they pressed for. */
  const focus = sp.focus === "prescription" || sp.focus === "lab" ? sp.focus : undefined;
  return (
    <RoleGate allow={["doctor"]}>
      <ConsultationWorkspace queueId={queueId} patientId={patientId} focus={focus} />
    </RoleGate>
  );
}
