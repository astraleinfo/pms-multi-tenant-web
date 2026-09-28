import type { CatalogFeature, ClinicalType, ClinicalTypeKey, Feature, FeatureCopy } from "@/lib/types";

/* ==========================================================================
   Platform catalogues.

   These describe the product rather than any clinic: the disciplines on offer,
   the modules that can be bought, and the tests and medicines a discipline is
   offered when ordering. The API serves the same rows at /v1/catalog/*; they
   are kept here because they are presentation constants — labels and blurbs
   the UI reads on every render — and they change with a release, not with a
   request.

   Module *prices* are the exception, and are not here: a super admin sets them
   in the console, so they are fetched and joined on with `withPrices`.

   What is *not* here any more: field definitions. The effective schema for a
   clinic is resolved on the server (§3.3) and fetched with `useSchema`, because
   it depends on the tenant's own custom fields.
   ========================================================================== */

export const CLINICAL_TYPES: ClinicalType[] = [
  {
    key: "dental",
    label: "Dental",
    examLabel: "Tooth chart & oral exam",
    blurb: "Charting by FDI tooth number, periodontal scoring, and procedure planning.",
    complaintExample: "Cold sensitivity, upper left quadrant",
  },
  {
    key: "ophthalmology",
    label: "Ophthalmology",
    examLabel: "Refraction & anterior segment",
    blurb: "Visual acuity, refraction per eye, intraocular pressure and fundus notes.",
    complaintExample: "Progressive blurring, right worse than left",
  },
  {
    key: "dermatology",
    label: "Dermatology",
    examLabel: "Lesion map & skin assessment",
    blurb: "Body-site lesion mapping, Fitzpatrick typing, and phototherapy tracking.",
    complaintExample: "Itchy flare across both elbows",
  },
];

/**
 * The module catalogue — what every module is, and how it is explained to a
 * clinic that does not have it yet. What it costs comes from the API.
 *
 * The last four fields on each row are what the module page renders behind a
 * padlock (§3.2). A locked module is not a dead end and not a redirect into
 * Settings: it is a page that says what the module does, shows a walkthrough,
 * prints the price, and offers the support desk — because the switch itself is
 * the platform's, and nobody inside a clinic can throw it.
 */
