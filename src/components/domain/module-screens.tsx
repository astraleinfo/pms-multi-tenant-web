"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { FeatureKey } from "@/lib/types";

/* ==========================================================================
   What a module looks like, before a clinic has it.

   These are drawn, not captured: the same surfaces, lines, type and status
   colours as the real screens, filled with plausible sample data. A PNG goes
   out of date the first time the real screen changes and is blurry on half the
   screens it lands on; these follow the theme, stay sharp, and cost nothing to
   load. Every figure in them is sample data, and the frame says so.
   ========================================================================== */

interface Screen {
  title: string;
  caption: string;
  path: string;
  body: React.ReactNode;
}

/* ---- the pieces every screen is built from ------------------------------------ */

type Tone = "accent" | "ok" | "warn" | "critical" | "neutral";

const PILL: Record<Tone, string> = {
  accent: "border-accent-border bg-accent-soft text-accent-text",
  ok: "border-ok-border bg-ok-soft text-ok-text",
  warn: "border-warn-border bg-warn-soft text-warn-text",
  critical: "border-critical-border bg-critical-soft text-critical-text",
  neutral: "border-line bg-surface-2 text-ink-2",
};

function Pill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-[var(--r-pill)] border px-1.5 py-px text-[10px] font-medium leading-4", PILL[tone])}>
      {children}
    </span>
  );
}

