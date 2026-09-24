"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { usePlatformSettings } from "@/lib/query/hooks";
import type { PlatformSettings } from "@/lib/api";
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
        description="What every new clinic starts with, and who a clinic that can't self-serve should write to."
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
  const [draft, setDraft] = React.useState(settings);
  const [saving, setSaving] = React.useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const set = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await updatePlatformSettings(draft);
      notify({ tone: "ok", title: "Settings saved", body: "New clinics pick this up right away; the support menu within a few minutes." });
    } catch (error) {
      notify({ tone: "critical", title: "Not saved", body: error instanceof Error ? error.message : "Try again." });
    }
    setSaving(false);
  };

  return (
    <div className="mt-5 space-y-5">
      <SettingsSection title="Support desk" hint="Shown in every clinic's Help menu and prefilled into module-request emails.">
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
    </div>
  );
}