export const FEATURES: FeatureCopy[] = [
  {
    key: "patient",
    name: "Patients",
    is_core: true,
    summary: "Registration, search and the patient record.",
    unlocks: ["Patients"],
    overview:
      "The register every other module points at. One row per person, with an MRN the clinic chooses the shape of, and a record that gathers everything anybody writes about them.",
    how_it_works: [
      { title: "Register once", body: "Reception fills the form your clinic's schema builds — common fields, then the ones your discipline adds, then your own." },
      { title: "Find them again", body: "Search runs in the database on name, MRN and phone, so a register of fifty thousand answers as fast as one of fifty." },
      { title: "Read the whole history", body: "Visits, prescriptions, orders and invoices appear against the patient as they happen. Nothing is copied to get there." },
    ],
    demo_chapters: [
      "Registering a walk-in at the desk",
      "Searching by phone number and MRN",
      "Reading a patient's history end to end",
    ],
    pricing_note: "Core. It is in every plan and cannot be switched off.",
  },
  {
    key: "appointment",
    name: "Appointments",
    is_core: true,
    summary: "Doctor calendars, booking and conflict checks.",
    unlocks: ["Appointments"],
    overview:
      "A calendar per clinician, inside the clinic's own working day. Booking is checked against what is already there, so two patients cannot hold the same chair.",
    how_it_works: [
      { title: "Set the day", body: "Opening time, closing time and slot length are the clinic's settings; the grid follows them." },
      { title: "Book against a doctor", body: "The server refuses an overlap rather than warning about one, so the diary and the room agree." },
      { title: "Arrive into the queue", body: "Checking a booking in issues the token — the appointment and the waiting room are the same day, not two." },
    ],
    demo_chapters: [
      "Booking a slot and hitting a conflict",
      "Rescheduling without losing the trail",
      "Check-in, and the token it issues",
    ],
    pricing_note: "Core. It is in every plan and cannot be switched off.",
  },
  {
    key: "queue",
    name: "Queue",
    is_core: true,
    summary: "Token issue, check-in and the waiting-room board.",
    unlocks: ["Queue", "Waiting room display"],
    overview:
      "The day as it actually runs: who is waiting, who is in, who is done. Tokens are issued per clinic per day, and every move is a transition the server will refuse if it makes no sense.",
    how_it_works: [
      { title: "Issue a token", body: "From a booking at check-in, or straight to a walk-in at the desk." },
      { title: "Work the board", body: "Called, in consultation, completed — the board is the same one the clinician and the desk are both looking at." },
      { title: "Show the room", body: "The waiting-room screen follows the board live, with no staff chrome on it." },
    ],
    demo_chapters: [
      "Issuing a token to a walk-in",
      "Calling the next patient",
      "Putting the waiting-room screen on a display",
    ],
    pricing_note: "Core. It is in every plan and cannot be switched off.",
  },
  {
    key: "consultation",
    name: "Consultation",
    is_core: true,
    summary: "Encounters with fields that follow your clinical type.",
    unlocks: ["Consultation"],
    overview:
      "The encounter, written in your discipline's own terms — a tooth chart for a dental clinic, refraction for an eye clinic — on top of one common record.",
    how_it_works: [
      { title: "Open from the queue", body: "The clinician takes the next token; the patient, the complaint and the history come with it." },
      { title: "Write in your own fields", body: "The form is built from your effective schema, so what you record is what your discipline records." },
      { title: "Sign it", body: "Signing closes the token, releases the record, and hands whatever it created to prescriptions, lab and billing." },
    ],
    demo_chapters: [
      "Taking the next patient from the board",
      "Filling a clinical exam that fits the discipline",
      "Signing, and what it sets in motion",
    ],
    pricing_note: "Core. It is in every plan and cannot be switched off.",
  },
  {
    key: "prescription",
    name: "Prescriptions",
    is_core: true,
    summary: "Write and print prescriptions. Works with or without a pharmacy.",
    unlocks: ["Prescriptions"],
    overview:
      "What was prescribed, to whom, by whom, and whether anybody has handed it over. A clinic with no pharmacy still writes and prints them; one with a pharmacy dispenses against the same rows.",
    how_it_works: [
      { title: "Write it in the encounter", body: "Medicines, doses and durations are part of the consultation, not a separate errand afterwards." },
      { title: "Print or hand over", body: "Print for the patient to take elsewhere, or leave it pending for your own counter." },
      { title: "Watch what is outstanding", body: "Anything not yet dispensed stays visible, so nobody walks out with a piece of paper nobody acted on." },
    ],
    demo_chapters: [
      "Writing a prescription inside a consultation",
      "Printing for a patient going elsewhere",
      "What the pharmacy counter sees next",
    ],
    pricing_note: "Core. It is in every plan and cannot be switched off.",
  },
  {
    key: "pharmacy",
    name: "Pharmacy",
    is_core: false,
    summary: "Dispense against prescriptions and draw stock from the ledger.",
    unlocks: ["Pharmacy"],
    overview:
      "Your own counter, reading the prescriptions your clinicians have already written. Handing medicine over is one action that dispenses the line, moves the stock and raises the charge — there is no second list to keep in step.",
    how_it_works: [
      { title: "The counter fills itself", body: "Every prescription still waiting appears here, oldest first, with the patient's allergies on the same screen. Nothing is copied into a pharmacy table." },
      { title: "Hand it over", body: "Pick the batch, enter the quantity. The dispense and the stock movement are written in one transaction, so the ledger and the prescription cannot disagree." },
      { title: "Take the money", body: "What was handed over becomes a charge at the pharmacy counter — settled there, or put on the patient's account for the desk." },
    ],
    demo_chapters: [
      "The counter queue, and a part-dispense",
      "Batch and expiry at the point of hand-over",
      "Settling at the window, or billing it later",
    ],
    pricing_note: "One price for the clinic — every pharmacist you put on it is included.",
  },
  {
    key: "lab",
    name: "Lab",
    is_core: false,
    summary: "Order tests, enter results, and hold them behind verification.",
    unlocks: ["Lab"],
    overview:
      "Tests ordered from the consultation, worked at the bench, and released into the patient record only when somebody has verified them. A result nobody has checked is never a result a clinician reads.",
    how_it_works: [
      { title: "Order from the encounter", body: "Pick from the catalogue your discipline uses; the order carries the patient and the clinician who asked for it." },
      { title: "Work the bench", body: "Start an order, enter analytes, attach the scan or the machine's printout against the order itself." },
      { title: "Verify to release", body: "Verification is the transition that puts the result in front of the clinician, and it closes the order to new paper." },
    ],
    demo_chapters: [
      "Ordering tests inside a consultation",
      "Entering results and filing a report",
      "Verifying, and what the clinician then sees",
    ],
    pricing_note: "One price for the clinic — the bench, the orders and the file store are all in it.",
  },
  {
    key: "inventory",
    name: "Inventory",
    is_core: false,
    summary: "One ledger for every stock movement, with expiry watch.",
    unlocks: ["Inventory"],
    overview:
      "Stock on hand is the sum of the ledger, never a number somebody typed. Deliveries, dispensing, adjustments and write-offs are all movements in the same book, so what the shelf holds and what the screen says are the same claim.",
    how_it_works: [
      { title: "Open a line", body: "SKU, form, strength, reorder level and how it is priced — cost plus margin, or a price you set." },
      { title: "Book the delivery", body: "Quantity, batch and expiry go in with the supplier's figures in front of you, and the selling price follows the pricing mode." },
      { title: "Watch it move", body: "Every dispense draws from the ledger. Anything under its reorder level, or inside your expiry window, says so." },
    ],
    demo_chapters: [
      "Opening a stock line and pricing it",
      "Receiving a delivery with batch and expiry",
      "Reorder and expiry alerts, and the tenant's own threshold",
    ],
    pricing_note: "One price for the clinic, whatever the size of the shelf.",
  },
  {
    key: "billing",
    name: "Billing",
    is_core: false,
    summary: "Invoices composed from the visit, with part payments.",
    unlocks: ["Billing"],
    overview:
      "The invoice is composed from what the visit actually did — the consultation, the tests ordered, the medicine handed over — priced from your own tariff. Three counters keep their own books: clinic, lab and pharmacy.",
    how_it_works: [
      { title: "Compose from the visit", body: "The composer suggests the lines the encounter earned, and tells you which of them somebody has already billed." },
      { title: "Issue and take payment", body: "Part payments, mixed methods, and a running balance per counter. Paying for medicine at the window is not paying for a scan." },
      { title: "Read the account", body: "One patient, three counters: what is outstanding, and what nobody has billed yet." },
    ],
    demo_chapters: [
      "Composing an invoice from a signed consultation",
      "Taking a part payment at the counter",
      "A patient account across clinic, lab and pharmacy",
    ],
    pricing_note: "One price for the clinic — invoices, counters and payment methods included.",
  },
  {
    key: "advanced_reports",
    name: "Advanced reports",
    is_core: false,
    summary: "Cohort breakdowns, revenue mix and clinical-type analytics.",
    unlocks: ["Extra dashboard panels"],
    overview:
      "The standard dashboard answers what happened today. This answers what has been happening — by clinician, by cohort, by where the money comes from — from the same transactional tables, with nothing recomputed by hand.",
    how_it_works: [
      { title: "Pick a window", body: "Any range the clinic has data for; every figure on the page moves with it." },
      { title: "Break it down", body: "Per clinician, per cohort, per counter — encounters, prescriptions and revenue side by side." },
      { title: "Trust the arithmetic", body: "Every panel is derived from the same rows the ledgers use, so a total here is the total there." },
    ],
    demo_chapters: [
      "The clinician breakdown over a quarter",
      "Revenue mix across the three counters",
      "Cohort panels for your discipline",
    ],
    pricing_note: "One price for the clinic, and it reads history you already have.",
  },
];

