import { currency } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/nav";
import type { Feature, Tenant, User } from "@/lib/types";

/* ==========================================================================
   The support desk.

   Read live from the platform's own settings (`GET /v1/public/settings`)
   rather than a build-time constant, so a super admin can change the desk's
   email, phone or hours from the console and every clinic sees it on its
   next load — no rebuild.
   ========================================================================== */

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
  { feature, tenant, user, supportEmail }: { feature: Feature; tenant: Tenant; user: User; supportEmail: string },
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

  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
