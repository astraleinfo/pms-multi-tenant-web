/* ==========================================================================
   Demo credentials.

   A demonstration affordance, and nothing more: these are the seeded accounts
   the API ships with, listed so the sign-in screens can fill the form for you.

   They are written here rather than read from the API on purpose. Real
   passwords live only as Argon2 hashes on the server, which will never hand one
   back — and the staff list of a clinic is not something an unauthenticated
   visitor is entitled to see. Delete this file and the disclosure that uses it
   when the demo data goes.
   ========================================================================== */

export interface DemoAccount {
  label: string;
  sub: string;
  email: string;
  password: string;
  disabled?: string;
}

export const DEMO_ACCOUNTS: Record<string, DemoAccount[]> = {
  northgate: [
    { label: "Priya Whitlock", sub: "Practice admin", email: "admin@northgate.clinic", password: "admin-2026" },
    { label: "Aparna Iyer", sub: "Clinician", email: "a.iyer@northgate.clinic", password: "aiyer-2026" },
    { label: "Felix Munro", sub: "Clinician", email: "f.munro@northgate.clinic", password: "fmunro-2026" },
    { label: "Front desk", sub: "Receptionist", email: "front@northgate.clinic", password: "front-2026" },
    { label: "Dispensary", sub: "Pharmacist", email: "pharmacy@northgate.clinic", password: "pharmacy-2026" },
    { label: "Imaging & lab", sub: "Lab technician", email: "lab@northgate.clinic", password: "lab-2026" },
    { label: "Owen Fairhurst", sub: "Receptionist", email: "owen@northgate.clinic", password: "owen-2026", disabled: "Invited" },
  ],
  clearview: [
    { label: "Practice admin", sub: "Practice admin", email: "admin@clearview.eye", password: "admin-2026" },
    { label: "Nadia Rahman", sub: "Clinician", email: "n.rahman@clearview.eye", password: "nrahman-2026" },
    { label: "Claire Whitfield", sub: "Clinician", email: "c.whitfield@clearview.eye", password: "cwhitfield-2026" },
    { label: "Front desk", sub: "Receptionist", email: "front@clearview.eye", password: "front-2026" },
  ],
  rowan: [
    { label: "Practice owner", sub: "Practice admin", email: "owner@rowanskin.co", password: "owner-2026" },
    { label: "Isabel Castellan", sub: "Clinician", email: "i.castellan@rowanskin.co", password: "icastellan-2026" },
    { label: "Front desk", sub: "Receptionist", email: "front@rowanskin.co", password: "front-2026" },
  ],
};

export const DEMO_PLATFORM_ACCOUNTS: DemoAccount[] = [
  { label: "Ines Okonkwo", sub: "Platform operations", email: "ines@astrale.health", password: "ines-2026" },
  { label: "Rafael Ortiz", sub: "Customer success", email: "rafael@astrale.health", password: "rafael-2026" },
];

export const demoAccountsFor = (slug: string | null | undefined): DemoAccount[] =>
  (slug && DEMO_ACCOUNTS[slug]) || [];