export const FEATURE_BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f])) as Record<string, FeatureCopy>;

/**
 * Join the live prices onto the copy.
 *
 * The copy decides which modules exist on screen and in what order; the API
 * decides what each costs. A module the server has not priced reads as zero —
 * it cannot happen with a seeded catalogue, and zero is the honest answer for
 * "nobody has set a price".
 */
export function withPrices(rows: readonly CatalogFeature[] | undefined): Feature[] {
  const prices = new Map((rows ?? []).map((r) => [r.key, Number(r.price_monthly) || 0]));
  return FEATURES.map((f) => ({ ...f, price_monthly: f.is_core ? 0 : prices.get(f.key) ?? 0 }));
}

/* ==========================================================================
   Order catalogues. Tests and common medicines offered when writing an
   encounter — the clinical type decides which panel is shown first.
   ========================================================================== */

export interface LabTest {
  code: string;
  name: string;
  panel: string;
  clinical_types?: ClinicalTypeKey[];
}

export const LAB_CATALOG: LabTest[] = [
  { code: "FBC", name: "Full blood count", panel: "Haematology" },
  { code: "HBA1C", name: "Glycated haemoglobin", panel: "Biochemistry" },
  { code: "CRP", name: "C-reactive protein", panel: "Biochemistry" },
  { code: "CULT", name: "Swab — culture and sensitivity", panel: "Microbiology" },

  { code: "OPG", name: "Orthopantomogram", panel: "Imaging", clinical_types: ["dental"] },
  { code: "PA", name: "Periapical radiograph", panel: "Imaging", clinical_types: ["dental"] },
  { code: "BW", name: "Bitewing radiographs", panel: "Imaging", clinical_types: ["dental"] },
  { code: "CBCT", name: "Cone beam CT", panel: "Imaging", clinical_types: ["dental"] },

  { code: "OCT", name: "Optical coherence tomography", panel: "Imaging", clinical_types: ["ophthalmology"] },
  { code: "VF", name: "Visual field test", panel: "Functional", clinical_types: ["ophthalmology"] },
  { code: "BIO", name: "Biometry", panel: "Functional", clinical_types: ["ophthalmology"] },
  { code: "CORNEA", name: "Corneal topography", panel: "Imaging", clinical_types: ["ophthalmology"] },

  { code: "PATCH", name: "Patch test — standard series", panel: "Allergy", clinical_types: ["dermatology"] },
  { code: "MYC", name: "Skin scraping — mycology", panel: "Microbiology", clinical_types: ["dermatology"] },
  { code: "BIOP", name: "Punch biopsy — histology", panel: "Histopathology", clinical_types: ["dermatology"] },
  { code: "DERM", name: "Dermoscopy series", panel: "Imaging", clinical_types: ["dermatology"] },
];

