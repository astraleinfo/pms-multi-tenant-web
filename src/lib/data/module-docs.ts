import type { FeatureKey, Role } from "@/lib/types";

/* ==========================================================================
   The documentation a locked module's page carries.

   Written for the person deciding whether to ask for it — usually a practice
   admin — so it answers their questions in their order: what exactly do we
   get, who on the team will use it, what do we do on day one, and the things
   everybody asks support anyway.
   ========================================================================== */

export interface ModuleDocs {
  /** the concrete capabilities, as a checklist */
  included: string[];
  /** who works in it, and what for */
  roles: { role: Role; does: string }[];
  /** the first things to do once it is switched on */
  setup: string[];
  faq: { q: string; a: string }[];
}

export const MODULE_DOCS: Partial<Record<FeatureKey, ModuleDocs>> = {
  pharmacy: {
    included: [
      "A counter queue built from the prescriptions your clinicians sign",
      "Allergy alerts on the dispensing screen, not a click away",
      "Part-dispensing, with the remainder kept on the queue",
      "Batch and expiry chosen at hand-over, first-to-expire suggested",
      "Stock drawn from the inventory ledger in the same transaction",
      "Charges raised automatically, settled at the window or billed later",
    ],
    roles: [
      { role: "pharmacist", does: "Works the counter: dispenses, part-dispenses, takes payment." },
      { role: "doctor", does: "Sees what was actually handed over against what they prescribed." },
      { role: "tenant_admin", does: "Reads dispensing value and what is still waiting." },
    ],
    setup: [
      "Add a pharmacist account under Settings → Team.",
      "Check your medicine lines and prices in Inventory (Pharmacy draws from them).",
      "Dispense the first prescription — the queue fills itself from signed consultations.",
    ],
    faq: [
      { q: "Do we need Inventory as well?", a: "It is strongly recommended: dispensing draws stock from the inventory ledger, which is what keeps the shelf and the screen in agreement." },
      { q: "Can a patient pay at the pharmacy only?", a: "Yes. The pharmacy is its own counter with its own balance — paying for medicine is never mixed up with the consultation bill." },
      { q: "What happens to prescriptions written before we switched it on?", a: "Every prescription still waiting appears on the counter queue the moment the module is on." },
    ],
  },
  lab: {
    included: [
      "Tests ordered from inside the consultation, from your discipline's catalogue",
      "A bench view of orders by status: ordered, in progress, resulted",
      "Result entry per analyte, with high and low flags",
      "Scans, PDFs and machine printouts attached to the order itself",
      "Verification before release — a clinician never reads an unchecked result",
      "Lab charges priced per test from your own tariff",
    ],
    roles: [
      { role: "doctor", does: "Orders tests during the visit and reads verified results." },
      { role: "lab_tech", does: "Works the bench, enters results, attaches reports, verifies." },
      { role: "receptionist", does: "Bills lab work at the lab counter." },
    ],
    setup: [
      "Add a lab technician under Settings → Team.",
      "Set your test prices under Pricing → Lab (or import the catalogue at one price).",
      "Order a test from a consultation and follow it to verification.",
    ],
    faq: [
      { q: "Where are attached reports stored?", a: "With the order, inside your clinic's own records — never reachable from another clinic, and never by a bare link." },
      { q: "Can a result be changed after verification?", a: "No. Verification is what releases a result to the clinician, and it closes the order to further changes." },
      { q: "Do we get tests for our speciality?", a: "Yes — the catalogue is filtered to your discipline, so a dental clinic sees radiographs and a skin clinic sees patch tests." },
    ],
  },
  inventory: {
    included: [
      "One ledger for every stock movement — deliveries, dispensing, returns, adjustments, expiry write-offs",
      "Stock on hand computed from the ledger, never typed in",
      "Batch and expiry recorded at delivery",
      "Reorder levels per line, with alerts when you fall below",
      "An expiry window you choose, with a watch list",
      "Selling price from cost plus margin, MRP less discount, or a fixed price",
    ],
    roles: [
      { role: "pharmacist", does: "Receives deliveries, adjusts stock, watches expiry." },
      { role: "tenant_admin", does: "Sets reorder levels, pricing rules and the expiry window." },
    ],
    setup: [
      "Open your stock lines, with reorder levels and how each is priced.",
      "Record opening stock as a delivery, with batch and expiry.",
      "Set the expiry alert window under Settings → Configuration.",
    ],
    faq: [
      { q: "Can we correct a stock count?", a: "Yes, with an adjustment — it is a movement in the ledger with a reason, so the history stays honest." },
      { q: "Does it work without Pharmacy?", a: "Yes. Clinics use it for consumables too; Pharmacy simply draws from the same ledger when it is on." },
      { q: "How are expired batches handled?", a: "They are flagged ahead of time, and written off with a movement when they leave the shelf." },
    ],
  },
  billing: {
    included: [
      "Invoices composed from what the visit actually did",
      "Warnings when a line has already been billed elsewhere",
      "Clinic, lab and pharmacy counters, each with its own balance",
      "Part payments and mixed methods — cash, card, UPI, insurance",
      "A patient account across all three counters",
      "Printable PDF invoices on your letterhead",
    ],
    roles: [
      { role: "receptionist", does: "Composes invoices, takes payments, reads balances." },
      { role: "tenant_admin", does: "Sets the tariff, tax and payment terms; reads revenue." },
      { role: "doctor", does: "Sees what a visit was billed for." },
    ],
    setup: [
      "Check your consultation and procedure prices under Pricing.",
      "Set tax, payment terms and your invoice prefix under Settings → Configuration.",
      "Compose the first invoice from a signed consultation.",
    ],
    faq: [
      { q: "Can we bill without a consultation?", a: "Yes — a manual invoice can be raised for any patient, at any counter." },
      { q: "What if a patient pays part now?", a: "Record the part payment; the invoice stays open with its balance until it is settled." },
      { q: "Can an invoice be deleted?", a: "No, it can be voided. A voided invoice keeps its number and drops out of every revenue figure." },
    ],
  },
  advanced_reports: {
    included: [
      "Trailing windows of a week, a fortnight or a month",
      "Per-clinician encounters, prescriptions and revenue",
      "Revenue mix across the three counters",
      "Age and sex cohorts of your patient base",
      "Clinical panels for your discipline",
      "The whole report as a PDF, for owners and meetings",
    ],
    roles: [
      { role: "tenant_admin", does: "Reads the business: who, what, and where the money comes from." },
      { role: "doctor", does: "Reads their own workload and case mix." },
    ],
    setup: [
      "Open Reports — the extra panels appear the moment the module is on.",
      "Pick a window and export the PDF for your next practice meeting.",
    ],
    faq: [
      { q: "Does it include history from before we switched it on?", a: "Yes. It reads the records you already have; nothing needs collecting first." },
      { q: "Do the figures match the rest of the app?", a: "Always — every panel is computed from the same records the ledgers use." },
    ],
  },
};
