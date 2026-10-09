/* ==========================================================================
   The support desk.

   Read live from the platform's own settings (`GET /v1/public/settings`)
   rather than a build-time constant, so a super admin can change the desk's
   email, phone or hours from the console and every clinic sees it on its
   next load — no rebuild.
   ========================================================================== */

/** `+91 80 4718 2200` → `+918047182200`, which is what a phone will dial. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
