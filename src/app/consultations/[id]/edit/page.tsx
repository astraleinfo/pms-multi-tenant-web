"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb } from "@/lib/query/hooks";
import { billedOn, findEncounter, selectPrescriptions } from "@/lib/data/repository";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { RoleGate } from "@/components/domain/gates";
import { ConsultationWorkspace } from "@/components/domain/consultation-workspace";
import { IconChevronLeft, IconLock, IconStethoscope } from "@/components/ui/icons";

export default function EditConsultationPage(props: PageProps<"/consultations/[id]/edit">) {
  const { id } = React.use(props.params);
  return (
    <RoleGate allow={["doctor"]}>
      <Editor id={id} />
    </RoleGate>
  );
}

function Editor({ id }: { id: string }) {
  const { session } = useApp();
  const db = useClinicDb();
  const t = session.tenantId;
  const encounter = findEncounter(db, t, id);

  if (!encounter) {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={<IconStethoscope size={26} />}
          title="No such encounter in this clinic"
          body="This consultation doesn’t exist, or it has been removed."
          action={<ButtonLink href="/consultations" variant="secondary" size="sm"><IconChevronLeft size={14} /> All consultations</ButtonLink>}
        />
      </Card>
    );
  }

  /* The server refuses too; this says so before anyone types anything. */
  const billed = billedOn(db, t, id);
  if (billed) {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={<IconLock size={26} />}
          title="This consultation has been paid for"
          body={`Invoice ${billed.number} has been paid, so the consultation and its prescription are locked. Void the invoice to correct them.`}
          action={<ButtonLink href={`/consultations/${id}`} variant="secondary" size="sm"><IconChevronLeft size={14} /> Back to the consultation</ButtonLink>}
        />
      </Card>
    );
  }

  const prescription = selectPrescriptions(db, t).find((r) => r.encounter_id === id) ?? null;
  /* keyed, so the form fills from what was saved rather than from a half-loaded clinic */
  return (
    <ConsultationWorkspace
      key={`${encounter.id}:${prescription?.id ?? "none"}`}
      editing={{ encounter, prescription }}
    />
  );
}
