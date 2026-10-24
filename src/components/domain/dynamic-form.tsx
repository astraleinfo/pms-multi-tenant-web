"use client";

import * as React from "react";
import type { FieldDefinition } from "@/lib/types";
import { cn } from "@/lib/cn";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Legend } from "@/components/ui/card";
import { ChipMulti, Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { formatDate, today } from "@/lib/format";

export type FormValues = Record<string, unknown>;

/**
 * Renders the effective schema from §3.3. The form has no idea which fields
 * exist — it draws whatever the resolver returned, in order, grouped.
 */
export function DynamicForm({
  fields, values, onChange, errors, columns = 2, className,
}: {
  fields: FieldDefinition[];
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
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
  def, value, onChange, error, columns = 2,
}: {
  def: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  columns?: 1 | 2;
}) {
  const id = `f-${def.id}`;
  const span = columns === 2 && def.span === 2 ? "sm:col-span-2" : "";

  const label = (
    /* Where a field comes from (common, clinical type, the clinic's own) is
       the builder's business, not the person filling it in — so no tag. */
    <span className="inline-flex items-center gap-2">{def.label}</span>
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
          {(def.options ?? []).map((o) => <option key={o} value={o}>{optionLabel(o)}</option>)}
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
          /* nobody is born tomorrow */
          max={def.type === "date" && def.field_key === "dob" ? today() : undefined}
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
  if (def.type === "select") return optionLabel(String(v));
  return String(v);
}

/** Options are stored as written (`female`); they are shown as a word starts a label. */
const optionLabel = (o: string) => o.charAt(0).toUpperCase() + o.slice(1);

/**
 * The resolved schema, reduced to the rows that have something in them.
 *
 * Exported because a record page often wants to interleave schema fields with
 * facts the schema does not hold — a record number, when somebody registered —
 * and lay the result out in columns of its own choosing. `DynamicSummary` is
 * the common case; this is the seam under it.
 */
export function summaryRows(fields: FieldDefinition[], values: FormValues) {
  return fields
    .map((f) => ({ f, v: values[f.field_key] }))
    .filter(({ v }) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(({ f, v }) => ({ key: f.id, label: f.label, value: renderValue(f, v) }));
}

/** Read-only rendering of whatever ended up in clinical_ext. */
export function DynamicSummary({
  fields, values, className, columns = 2,
}: {
  fields: FieldDefinition[];
  values: FormValues;
  className?: string;
  /** one ruled column in a narrow sidebar, two on a full-width panel */
  columns?: 1 | 2;
}) {
  const rows = fields
    .map((f) => ({ f, v: values[f.field_key] }))
    .filter(({ v }) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));

  if (!rows.length) {
    return <p className={cn("text-label text-ink-3", className)}>Nothing recorded for this section.</p>;
  }

  /* Two ruled columns rather than a grid of stacked pairs: a resolved record
     runs to fifteen or twenty fields, and stacked they are a drift of grey
     over dark with no column for the eye to follow. */
  return (
    <DataList columns={columns} className={className}>
      {rows.map(({ f, v }) => (
        <DataRow key={f.id} label={f.label} value={renderValue(f, v)} />
      ))}
    </DataList>
  );
}
