"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useApp, useTenant } from "@/lib/store/app-store";
import { usePatientSearch } from "@/lib/query/hooks";
import { ALL_NAV_ITEMS, roleAllows } from "@/lib/nav";
import { age } from "@/lib/format";
import { IconArrowRight, IconSearch, IconUser } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/misc";

interface Row {
  id: string;
  title: string;
  sub: string;
  href: string;
  group: "Patients" | "Go to";
  icon: React.ReactNode;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { hasFeature } = useApp();
  const { role } = useTenant();
  const [q, setQ] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (open) { setQ(""); setCursor(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  /* Typing here is a query; it settles before it is sent. */
  const term = useDebounced(q.trim(), 200);
  const { data: matches } = usePatientSearch(term, { enabled: open });

  const rows = React.useMemo<Row[]>(() => {
    const term = q.trim().toLowerCase();
    const navRows: Row[] = ALL_NAV_ITEMS
      .filter((i) => roleAllows(i, role) && (!i.feature || hasFeature(i.feature)))
      .filter((i) => !term || i.label.toLowerCase().includes(term) || i.description.toLowerCase().includes(term))
      .map((i) => ({
        id: i.href, title: i.label, sub: i.description, href: i.href, group: "Go to",
        icon: <i.icon size={16} />,
      }));

    /* Patients are searched in the database — the palette holds no register. */
    const patientRows: Row[] = matches
      .slice(0, 6)
      .map((p) => ({
        id: p.id, title: p.full_name,
        sub: `${p.mrn} · ${age(p.dob)}y · ${p.phone}`,
        href: `/patients/${p.id}`, group: "Patients",
        icon: <IconUser size={16} />,
      }));

    return [...patientRows, ...navRows].slice(0, 12);
  }, [q, matches, role, hasFeature]);

  React.useEffect(() => { setCursor(0); }, [q]);

  const go = React.useCallback((href: string) => { onClose(); router.push(href); }, [onClose, router]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    if (e.key === "Enter" && rows[cursor]) { e.preventDefault(); go(rows[cursor].href); }
    if (e.key === "Escape") onClose();
  };

  if (!mounted || !open) return null;

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-[hsl(var(--sh)/.38)] backdrop-blur-[3px] fade" onClick={onClose} aria-hidden />
      <div
        className="pop relative w-full max-w-xl overflow-hidden rounded-[var(--r-xl)] border border-line bg-surface shadow-e4"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="flex items-center gap-3 border-b border-line-soft px-4">
          <IconSearch size={18} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search patients by name, MRN or phone — or jump to a module"
            className="h-14 w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-placeholder"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="max-h-[54vh] overflow-y-auto p-2">
          {rows.length === 0 && (
            <p className="px-3 py-8 text-center text-body text-ink-3">
              Nothing matches “{q}”.
            </p>
          )}
          {rows.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <React.Fragment key={r.group + r.id}>
                {header && (
                  <p className="px-3 pb-1 pt-2.5 text-micro font-semibold uppercase tracking-[0.1em] text-ink-3">
                    {header}
                  </p>
                )}
                <button
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[var(--r)] px-3 py-2.5 text-left transition-colors",
                    i === cursor ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <span className={cn("shrink-0", i === cursor ? "text-accent-text" : "text-ink-3")}>{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink">{r.title}</span>
                    <span className="block truncate text-caption text-ink-3">{r.sub}</span>
                  </span>
                  {i === cursor && <IconArrowRight size={15} className="shrink-0 text-accent-text" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-line-soft bg-surface-2 px-4 py-2.5 text-caption text-ink-3">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto">Tenant-scoped — results never cross clinics.</span>
        </div>
      </div>
    </div>,
    document.body,
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
