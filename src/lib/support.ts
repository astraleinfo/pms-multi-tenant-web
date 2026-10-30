/* ==========================================================================
   The support desk.

   Read live from the platform's own settings (`GET /v1/public/settings`)
   rather than a build-time constant, so a super admin can change the desk's
   email, phone or hours from the console and every clinic sees it on its
   next load — no rebuild.
   ========================================================================== */

/** `+91 80 4718 2200` → `+918047182200`, which is what a phone will dial.
 *  A bare ten-digit Indian mobile number (`7305961254`) gets its `+91`, so
 *  it dials the same from a phone set to another country. */
export const telHref = (phone: string) => {
  const dialable = phone.replace(/[^\d+]/g, "");
  return `tel:${/^[6-9]\d{9}$/.test(dialable) ? `+91${dialable}` : dialable}`;
};
