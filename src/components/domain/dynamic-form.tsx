"use client";

import * as React from "react";
import type { FieldDefinition } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Legend } from "@/components/ui/card";
import { ChipMulti, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, type Tone } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

const SCOPE_META: Record<FieldDefinition["scope"], { label: string; tone: Tone }> = {
  common: { label: "Common", tone: "neutral" },
  clinical_type: { label: "Clinical", tone: "accent" },
  tenant: { label: "Clinic", tone: "accent" },
};

export type FormValues = Record<string, unknown>;

/**
 * Renders the effective schema from §3.3. The form has no idea which fields
 * exist — it draws whatever the resolver returned, in order, grouped.
 */
export function DynamicForm({
  fields, values, onChange, errors, showScopes = false, columns = 2, className,
}: {
  fields: FieldDefinition[];
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
  showScopes?: boolean;
  columns?: 1 | 2;
  className?: string;
}) {
  const groups = React.useMemo(() => {
    const map = new Map<string, FieldDefinition[]>();
    for (const f of fields) {
      const g = f.group ?? "Details";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(f);
    }
    return [...map.entries()];
  }, [fields]);

  return (
    <div className={cn("space-y-6", className)}>
      {groups.map(([group, defs]) => (
        <section key={group}>
          <Legend>{group}</Legend>
          <div className={cn("grid gap-4", columns === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
            {defs.map((f) => (
              <DynamicField
                key={f.id}
                def={f}
                value={values[f.field_key]}
                onChange={(v) => onChange(f.field_key, v)}
                error={errors?.[f.field_key]}
                showScope={showScopes}
                columns={columns}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DynamicField({
  def, value, onChange, error, showScope, columns = 2,
}: {
  def: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  showScope?: boolean;
  columns?: 1 | 2;
}) {
  const id = `f-${def.id}`;
  const span = columns === 2 && def.span === 2 ? "sm:col-span-2" : "";
  const scope = SCOPE_META[def.scope];

  const label = (
    <span className="inline-flex items-center gap-2">
      {def.label}
      {showScope && <Badge tone={scope.tone} size="sm">{scope.label}</Badge>}
    </span>
  );

  return (
    <Field
      label={label}
      required={def.required}
      help={def.help}
      error={error}
      htmlFor={id}
      className={span}
    >
      {def.type === "textarea" ? (
        <Textarea id={id} value={String(value ?? "")} invalid={!!error}
                  onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : def.type === "select" ? (
        <Select id={id} value={String(value ?? "")} invalid={!!error} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not recorded</option>
          {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      ) : def.type === "multiselect" ? (
        <ChipMulti
          options={def.options ?? []}
          values={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      ) : def.type === "boolean" ? (
        <div className="flex h-9.5 items-center">
          <Checkbox checked={value === true} onChange={onChange} label={def.help ? undefined : "Yes"} />
        </div>
      ) : (
        <Input
          id={id}
          invalid={!!error}
          type={def.type === "number" ? "number" : def.type === "date" ? "date" : def.type === "email" ? "email" : def.type === "phone" ? "tel" : "text"}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(def.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        />
      )}
    </Field>
  );
}

/** Required-field validation against the resolved schema. */
export function validateAgainstSchema(fields: FieldDefinition[], values: FormValues) {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.required) continue;
    const v = values[f.field_key];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) errors[f.field_key] = `${f.label} is required.`;
  }
  return errors;
}

/** A stored value shown the way its field type asks for. */
function renderValue(def: FieldDefinition, v: unknown) {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (def.type === "date") return formatDate(String(v), "long");
  return String(v);
}

/** Read-only rendering of whatever ended up in clinical_ext. */
export function DynamicSummary({
  fields, values, className,
}: {
  fields: FieldDefinition[];
  values: FormValues;
  className?: string;
}) {
  const rows = fields
    .map((f) => ({ f, v: values[f.field_key] }))
    .filter(({ v }) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));

  if (!rows.length) {
    return <p className={cn("text-[0.8438rem] text-ink-3", className)}>Nothing recorded for this section.</p>;
  }

  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {rows.map(({ f, v }) => (
        <div key={f.id} className="min-w-0">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">{f.label}</dt>
          <dd className="mt-0.5 text-[0.875rem] text-ink">{renderValue(f, v)}</dd>
        </div>
      ))}
    </dl>
  );
}
