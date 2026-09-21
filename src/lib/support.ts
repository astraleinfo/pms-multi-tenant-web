import { currency } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/nav";
import type { Feature, Tenant, User } from "@/lib/types";

/* ==========================================================================
   The support desk.

   A clinic cannot switch a module on for itself — the entitlement is the
   platform's to grant (§3.2), and the console is where a super admin grants
   it. What a clinic *can* do is ask, so the details of who to ask live here
   rather than being typed into whichever page needed them.

   The three values are read from the environment so a deployment can point at
   its own desk; the defaults are Astrale's.
   ========================================================================== */

export const SUPPORT = {
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@astrale.health",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "+91 80 4718 2200",
  hours: process.env.NEXT_PUBLIC_SUPPORT_HOURS || "Monday to Saturday, 9am – 7pm IST",
};

/** `+91 80 4718 2200` → `+918047182200`, which is what a phone will dial. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

type Ask = "activation" | "walkthrough";

/**
 * A prefilled mail to the desk about one module.
 *
 * Everything support would otherwise have to ask for — which clinic, which
 * slug, which module, who is asking — is already in the body, because the
 * person sending it is standing in front of a screen that knows all four.
 */
export function moduleMailto(
  ask: Ask,
  { feature, tenant, user }: { feature: Feature; tenant: Tenant; user: User },
) {
  const subject =
    ask === "activation"
      ? `Enable ${feature.name} for ${tenant.name}`
      : `Walkthrough of ${feature.name} for ${tenant.name}`;

  const opening =
    ask === "activation"
      ? `We would like the ${feature.name} module enabled for our clinic.`
      : `We would like a walkthrough of the ${feature.name} module before deciding.`;

  const body = [
    "Hello Astrale support,",
    "",
    opening,
    "",
    `Clinic:  ${tenant.name}${tenant.slug ? ` (${tenant.slug})` : ""}`,
    `Module:  ${feature.name} (${feature.key})`,
    `Listed:  ${currency(feature.price_monthly)} per month`,
    `Asked by: ${user.name} — ${ROLE_LABEL[user.role]}${user.email ? `, ${user.email}` : ""}`,
    "",
    "Thank you,",
    user.name,
  ].join("\n");

  return `mailto:${SUPPORT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