function Btn({ primary, children }: { primary?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[var(--r-sm)] px-2 text-[10.5px] font-medium",
        primary ? "bg-accent text-accent-ink" : "border border-line-strong bg-surface text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</p>;
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line-soft rounded-[var(--r)] border border-line bg-surface">{children}</div>;
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-2.5 px-2.5 py-2 text-[11px] text-ink", className)}>{children}</div>;
}

function Meter({ value, tone = "accent" }: { value: number; tone?: "accent" | "warn" | "critical" }) {
  const colour = { accent: "bg-accent", warn: "bg-warn", critical: "bg-critical" }[tone];
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-inset">
      <span className={cn("block h-full rounded-full", colour)} style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

function Money({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <span className={cn("tnum font-mono text-[11px]", strong ? "font-semibold text-ink" : "text-ink-2")}>{children}</span>;
}

/** A browser window around a screen, so it reads as the product and not as a diagram. */
function Frame({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[var(--r-lg)] border border-line-strong bg-ground shadow-e2">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-critical/60" />
          <span className="h-2 w-2 rounded-full bg-warn/60" />
          <span className="h-2 w-2 rounded-full bg-ok/60" />
        </span>
        <span className="tnum min-w-0 flex-1 truncate rounded-[var(--r-sm)] bg-surface-2 px-2 py-0.5 text-center font-mono text-[10px] text-ink-3">
          your-clinic.astrale.health{path}
        </span>
        <span className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-ink-3">Sample data</span>
      </div>
      <div className="min-h-[15rem] p-3.5">{children}</div>
    </div>
  );
}

/* ---- the screens, module by module -------------------------------------------- */

const SCREENS: Partial<Record<FeatureKey, Screen[]>> = {
  pharmacy: [
    {
      title: "The counter queue",
      caption: "Prescriptions your clinicians signed, oldest first, with allergies where the pharmacist will see them.",
      path: "/pharmacy",
      body: (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Head>Waiting at the counter · 4</Head>
            <Pill tone="warn">1 part-dispensed</Pill>
          </div>
          <Rows>
            {[
              ["Anita Sharma", "3 items · Dr Iyer", "Penicillin", "Dispense"],
              ["Rahul Menon", "1 item · Dr Munro", null, "Dispense"],
              ["Fatima Khan", "2 of 4 left · Dr Iyer", null, "Continue"],
              ["Joseph Thomas", "2 items · Dr Rao", "Sulfa", "Dispense"],
            ].map(([name, meta, allergy, action]) => (
              <Row key={name}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="block truncate text-[10px] text-ink-3">{meta}</span>
                </span>
                {allergy && <Pill tone="critical">Allergy: {allergy}</Pill>}
                <Btn primary={action === "Dispense"}>{action}</Btn>
              </Row>
            ))}
          </Rows>
        </div>
      ),
    },
    {
      title: "Hand-over, batch by batch",
      caption: "Pick the batch — the first to expire is suggested — and the stock moves in the same step.",
      path: "/pharmacy",
      body: (
        <div className="mx-auto max-w-[19rem] space-y-2.5 rounded-[var(--r-lg)] border border-line bg-surface p-3 shadow-e1">
          <p className="text-[12px] font-semibold text-ink">Dispense · Amoxicillin 500 mg</p>
          <p className="text-[10.5px] text-ink-3">1 capsule three times daily · 5 days · 15 capsules</p>
          <Head>Batch</Head>
          <Rows>
            <Row className="bg-accent-soft/60"><span className="flex-1 font-mono">AMX-2211</span><span className="text-[10px] text-ink-3">exp. Mar 2027</span><Pill tone="accent">Suggested</Pill></Row>
            <Row><span className="flex-1 font-mono">AMX-2307</span><span className="text-[10px] text-ink-3">exp. Nov 2027</span></Row>
          </Rows>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ink-2">Quantity <span className="tnum ml-1 rounded border border-line px-1.5 font-mono">15</span></span>
            <span className="text-ink-3">Stock after: <span className="tnum font-mono text-ink">125</span></span>
          </div>
          <div className="flex justify-end gap-1.5"><Btn>Cancel</Btn><Btn primary>Hand over</Btn></div>
        </div>
      ),
    },
    {
      title: "Settle at the window",
      caption: "What was handed over becomes a pharmacy charge — paid here, or left on the account for the desk.",
      path: "/pharmacy",
      body: (
        <div className="space-y-2.5">
          <Head>Pharmacy counter · Anita Sharma</Head>
          <Rows>
            <Row><span className="flex-1">Amoxicillin 500 mg × 15</span><Money>₹180.00</Money></Row>
            <Row><span className="flex-1">Ibuprofen 400 mg × 10</span><Money>₹42.00</Money></Row>
            <Row><span className="flex-1">Chlorhexidine mouthwash</span><Money>₹115.00</Money></Row>
            <Row className="bg-surface-2"><span className="flex-1 font-semibold">To pay</span><Money strong>₹337.00</Money></Row>
          </Rows>
          <div className="flex flex-wrap gap-1.5">
            {["Cash", "Card", "UPI", "Insurance"].map((m, i) => (
              <span key={m} className={cn("rounded-[var(--r-sm)] border px-2 py-1 text-[10.5px]", i === 2 ? "border-accent bg-accent-soft text-accent-text" : "border-line text-ink-2")}>{m}</span>
            ))}
          </div>
          <div className="flex justify-end gap-1.5"><Btn>Bill to account</Btn><Btn primary>Take ₹337.00</Btn></div>
        </div>
      ),
    },
  ],

  lab: [
    {
      title: "The bench",
      caption: "Every order with the patient and the clinician who asked for it, by where it has got to.",
      path: "/lab",
      body: (
        <div className="space-y-2.5">
          <div className="flex gap-1.5">
            <Pill tone="neutral">Ordered 3</Pill><Pill tone="warn">In progress 2</Pill><Pill tone="accent">Resulted 1</Pill>
          </div>
          <Rows>
            {[
              ["Full blood count", "Rahul Menon · Dr Iyer", "In progress", "warn"],
              ["Orthopantomogram", "Anita Sharma · Dr Munro", "Ordered", "neutral"],
              ["HbA1c", "Joseph Thomas · Dr Rao", "Resulted", "accent"],
              ["Periapical radiograph", "Fatima Khan · Dr Iyer", "In progress", "warn"],
            ].map(([test, who, state, tone]) => (
              <Row key={test}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{test}</span>
                  <span className="block truncate text-[10px] text-ink-3">{who}</span>
                </span>
                <Pill tone={tone as Tone}>{state}</Pill>
              </Row>
            ))}
          </Rows>
        </div>
      ),
    },
    {
      title: "Results, flagged",
      caption: "Enter each analyte against its range; anything high or low says so before anybody reads it.",
      path: "/lab",
      body: (
        <div className="space-y-2.5">
          <Head>Full blood count · Rahul Menon</Head>
          <Rows>
            <Row className="bg-surface-2 text-[10px] font-semibold text-ink-3"><span className="flex-1">Analyte</span><span className="w-24 text-right">Value</span><span className="w-20 text-right">Range</span><span className="w-12" /></Row>
            {[
              ["Haemoglobin", "13.8 g/dL", "13–17", null],
              ["White cells", "12.9 ×10⁹/L", "4–11", "High"],
              ["Platelets", "241 ×10⁹/L", "150–400", null],
              ["Neutrophils", "1.6 ×10⁹/L", "2–7.5", "Low"],
            ].map(([name, value, range, flag]) => (
              <Row key={name}>
                <span className="flex-1">{name}</span>
                <span className="tnum w-24 whitespace-nowrap text-right font-mono">{value}</span>
                <span className="tnum w-20 text-right font-mono text-ink-3">{range}</span>
                <span className="w-12 text-right">{flag && <Pill tone={flag === "High" ? "critical" : "warn"}>{flag}</Pill>}</span>
              </Row>
            ))}
          </Rows>
        </div>
      ),
    },
    {
      title: "Verify to release",
      caption: "Nothing reaches the clinician until someone signs for it — and the scan is filed with the order.",
      path: "/lab",
      body: (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between"><Head>Orthopantomogram · Anita Sharma</Head><Pill tone="accent">Resulted</Pill></div>
          <div className="flex items-center gap-2.5 rounded-[var(--r)] border border-line bg-surface p-2.5">
            <span className="flex h-12 w-16 items-center justify-center rounded-[var(--r-sm)] bg-gradient-to-br from-ink/80 to-ink/40 text-[9px] font-medium text-white">OPG</span>
            <span className="min-w-0 flex-1 text-[11px]"><span className="block font-medium text-ink">opg-anita-sharma.png</span><span className="block text-[10px] text-ink-3">2.1 MB · attached by Imaging &amp; lab</span></span>
          </div>
          <p className="rounded-[var(--r)] border border-line bg-surface-2 p-2.5 text-[11px] leading-relaxed text-ink-2">
            Impacted 38 with mesioangular tilt. No periapical pathology elsewhere.
          </p>
          <div className="flex justify-end gap-1.5"><Btn>Back to bench</Btn><Btn primary>Verify &amp; release</Btn></div>
        </div>
      ),
    },
  ],

  inventory: [
    {
      title: "Stock on hand",
      caption: "Totals from the ledger, never typed in — with anything under its reorder level called out.",
      path: "/inventory",
      body: (
        <Rows>
          {[
            ["Composite resin A2", 9, 12, "warn"],
            ["Amoxicillin 500 mg", 140, 60, "accent"],
            ["Gutta percha, size 30", 5, 8, "critical"],
            ["Lidocaine 2% cartridges", 86, 40, "accent"],
            ["Chlorhexidine mouthwash", 14, 20, "warn"],
          ].map(([name, onHand, reorder, tone]) => (
            <Row key={name as string}>
              <span className="w-40 min-w-0 truncate font-medium">{name}</span>
              <span className="flex-1"><Meter value={((onHand as number) / ((reorder as number) * 2.5)) * 100} tone={tone as "accent" | "warn" | "critical"} /></span>
              <span className="tnum w-8 text-right font-mono">{onHand}</span>
              {(onHand as number) < (reorder as number) ? <Pill tone={tone === "critical" ? "critical" : "warn"}>Reorder</Pill> : <span className="w-[3.3rem]" />}
            </Row>
          ))}
        </Rows>
      ),
    },
    {
      title: "Booking a delivery",
      caption: "Batch, expiry and cost go in with the supplier's paperwork in front of you; the selling price follows your rule.",
      path: "/inventory",
      body: (
        <div className="mx-auto grid max-w-[22rem] grid-cols-2 gap-2 rounded-[var(--r-lg)] border border-line bg-surface p-3 shadow-e1">
          <p className="col-span-2 text-[12px] font-semibold text-ink">Receive · Lidocaine 2% cartridges</p>
          {[["Batch", "LDC-0931"], ["Expiry", "2027-08-31"], ["Quantity", "100"], ["Cost / unit", "₹18.50"], ["Pricing", "Cost + 40%"], ["Sells at", "₹25.90"]].map(([k, v]) => (
            <div key={k}>
              <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{k}</span>
              <span className="tnum mt-0.5 block rounded-[var(--r-sm)] border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink">{v}</span>
            </div>
          ))}
          <div className="col-span-2 flex justify-end gap-1.5"><Btn>Cancel</Btn><Btn primary>Book delivery</Btn></div>
        </div>
      ),
    },
    {
      title: "Expiry watch",
      caption: "Batches inside the window you set, soonest first, so nothing is found on the shelf too late.",
      path: "/inventory",
      body: (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between"><Head>Expiring within 90 days</Head><Pill tone="warn">4 batches</Pill></div>
          <Rows>
            {[["Metronidazole 400 mg", "MTZ-1180", 12, "critical"], ["Chlorhexidine mouthwash", "CHX-0402", 34, "warn"], ["Lidocaine 2%", "LDC-0877", 58, "warn"], ["Ibuprofen 400 mg", "IBU-2210", 81, "neutral"]].map(([name, batch, days, tone]) => (
              <Row key={batch as string}>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{name}</span><span className="block font-mono text-[10px] text-ink-3">{batch}</span></span>
                <Pill tone={tone as Tone}>{days} days</Pill>
              </Row>
            ))}
          </Rows>
        </div>
      ),
    },
  ],

  billing: [
    {
      title: "Composed from the visit",
      caption: "The lines a consultation earned, priced from your tariff — and a warning if one was already billed.",
      path: "/billing",
      body: (
        <div className="space-y-2.5">
          <Head>New invoice · Samuel Rée · clinic counter</Head>
          <Rows>
            {[["Emergency consultation", "₹800.00", true, null], ["Composite build-up, tooth 21", "₹2,500.00", true, null], ["Periapical radiograph", "₹300.00", true, null], ["Chlorhexidine mouthwash", "₹115.00", false, "Billed at pharmacy"]].map(([line, amount, on, note]) => (
              <Row key={line as string} className={on ? "" : "opacity-60"}>
                <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-[9px]", on ? "border-accent bg-accent text-accent-ink" : "border-line-strong")}>{on ? "✓" : ""}</span>
                <span className="flex-1">{line}</span>
                {note && <Pill tone="warn">{note}</Pill>}
                <Money>{amount}</Money>
              </Row>
            ))}
            <Row className="bg-surface-2"><span className="flex-1 font-semibold">Total</span><Money strong>₹3,600.00</Money></Row>
          </Rows>
          <div className="flex justify-end gap-1.5"><Btn>Save draft</Btn><Btn primary>Issue invoice</Btn></div>
        </div>
      ),
    },
    {
      title: "Part payments, any method",
      caption: "Take what the patient pays today; the rest stays on the invoice with its due date.",
      path: "/billing/NG-INV-2042",
      body: (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between"><Head>NG-INV-2042</Head><Pill tone="warn">Part paid</Pill></div>
          <div className="grid grid-cols-3 gap-2">
            {[["Total", "₹3,600"], ["Paid", "₹1,500"], ["Balance", "₹2,100"]].map(([k, v], i) => (
              <div key={k} className={cn("rounded-[var(--r)] border p-2", i === 2 ? "border-accent-border bg-accent-soft" : "border-line bg-surface")}>
                <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{k}</span>
                <span className="tnum mt-0.5 block font-mono text-[13px] font-semibold text-ink">{v}</span>
              </div>
            ))}
          </div>
          <Rows>
            <Row><span className="flex-1 text-ink-2">23 Sep · Cash</span><Money>₹1,500.00</Money></Row>
          </Rows>
          <div className="flex justify-end gap-1.5"><Btn>Print / PDF</Btn><Btn primary>Take payment</Btn></div>
        </div>
      ),
    },
    {
      title: "One patient, three counters",
      caption: "What is owed at the clinic, the lab and the pharmacy — and what nobody has billed yet.",
      path: "/patients/NG-1455",
      body: (
        <div className="space-y-2.5">
          <Head>Account · Samuel Rée</Head>
          <div className="grid grid-cols-3 gap-2">
            {[["Clinic", "₹2,100", "1 invoice open"], ["Lab", "₹0", "Settled"], ["Pharmacy", "₹337", "Not yet billed"]].map(([k, v, hint]) => (
              <div key={k} className="rounded-[var(--r)] border border-line bg-surface p-2">
                <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{k}</span>
                <span className="tnum mt-0.5 block font-mono text-[13px] font-semibold text-ink">{v}</span>
                <span className="block text-[10px] text-ink-3">{hint}</span>
              </div>
            ))}
          </div>
          <Rows>
            <Row><span className="flex-1">Amoxicillin 500 mg × 15</span><Pill tone="warn">Unbilled</Pill><Money>₹180.00</Money></Row>
            <Row><span className="flex-1">Chlorhexidine mouthwash</span><Pill tone="warn">Unbilled</Pill><Money>₹115.00</Money></Row>
          </Rows>
        </div>
      ),
    },
  ],

  advanced_reports: [
    {
      title: "By clinician",
      caption: "Encounters, prescriptions and what each clinician's visits billed, side by side.",
      path: "/reports",
      body: (
        <Rows>
          <Row className="bg-surface-2 text-[10px] font-semibold text-ink-3"><span className="w-28">Clinician</span><span className="flex-1">Encounters</span><span className="w-16 text-right">Billed</span></Row>
          {[["Dr Aparna Iyer", 64, "₹1.18L"], ["Dr Felix Munro", 51, "₹94,200"], ["Dr Meera Rao", 33, "₹61,800"]].map(([name, seen, billed]) => (
            <Row key={name as string}>
              <span className="w-28 truncate font-medium">{name}</span>
              <span className="flex flex-1 items-center gap-2"><Meter value={((seen as number) / 70) * 100} /><span className="tnum w-6 font-mono">{seen}</span></span>
              <Money>{billed}</Money>
            </Row>
          ))}
        </Rows>
      ),
    },
    {
      title: "Where the money comes from",
      caption: "The revenue mix across consultations, procedures, lab and pharmacy for the window you choose.",
      path: "/reports",
      body: (
        <div className="flex items-center gap-5">
          <span
            className="relative h-28 w-28 shrink-0 rounded-full"
            style={{ background: "conic-gradient(var(--accent) 0 56%, color-mix(in srgb, var(--accent) 55%, white) 0 83%, var(--ok) 0 94%, var(--warn) 0 100%)" }}
            aria-hidden
          >
            <span className="absolute inset-5 flex items-center justify-center rounded-full bg-ground text-[10px] font-semibold text-ink">₹2.75L</span>
          </span>
          <ul className="space-y-1.5 text-[11px]">
            {[["Procedures", "56%", "bg-accent"], ["Consultations", "27%", "bg-accent/55"], ["Lab", "11%", "bg-ok"], ["Pharmacy", "6%", "bg-warn"]].map(([k, v, c]) => (
              <li key={k} className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", c)} /><span className="w-24 text-ink-2">{k}</span><span className="tnum font-mono text-ink">{v}</span></li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      title: "Who your patients are",
      caption: "Age bands and case mix, from the records you already keep.",
      path: "/reports",
      body: (
        <div className="space-y-2">
          <Head>Patients by age</Head>
          <div className="flex h-32 items-end gap-3 border-b border-line px-1">
            {[["0–17", 18], ["18–34", 62], ["35–54", 88], ["55–74", 54], ["75+", 21]].map(([band, h]) => (
              <div key={band as string} className="flex h-full flex-1 flex-col items-center justify-end">
                <span className="w-full rounded-t-[4px] bg-accent" style={{ height: `${h}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-3 px-1">
            {["0–17", "18–34", "35–54", "55–74", "75+"].map((b) => <span key={b} className="flex-1 text-center text-[10px] text-ink-3">{b}</span>)}
          </div>
        </div>
      ),
    },
  ],
};

export function hasScreens(key: FeatureKey) {
  return !!SCREENS[key]?.length;
}

/**
 * The gallery: one large screen at a time, with the others as tabs beside it.
 * Keyboard reachable — the tabs are buttons with `aria-selected`.
 */
export function ModuleScreens({ feature }: { feature: FeatureKey }) {
  const screens = SCREENS[feature] ?? [];
  const [index, setIndex] = React.useState(0);
  if (!screens.length) return null;
  const current = screens[Math.min(index, screens.length - 1)];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
      <figure className="min-w-0">
        <Frame path={current.path}>{current.body}</Frame>
        <figcaption className="mt-2.5 text-label leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{current.title}.</span> {current.caption}
        </figcaption>
      </figure>
      <div role="tablist" aria-label="Screens" className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
        {screens.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={cn(
              "min-w-[11rem] shrink-0 rounded-[var(--r)] border px-3 py-2.5 text-left transition-colors md:min-w-0",
              i === index ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
            )}
          >
            <span className="tnum block font-mono text-micro text-ink-3">{String(i + 1).padStart(2, "0")}</span>
            <span className={cn("mt-0.5 block text-label font-medium", i === index ? "text-accent-text" : "text-ink")}>{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
