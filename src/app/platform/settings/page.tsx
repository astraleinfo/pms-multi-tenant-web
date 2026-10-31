"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { usePlatformBilling, usePlatformLogoUrl, usePlatformSettings } from "@/lib/query/hooks";
import type { PlatformSettings } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DEFAULT_LOGO_SRC, LOGO_TYPES, logoProblem, PLATFORM_NAME } from "@/lib/platform/brand";
import { daysToSeconds, hoursToSeconds, secondsToDays, secondsToHours } from "@/lib/platform/timings";
import { IconTrash, IconUpload } from "@/components/ui/icons";
import { ConsolePage } from "@/components/platform/chrome";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Select } from "@/components/ui/field";
import { SettingRow, SettingsActions, SettingsSection } from "@/components/ui/settings";
import { StageLoader } from "@/components/ui/loader";

export default function PlatformSettingsPage() {
  return (
    <ConsolePage superAdmin>
      <SettingsConsole />
    </ConsolePage>
  );
}

function SettingsConsole() {
  const { data, isPending } = usePlatformSettings();

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Settings"
        description="What every clinic pays, what every new clinic starts with, and who a clinic that can't self-serve should write to."
      />
      {isPending || !data ? (
        <StageLoader label="Reading platform settings…" />
      ) : (
        <SettingsForm settings={data} />
      )}
    </>
  );
}

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const { updatePlatformSettings, notify } = useApp();
  /* Bills are raised in the API's own currency, which the billing read says. */
  const { data: billing } = usePlatformBilling();
  const [draft, setDraft] = React.useState(settings);
  const [saving, setSaving] = React.useState(false);
  /* `has_logo` is not a field here — the Brand section changes it on its own
     save — so a new logo never shows up as "Unsaved changes". */
  const dirty = JSON.stringify({ ...draft, has_logo: null }) !== JSON.stringify({ ...settings, has_logo: null });

  const set = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await updatePlatformSettings(draft);
      notify({ tone: "ok", title: "Settings saved", body: "New clinics and the next billing run pick this up right away; the support menu within a few minutes." });
    } catch (error) {
      notify({ tone: "critical", title: "Not saved", body: error instanceof Error ? error.message : "Try again." });
    }
    setSaving(false);
  };

  return (
    <div className="mt-5 space-y-5">
      <SettingsSection
        title="Subscription"
        hint="Every clinic has every module. A clinic that is active and not exempt is billed this one fee each month; a clinic on trial is not billed. A change applies from the next bill raised — bills already raised keep the fee they were raised at."
      >
        <SettingRow label="Monthly fee per clinic" htmlFor="cfg-fee" suffix={billing?.currency ?? "INR"} width="sm">
          <NumberInput id="cfg-fee" min={0} max={99999999.99} step="0.01" value={draft.subscription_fee_monthly}
                       onChange={(n) => set("subscription_fee_monthly", n)} />
        </SettingRow>
        <SettingsActions note={dirty ? "Unsaved changes." : "Everything here matches the server."}>
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(settings)}>Discard</Button>
          <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </SettingsActions>
      </SettingsSection>

      <BrandSection custom={settings.has_logo} />

      <SettingsSection title="Support desk" hint="Shown in every clinic's Help menu.">
        <SettingRow label="Email" htmlFor="cfg-support-email">
          <Input id="cfg-support-email" type="email" value={draft.support_email}
                 onChange={(e) => set("support_email", e.target.value)} />
        </SettingRow>
        <SettingRow label="Phone" htmlFor="cfg-support-phone">
          <Input id="cfg-support-phone" value={draft.support_phone}
                 onChange={(e) => set("support_phone", e.target.value)} />
        </SettingRow>
        <SettingRow label="Hours" htmlFor="cfg-support-hours">
          <Input id="cfg-support-hours" value={draft.support_hours}
                 onChange={(e) => set("support_hours", e.target.value)} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="New-clinic defaults" hint="What a freshly created clinic starts with. Changing this never touches a clinic that already exists.">
        <SettingRow label="Day starts" htmlFor="cfg-day-start" width="md">
          <Input id="cfg-day-start" type="time" value={draft.default_day_start}
                 onChange={(e) => set("default_day_start", e.target.value)} />
        </SettingRow>
        <SettingRow label="Day ends" htmlFor="cfg-day-end" width="md">
          <Input id="cfg-day-end" type="time" value={draft.default_day_end}
                 onChange={(e) => set("default_day_end", e.target.value)} />
        </SettingRow>
        <SettingRow label="Slot interval" htmlFor="cfg-slot" width="md">
          <Select id="cfg-slot" value={String(draft.default_slot_minutes)}
                  onChange={(e) => set("default_slot_minutes", Number(e.target.value) as 15 | 20 | 30)}>
            {[15, 20, 30].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </Select>
        </SettingRow>
        <SettingRow label="Default visit length" htmlFor="cfg-duration" suffix="minutes" width="sm">
          <NumberInput id="cfg-duration" min={5} max={240} value={draft.default_duration}
                       onChange={(n) => set("default_duration", n)} />
        </SettingRow>
        <SettingRow label="Tax" htmlFor="cfg-tax" suffix="%" width="sm">
          <NumberInput id="cfg-tax" min={0} max={100} step="0.01" value={draft.default_tax_pct}
                       onChange={(n) => set("default_tax_pct", n)} />
        </SettingRow>
        <SettingRow label="Payment terms" htmlFor="cfg-terms" suffix="days" width="sm">
          <NumberInput id="cfg-terms" min={0} max={365} value={draft.default_payment_terms_days}
                       onChange={(n) => set("default_payment_terms_days", n)} />
        </SettingRow>
        <SettingRow label="Expiry alert window" htmlFor="cfg-expiry" suffix="days" width="sm">
          <NumberInput id="cfg-expiry" min={1} max={730} value={draft.default_expiry_alert_days}
                       onChange={(n) => set("default_expiry_alert_days", n)} />
        </SettingRow>
        <SettingRow label="Currency" htmlFor="cfg-currency" width="md">
          <Select id="cfg-currency" value={draft.default_currency}
                  onChange={(e) => set("default_currency", e.target.value as PlatformSettings["default_currency"])}>
            {(["INR", "GBP", "EUR", "USD"] as const).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </SettingRow>
        <SettingsActions note={dirty ? "Unsaved changes." : "Everything here matches the server."}>
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(settings)}>Discard</Button>
          <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </SettingsActions>
      </SettingsSection>

      <SettingsSection title="Timing" hint="How long links stay live, how far ahead a reminder goes out, and the billing ladder's own clock.">
        <SettingRow label="Invitation link expires after" htmlFor="cfg-invite-ttl" suffix="days" width="sm">
          <NumberInput id="cfg-invite-ttl" min={1} max={30}
                       value={secondsToDays(draft.invite_token_ttl_seconds)}
                       onChange={(days) => set("invite_token_ttl_seconds", daysToSeconds(days))} />
        </SettingRow>
        <SettingRow label="Password reset link expires after" htmlFor="cfg-reset-ttl" suffix="hours" width="sm">
          <NumberInput id="cfg-reset-ttl" min={1} max={72}
                       value={secondsToHours(draft.reset_token_ttl_seconds)}
                       onChange={(hours) => set("reset_token_ttl_seconds", hoursToSeconds(hours))} />
        </SettingRow>
        <SettingRow label="Appointment reminder, before the slot" htmlFor="cfg-reminder-lead" suffix="hours" width="sm">
          <NumberInput id="cfg-reminder-lead" min={1} max={72} value={draft.reminder_lead_hours}
                       onChange={(n) => set("reminder_lead_hours", n)} />
        </SettingRow>
        <SettingRow label="Bill due" htmlFor="cfg-rent-due" suffix="days" width="sm">
          <NumberInput id="cfg-rent-due" min={1} max={60} value={draft.rent_due_days}
                       onChange={(n) => set("rent_due_days", n)} />
        </SettingRow>
        <SettingRow label="Grace period" htmlFor="cfg-rent-grace" suffix="days" width="sm">
          <NumberInput id="cfg-rent-grace" min={0} max={60} value={draft.rent_grace_days}
                       onChange={(n) => set("rent_grace_days", n)} />
        </SettingRow>
        <SettingRow label="Due-soon reminder" htmlFor="cfg-rent-reminder" suffix="days" width="sm">
          <NumberInput id="cfg-rent-reminder" min={0} max={30} value={draft.rent_reminder_days_before_due}
                       onChange={(n) => set("rent_reminder_days_before_due", n)} />
        </SettingRow>
        <SettingsActions note={dirty ? "Unsaved changes." : "Everything here matches the server."}>
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(settings)}>Discard</Button>
          <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </SettingsActions>
      </SettingsSection>

      <SettingsSection
        title="Referral programme"
        hint="What one completed referral earns its referrer. A referral counts once the clinic it referred pays its first bill. Changing this never rewrites a referral already earned."
      >
        <SettingRow label="Credit per referral" htmlFor="cfg-referral-credit" suffix="₹" width="sm">
          <NumberInput id="cfg-referral-credit" min={0} max={999999} step="0.01"
                       value={draft.referral_credit_amount}
                       onChange={(n) => set("referral_credit_amount", n)} />
        </SettingRow>
        <SettingsActions note={dirty ? "Unsaved changes." : "Everything here matches the server."}>
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(settings)}>Discard</Button>
          <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </SettingsActions>
      </SettingsSection>
    </div>
  );
}