export function labCatalogFor(clinicalType: ClinicalTypeKey) {
  return LAB_CATALOG.filter((t) => !t.clinical_types || t.clinical_types.includes(clinicalType));
}

export interface MedicineSuggestion {
  medicine: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration: string;
  clinical_types?: ClinicalTypeKey[];
}

export const MEDICINE_SUGGESTIONS: MedicineSuggestion[] = [
  { medicine: "Amoxicillin", strength: "500 mg", dosage: "1 capsule", frequency: "Three times daily", duration: "5 days" },
  { medicine: "Metronidazole", strength: "400 mg", dosage: "1 tablet", frequency: "Three times daily", duration: "5 days" },
  { medicine: "Ibuprofen", strength: "400 mg", dosage: "1 tablet", frequency: "Three times daily", duration: "3 days" },
  { medicine: "Paracetamol", strength: "650 mg", dosage: "1 tablet", frequency: "As needed, max 4 daily", duration: "3 days" },
  { medicine: "Chlorhexidine mouthwash", strength: "0.2%", dosage: "10 ml rinse", frequency: "Twice daily", duration: "7 days", clinical_types: ["dental"] },
  { medicine: "Duraphat fluoride toothpaste", strength: "5000 ppm", dosage: "Pea-sized", frequency: "Once at night", duration: "3 months", clinical_types: ["dental"] },
  { medicine: "Fusidic acid eye drops", strength: "1%", dosage: "1 drop", frequency: "Twice daily", duration: "7 days", clinical_types: ["ophthalmology"] },
  { medicine: "Latanoprost eye drops", strength: "50 µg/ml", dosage: "1 drop each eye", frequency: "At night", duration: "3 months", clinical_types: ["ophthalmology"] },
  { medicine: "Carbomer gel", strength: "0.2%", dosage: "1 drop", frequency: "Four times daily", duration: "1 month", clinical_types: ["ophthalmology"] },
  { medicine: "Mometasone furoate ointment", strength: "0.1%", dosage: "Thin layer", frequency: "Once daily", duration: "14 days", clinical_types: ["dermatology"] },
  { medicine: "Emollient cream", strength: "500 g", dosage: "Liberally", frequency: "Three times daily", duration: "Ongoing", clinical_types: ["dermatology"] },
  { medicine: "Ketoconazole shampoo", strength: "2%", dosage: "Apply, leave 5 min", frequency: "Twice weekly", duration: "4 weeks", clinical_types: ["dermatology"] },
];

export function medicinesFor(clinicalType: ClinicalTypeKey) {
  return MEDICINE_SUGGESTIONS.filter((m) => !m.clinical_types || m.clinical_types.includes(clinicalType));
}
