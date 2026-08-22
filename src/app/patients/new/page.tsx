"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useSchema } from "@/lib/query/hooks";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DynamicForm, validateAgainstSchema, type FormValues } from "@/components/domain/dynamic-form";
import { FeatureGate } from "@/components/domain/gates";
import { IconArrowRight, IconCheck, IconChevronLeft, IconLayers } from "@/components/ui/icons";

export default function NewPatientPage() {
  return (
    <FeatureGate feature="patient">
      <NewPatient />
    </FeatureGate>
  );
}

function NewPatient() {
  const router = useRouter();
  const { createPatient, notify } = useApp();
  const { tenant } = useTenant();

  const { data: schema } = useSchema("patient");
  const [values, setValues] = React.useState<FormValues>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;
  const counts = {
    common: schema.filter((f) => f.scope === "common").length,
    clinical_type: schema.filter((f) => f.scope === "clinical_type").length,
    tenant: schema.filter((f) => f.scope === "tenant").length,
  };

  const submit = async () => {
    const errs = validateAgainstSchema(schema, values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      notify({ tone: "warn", title: "Some required fields are blank", body: "The form validates against the resolved schema, not a hard-coded list." });
      return;
    }
    const id = await createPatient(values);
    notify({ tone: "ok", title: "Patient registered", body: `${String(values.full_name)} was added to ${tenant.name}.` });
    router.push(`/patients/${id}`);
  };

  return (
    <>
      <PageHeader
        eyebrow="New record"
        title="Register a patient"
        description="Every field below came from the schema resolver — common fields, then the ones your clinical type adds, then anything this clinic defined itself."
        actions={
          <ButtonLink href="/patients" variant="ghost">
            <IconChevronLeft size={15} /> Back to patients
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader
            title="Patient details"
            subtitle="Required fields are marked. The tenant is stamped server-side and is never sent from here."
          />
          <CardBody>
            <DynamicForm
              fields={schema}
              values={values}
              onChange={(k, v) => {
                setValues((prev) => ({ ...prev, [k]: v }));
                setErrors((prev) => { const n = { ...prev }; delete n[k]; return n; });
              }}
              errors={errors}
              showScopes
            />
          </CardBody>
          <CardFooter>
            <p className="text-[0.75rem] text-ink-3">
              {schema.length} fields resolved for {tenant.name}
            </p>
            <div className="flex items-center gap-2.5">
              <Button variant="ghost" onClick={() => { setValues({}); setErrors({}); }}>Clear</Button>
              <Button variant="primary" onClick={() => void submit()}>
                <IconCheck size={15} /> Register patient
              </Button>
            </div>
          </CardFooter>
        </Card>

        <aside className="space-y-5">
          <Card>
            <CardHeader icon={<IconLayers size={16} />} title="How this form was built"
                        subtitle="Later scope wins on a field-key collision." />
            <CardBody className="pt-0">
              <ol className="space-y-3">
                {[
                  { badge: <Badge tone="neutral" size="sm">Common</Badge>, n: counts.common,
                    d: "Fields every clinic gets, whatever it treats." },
                  { badge: <Badge tone="accent" size="sm">Clinical</Badge>, n: counts.clinical_type,
                    d: `Added because this tenant is ${clinical.label.toLowerCase()}.` },
                  { badge: <Badge tone="accent" size="sm">Clinic</Badge>, n: counts.tenant,
                    d: "Custom fields this practice defined in Settings." },
                ].map((row, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="tnum mt-0.5 w-8 shrink-0 text-right font-mono text-[0.875rem] font-medium text-ink">
                      {row.n}
                    </span>
                    <div className="min-w-0">
                      {row.badge}
                      <p className="mt-1 text-[0.75rem] leading-snug text-ink-2">{row.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-t border-line-soft pt-3 text-[0.75rem] leading-relaxed text-ink-3">
                Switch the tenant in the topbar and this form changes shape — no branch in the component,
                just a different resolved schema.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Add a field" subtitle="Practice admins can extend this form." />
            <CardBody className="pt-0">
              <p className="text-[0.8125rem] leading-relaxed text-ink-2">
                Anything your clinic asks for that the standard record does not carry — an insurance number,
                a referral source — is a field definition, not a schema migration.
              </p>
              <ButtonLink href="/settings?tab=fields" variant="secondary" size="sm" className="mt-3.5">
                Manage custom fields <IconArrowRight size={14} />
              </ButtonLink>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
