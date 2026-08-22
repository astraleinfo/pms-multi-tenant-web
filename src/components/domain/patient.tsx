"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { usePatient, usePatientSearch } from "@/lib/query/hooks";
import { age, formatDate } from "@/lib/format";
import type { Patient } from "@/lib/types";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/field";
import { IconAlert, IconCheck, IconChevronDown } from "@/components/ui/icons";

/** Name + record number + age, the way a patient is referred to everywhere. */
export function PatientChip({
  patient, size = "md", href, sub, className,
}: {
  patient: Patient;
  size?: "sm" | "md" | "lg";
  href?: string;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <PatientRef
      id={patient.id}
      name={patient.full_name}
      size={size}
      href={href}
      sub={sub ?? <>{patient.mrn} · {age(patient.dob)}y · {patient.sex[0].toUpperCase()}</>}
      className={className}
    />
  );
}

/**
 * The same chip from what a list row already carries.
 *
 * Rows that mention a patient come back with `patient_name` and `patient_mrn`
 * on them, so a screen can render a name without holding the register — which
 * is what makes the register safe to paginate.
 */
export function PatientRef({
  id, name, mrn, size = "md", href, sub, className,
}: {
  id: string;
  name: string;
  mrn?: string;
  size?: "sm" | "md" | "lg";
  href?: string;
  sub?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar name={name} size={size === "lg" ? "md" : size === "sm" ? "xs" : "sm"} tintKey={id} />
      <span className="min-w-0">
        <span className={cn(
          "block truncate font-medium text-ink",
          size === "lg" ? "text-[0.9375rem]" : size === "sm" ? "text-[0.8125rem]" : "text-[0.875rem]",
        )}>
          {name}
        </span>
        {(sub ?? mrn) && (
          <span className="block truncate text-[0.75rem] text-ink-3">{sub ?? mrn}</span>
        )}
      </span>
    </span>
  );
  return href ? (
    <Link href={href} className="min-w-0 rounded-[var(--r-sm)] transition-opacity hover:opacity-80">{body}</Link>
  ) : body;
}

/** Allergy line — a clinical safety flag, so it wears the critical tone. */
export function AllergyFlag({ patient, className }: { patient: Patient; className?: string }) {
  const none = !patient.allergies || patient.allergies.toLowerCase().startsWith("none");
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[0.75rem]", className)}>
      {none ? (
        <Badge tone="neutral" size="sm"><IconCheck size={11} /> No known allergies</Badge>
      ) : (
        <Badge tone="critical" size="sm"><IconAlert size={11} /> {patient.allergies}</Badge>
      )}
    </span>
  );
}

/**
 * Searchable patient selector.
 *
 * The search runs in the database — name, record number or phone — so this
 * works the same on a register of fifty and one of fifty thousand, and the
 * browser never holds a list it did not ask to show.
 */
export function PatientPicker({
  value, onChange, placeholder = "Search by name, MRN or phone", exclude,
}: {
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  exclude?: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const term = useDebounced(q, 200);
  const ref = React.useRef<HTMLDivElement>(null);

  const { data: matches, isFetching } = usePatientSearch(term, { enabled: open });
  const { data: selected } = usePatient(value ?? "");

  const results = React.useMemo(
    () => matches.filter((p) => !exclude?.includes(p.id)),
    [matches, exclude],
  );

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2.5 rounded-[var(--r)] border border-line-strong bg-surface px-3 text-left transition-colors hover:border-ink-3/40"
      >
        {selected ? (
          <PatientChip patient={selected} className="flex-1" />
        ) : (
          <span className="flex-1 text-[0.875rem] text-ink-3">{placeholder}</span>
        )}
        <IconChevronDown size={16} className="shrink-0 text-ink-3" />
      </button>

      {open && (
        <div className="pop absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-[var(--r)] border border-line bg-surface shadow-e3">
          <div className="border-b border-line-soft p-2">
            <SearchInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
          </div>
          <ul className="max-h-64 overflow-y-auto p-1.5">
            {results.length === 0 && (
              <li className="px-3 py-6 text-center text-[0.8125rem] text-ink-3">
                {q.trim().length < 2
                  ? "Type at least two characters."
                  : isFetching ? "Searching…" : `No patient matches “${q}”.`}
              </li>
            )}
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => { onChange(p.id); setOpen(false); setQ(""); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors",
                    p.id === value ? "bg-accent-soft" : "hover:bg-surface-2",
                  )}
                >
                  <PatientChip patient={p} className="flex-1" />
                  <span className="shrink-0 text-[0.75rem] text-ink-3">
                    {p.last_visit ? formatDate(p.last_visit) : "New"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


/** Waits for typing to settle before asking the server. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
