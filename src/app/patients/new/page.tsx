"use client";

import * as React from "react";
import { useRouter } from "@/lib/navigation";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useSchema } from "@/lib/query/hooks";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { DynamicForm, validateAgainstSchema, type FormValues } from "@/components/domain/dynamic-form";
import {
  IconArrowRight, IconCheck, IconPlus, IconUser,
} from "@/components/ui/icons";

export default function NewPatientPage() {
  return <NewPatient />;
}

function NewPatient() {
  const router = useRouter();
  const { createPatient, notify } = useApp();
  const { tenant } = useTenant();

  const { data: schema } = useSchema("patient");
  const [values, setValues] = React.useState<FormValues>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});


  const submit = async () => {
    const errs = validateAgainstSchema(schema, values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      notify({ tone: "warn", title: "Some required fields are blank", body: "Fill in the fields marked as required, then register again." });
      return;
    }
    const id = await createPatient(values);
    notify({ tone: "ok", title: "Patient registered", body: `${String(values.full_name)} was added to ${tenant.name}.` });
    router.push(`/patients/${id}`);
  };

  return (
    <>
      <PageHeader
        back={{ href: "/patients", label: "Patients" }}
        eyebrow="New record"
        title="Register a patient"
        description="Add a new patient to the register. The form includes every field your clinic records."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader
            icon={<IconUser size={15} />} tone="accent" title="Patient details"
            hint="Required fields are marked."
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
            />
          </CardBody>
          <CardFooter>
            <span />
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
            <CardHeader icon={<IconPlus size={15} />} title="Add a field" hint="Practice admins can extend this form." />
            <CardBody className="pt-0">
              <p className="text-label leading-relaxed text-ink-2">
                Need something this form doesn’t ask — an insurance number, a referral source? A practice
                admin can add it once and it appears here for every new patient.
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
