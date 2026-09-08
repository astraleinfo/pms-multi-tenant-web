"use client";

import * as React from "react";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useDoctors, useServicePrices } from "@/lib/query/hooks";
import { currency } from "@/lib/format";
import type { ServiceKind, ServicePrice } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { Modal } from "@/components/ui/modal";
import {
  Checkbox, Field, Input, NumberInput, SearchInput, Select,
} from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RoleGate } from "@/components/domain/gates";
import { IconCard, IconEdit, IconFlask, IconPlus, IconReceipt, IconTrash } from "@/components/ui/icons";

type Tab = ServiceKind | "all";

const KIND_LABEL: Record<ServiceKind, string> = {
  consultation: "Consultation",
  procedure: "Procedure",
  lab: "Lab and scans",
  other: "Other",
};

const KINDS: ServiceKind[] = ["consultation", "procedure", "lab", "other"];

export default function PricingPage() {
  return (
    /* Empty allow list: `RoleGate` lets a practice admin through whatever it
       says, and this is theirs alone. The server enforces the same thing —
       `tenant:config:write` — so hiding the buttons is a courtesy, not a
       control. */
    <RoleGate allow={[]}>
      <Pricing />
    </RoleGate>
  );
}

function Pricing() {
  const { config } = useApp();
  const { tenant } = useTenant();
  const { data: prices, isPending } = useServicePrices();

  const [tab, setTab] = React.useState<Tab>("all");
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<ServicePrice | "new" | null>(null);
  const [importing, setImporting] = React.useState(false);

  const rows = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return prices
      .filter((p) => tab === "all" || p.kind === tab)
      .filter((p) => !term || `${p.name} ${p.code} ${p.note ?? ""}`.toLowerCase().includes(term));
  }, [prices, tab, q]);

  const counts = React.useMemo(
    () => Object.fromEntries(KINDS.map((k) => [k, prices.filter((p) => p.kind === k).length])),
    [prices],
  );

  const consultation = prices.find((p) => p.kind === "consultation" && p.active);
  const labPriced = prices.filter((p) => p.kind === "lab" && p.active).length;
  const unpriced = prices.filter((p) => p.active && p.price <= 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        title="Pricing"
        description="What this clinic charges for everything that is not stock: the consultation, each procedure, and every scan by its own code. Billing quotes these — nothing here is a number in the code, and no two clinics have to agree."
        meta={<span className="text-[0.8125rem] text-ink-2">Prices are in {config.currency}</span>}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <IconFlask size={15} /> Price the lab catalogue
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <IconPlus size={15} /> Add a price
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Consultation" value={consultation ? currency(consultation.price) : "Not set"}
              tone={consultation ? undefined : "warn"} icon={<IconReceipt size={16} />}
              hint={consultation ? "The clinic default — a doctor's own fee overrides it" : "Billing will suggest zero"} />
        <Stat label="Priced tests and scans" value={labPriced} icon={<IconFlask size={16} />}
              hint={`For ${tenant.clinical_type} orders`} />
        <Stat label="Procedures" value={counts.procedure ?? 0} icon={<IconCard size={16} />}
              hint="Offered when composing an invoice" />
        <Stat label="Set to zero" value={unpriced} tone={unpriced ? "warn" : "ok"}
              icon={<IconCard size={16} />} hint={unpriced ? "Still to be decided" : "Everything has a figure"} />
      </section>

      <Tabs
        className="mb-5 mt-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "all", label: "Everything", count: prices.length },
          ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k], count: counts[k] ?? 0 })),
        ]}
      />

      <Card className="overflow-hidden">
        <CardHeader
          title="The tariff"
          subtitle="A price is quoted the moment an invoice is composed. Retiring one keeps it on the invoices that already carry it."
          actions={
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or code"
                         wrapperClassName="w-52" className="h-8 text-[0.8125rem]" />
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={<IconCard size={20} />}
            title={isPending ? "Loading the tariff…" : "Nothing priced here yet"}
            body={isPending ? undefined : "Add a price, or start from the lab catalogue."}
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Code</TH>
                  <TH>Kind</TH>
                  <TH align="right">Price</TH>
                  <TH align="right">Tax</TH>
                  <TH align="right">Offered</TH>
                  <TH align="right">{""}</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <span className="block text-ink">{p.name}</span>
                      {p.note && <span className="block text-[0.75rem] text-ink-3">{p.note}</span>}
                    </TD>
                    <TD className="tnum font-mono text-[0.8125rem] text-ink-2">{p.code}</TD>
                    <TD className="text-ink-2">{KIND_LABEL[p.kind]}</TD>
                    <TD align="right">
                      <span className={`tnum font-mono ${p.price <= 0 ? "text-warn-text" : "text-ink"}`}>
                        {currency(p.price)}
                      </span>
                    </TD>
                    <TD align="right" className="tnum font-mono text-ink-2">{p.tax_pct}%</TD>
                    <TD align="right">
                      <Badge tone={p.active ? "ok" : "neutral"} size="sm" dot={false}>
                        {p.active ? "Offered" : "Retired"}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`}
                              onClick={() => setEditing(p)}>
                        <IconEdit size={14} />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <DoctorFeesCard />

      <Card className="mt-5">
        <CardHeader title="Where these are quoted" />
        <CardBody className="pt-1">
          <ul className="space-y-2.5 text-[0.8125rem] leading-relaxed text-ink-2">
            <li>
              <span className="font-medium text-ink">Consultation</span> — one row, code{" "}
              <code className="font-mono text-[0.75rem]">CONSULTATION</code>. Every invoice composed from a
              visit starts with it, unless the visiting doctor has their own fee set below, which takes
              precedence.
            </li>
            <li>
              <span className="font-medium text-ink">Lab and scans</span> — one row per test code, so an
              ultrasound and a blood count are not the same money. The code has to match the catalogue's.
            </li>
            <li>
              <span className="font-medium text-ink">Procedures and other</span> — offered as lines to add by
              hand.
            </li>
            <li>
              A line with nothing behind it is suggested at zero and says so, rather than quietly inventing a
              figure.
            </li>
          </ul>
        </CardBody>
      </Card>

      <PriceModal
        open={editing !== null}
        price={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

/**
 * Each doctor's own consultation fee, distinct from the clinic default above.
 *
 * The box is backed by a raw string, not `NumberInput`'s number: "blank"
 * (revert to the default) has to stay distinguishable from "explicitly
 * zero", and a numeric-only control collapses both to the same value.
 */
function DoctorFeesCard() {
  const { setDoctorFee, notify } = useApp();
  const { data: doctors, isPending } = useDoctors();
  const { data: prices } = useServicePrices();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState<string | null>(null);

  const clinicDefault = prices.find((p) => p.kind === "consultation" && p.active);

  const save = async (doctorId: string, raw: string) => {
    const trimmed = raw.trim();
    const fee = trimmed === "" ? null : Number(trimmed);
    if (fee !== null && (Number.isNaN(fee) || fee < 0)) {
      notify({ tone: "warn", title: "Enter a valid amount, or leave it blank for the default" });
      return;
    }
    setSaving(doctorId);
    try {
      await setDoctorFee(doctorId, fee);
      notify({ tone: "ok", title: fee === null ? "Reverted to clinic default" : "Fee saved" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="mt-5 overflow-hidden">
      <CardHeader
        title="Consultations by doctor"
        subtitle={`Leave blank to use the clinic default${clinicDefault ? ` (${currency(clinicDefault.price)})` : ""}. A doctor's own fee overrides it wherever their visits are billed.`}
      />
      {isPending ? (
        <CardBody><p className="text-[0.8125rem] text-ink-2">Loading…</p></CardBody>
      ) : doctors.length === 0 ? (
        <EmptyState compact title="No doctors yet" body="Add a clinician to set their consultation fee." />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr><TH>Doctor</TH><TH align="right">Fee</TH></tr>
            </THead>
            <TBody>
              {doctors.map((d) => {
                const draft = drafts[d.id] ?? (d.consultation_fee != null ? String(d.consultation_fee) : "");
                return (
                  <TR key={d.id}>
                    <TD>
                      <span className="block text-ink">{d.name}</span>
                      {d.speciality && <span className="block text-[0.75rem] text-ink-3">{d.speciality}</span>}
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder={clinicDefault ? String(clinicDefault.price) : "0"}
                          value={draft}
                          onChange={(e) => setDrafts((p) => ({ ...p, [d.id]: e.target.value }))}
                          onBlur={(e) => void save(d.id, e.target.value)}
                          className="w-28 text-right"
                          disabled={saving === d.id}
                        />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </Card>
  );
}

function PriceModal({
  open, price, onClose,
}: {
  open: boolean;
  price: ServicePrice | null;
  onClose: () => void;
}) {
  const { config, createServicePrice, updateServicePrice, deleteServicePrice, notify } = useApp();

  const [kind, setKind] = React.useState<ServiceKind>("procedure");
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState(0);
  const [tax, setTax] = React.useState(0);
  const [active, setActive] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setKind(price?.kind ?? "procedure");
    setCode(price?.code ?? "");
    setName(price?.name ?? "");
    setAmount(price?.price ?? 0);
    setTax(price?.tax_pct ?? config.tax_pct);
    setActive(price?.active ?? true);
    setNote(price?.note ?? "");
    setError(null);
    setSaving(false);
  }, [open, price, config.tax_pct]);

  const save = async () => {
    if (!code.trim() || !name.trim()) {
      setError("A price needs a code and a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (price) {
        await updateServicePrice(price.id, {
          name: name.trim(), price: amount, tax_pct: tax, active, note: note.trim() || null,
        });
      } else {
        await createServicePrice({
          kind, code: code.trim(), name: name.trim(), price: amount, tax_pct: tax, active,
          note: note.trim() || null,
        });
      }
      notify({ tone: "ok", title: "Price saved", body: `${name.trim()} — ${currency(amount)}` });
      onClose();
    } catch (e) {
      /* the API refuses a duplicate code by name, and says which one */
      setError(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={price ? "Edit a price" : "Add a price"}
      subtitle={price
        ? "Invoices already raised keep the figure they were composed with."
        : "Billing will quote this the next time it is composed."}
      footer={
        <>
          {price && (
            <Button
              variant="ghost"
              className="mr-auto text-critical-text"
              onClick={() => {
                deleteServicePrice(price.id);
                notify({ tone: "ok", title: "Price removed", body: price.name });
                onClose();
              }}
            >
              <IconTrash size={14} /> Remove
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            <IconPlus size={15} /> {price ? "Save changes" : "Add price"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-2.5 text-[0.8125rem] text-critical-text">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Kind" required help={price ? "A price keeps the kind it was created with." : undefined}>
            <Select value={kind} disabled={!!price}
                    onChange={(e) => setKind(e.target.value as ServiceKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field
            label="Code"
            required
            help={kind === "lab"
              ? "Must match the test's code in the catalogue — that is how a scan finds its price."
              : "A short key, unique within its kind."}
          >
            <Input value={code} disabled={!!price} onChange={(e) => setCode(e.target.value)}
                   placeholder={kind === "lab" ? "CBCT" : "CROWN-ZR"} />
          </Field>
        </div>

        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cone beam CT" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={`Price (${config.currency})`} required>
            <NumberInput min={0} step="0.01" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Tax %" help="Applied to this line when it is billed.">
            <NumberInput min={0} max={100} step="0.01" value={tax} onChange={setTax} />
          </Field>
        </div>

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="Panel, room, anything that tells two rows apart" />
        </Field>

        <Checkbox
          checked={active}
          onChange={setActive}
          label="Offer this price"
          description="Turn it off to keep it for the invoices that already quote it without offering it to the next one."
        />
      </div>
    </Modal>
  );
}

/**
 * Filling the lab half of the tariff.
 *
 * Pricing each scan means a row per scan, and typing sixteen of them by hand is
 * the tedious part of setting this up. This creates the ones that are missing
 * at one starting figure, ready to be edited; anything already priced is left
 * exactly as it is.
 */
function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config, importLabCataloguePrices, notify } = useApp();
  const [amount, setAmount] = React.useState(0);
  const [tax, setTax] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) { setAmount(0); setTax(config.tax_pct); setSaving(false); }
  }, [open, config.tax_pct]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Price the lab catalogue"
      subtitle="One row per test this clinic can order, at a starting figure you can edit afterwards."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const created = await importLabCataloguePrices(amount, tax);
                notify({
                  tone: "ok",
                  title: created.length
                    ? `${created.length} tests priced`
                    : "Everything was already priced",
                  body: created.length ? "Edit each one to charge what you charge." : undefined,
                });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            <IconFlask size={15} /> Create the missing rows
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={`Starting price (${config.currency})`} required>
            <NumberInput min={0} step="0.01" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Tax %">
            <NumberInput min={0} max={100} step="0.01" value={tax} onChange={setTax} />
          </Field>
        </div>
        <p className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-2">
          Only the tests your discipline can order are created, and any test that already has a price keeps
          it. Nothing here changes an invoice that has already been raised.
        </p>
      </div>
    </Modal>
  );
}