/**
 * The platform's own logo — what every email's header and the subscription
 * bill carry. Choosing a file only stages it: the preview shows it on the
 * same dark ground the email and the bill draw it on, and nothing is sent
 * until "Save logo". Removing goes back to the built-in logo, never to none.
 */
function BrandSection({ custom }: { custom: boolean }) {
  const { uploadPlatformLogo, removePlatformLogo, notify } = useApp();
  const currentUrl = usePlatformLogoUrl();
  const input = React.useRef<HTMLInputElement>(null);
  const [staged, setStaged] = React.useState<{ file: File; url: string } | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => () => { if (staged) URL.revokeObjectURL(staged.url); }, [staged]);

  const stage = (file: File | undefined) => {
    if (!file) return;
    const reason = logoProblem(file);
    setProblem(reason);
    setStaged(reason ? null : { file, url: URL.createObjectURL(file) });
    if (input.current) input.current.value = "";
  };

  const save = async () => {
    if (!staged) return;
    setBusy(true);
    try {
      await uploadPlatformLogo(staged.file);
      notify({ tone: "ok", title: "Logo saved", body: "Emails and subscription bills carry it from now on." });
      setStaged(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That logo was not saved. Try again.");
    }
    setBusy(false);
  };

  const reset = async () => {
    setBusy(true);
    try {
      await removePlatformLogo();
      notify({ tone: "ok", title: "Back to the built-in logo", body: "Emails and subscription bills carry the Astrale logo again." });
    } catch (error) {
      notify({ tone: "critical", title: "Not changed", body: error instanceof Error ? error.message : "Try again." });
    }
    setBusy(false);
  };

  const shown = staged?.url ?? currentUrl ?? DEFAULT_LOGO_SRC;
  const caption = staged
    ? `Preview: ${staged.file.name}`
    : custom ? "Custom logo" : "Built-in Astrale logo";

  return (
    <SettingsSection
      title="Brand"
      hint="The logo in the header of every email the platform sends — invitations, password resets, bills and clinics' invoices to patients — and on the subscription bill. Clinics' own documents carry the clinic's logo, not this one."
    >
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center">
        {/* the logo as an email and the bill draw it: on the dark stage */}
        <figure className="min-w-0">
          <div className="flex h-24 items-center justify-center rounded-[var(--r)] border border-white/10 bg-stage px-5">
            <img
              src={shown}
              alt={`${PLATFORM_NAME} logo`}
              className="max-h-10 max-w-full object-contain"
              /* a file named .png that is not one: say so now, not after the upload */
              onError={() => {
                if (!staged) return;
                setStaged(null);
                setProblem("That file could not be read as an image. A logo has to be a PNG, JPEG or WebP image.");
              }}
            />
          </div>
          <figcaption className="mt-1.5 truncate text-caption text-ink-3">{caption}</figcaption>
        </figure>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); stage(e.dataTransfer.files?.[0]); }}
          className={cn(
            "flex min-w-0 flex-col items-start gap-2 rounded-[var(--r)] border border-dashed p-3 transition-colors",
            dragging ? "border-accent bg-accent-soft" : "border-line",
          )}
        >
          <p className="text-label text-ink">
            Drag a logo here, or{" "}
            <button type="button" className="font-medium text-accent-text underline-offset-2 hover:underline"
                    onClick={() => input.current?.click()} disabled={busy}>
              choose a file
            </button>.
          </p>
          <p className="text-caption leading-snug text-ink-3">
            PNG, JPEG or WebP, up to 2 MB. It is drawn on a dark background, so a white or light logo
            on a transparent background reads best. A wide logo that spells the name stands on its own;
            a square mark sits beside the word {PLATFORM_NAME}.
          </p>
          <input
            ref={input}
            type="file"
            accept={LOGO_TYPES.join(",")}
            className="sr-only"
            aria-label="Choose a logo"
            onChange={(e) => stage(e.target.files?.[0])}
          />
          {problem && <p role="alert" className="text-caption font-medium text-critical-text">{problem}</p>}
        </div>
      </div>

      <SettingsActions
        note={staged ? "This logo is not saved yet." : custom ? "Every email and bill carries this logo." : "Every email and bill carries the built-in logo."}
      >
        {staged ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => { setStaged(null); setProblem(null); }}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save logo"}
            </Button>
          </>
        ) : (
          <>
            {custom && (
              <Button variant="ghost" disabled={busy} onClick={() => void reset()}>
                <IconTrash size={14} /> Use the built-in logo
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
              <IconUpload size={14} /> {custom ? "Replace logo" : "Upload a logo"}
            </Button>
          </>
        )}
      </SettingsActions>
    </SettingsSection>
  );
}
