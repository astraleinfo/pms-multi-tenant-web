import type { ClinicalType, ClinicalTypeKey, ModuleInfo } from "@/lib/types";

/* ==========================================================================
   Platform catalogues.

   These describe the product rather than any clinic: the disciplines on offer,
   the modules every clinic has, and the tests and medicines a discipline is
   offered when ordering. Labels and blurbs the UI reads on every render, so
   they change with a release, not with a request.

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
 * The PMS modules, in the order the product presents them. Every clinic has
 * every one: there is no per-clinic switch, price or trial behind any of
 * them. What varies between clinics is inside a module — the clinical type's
 * exam fields, the clinic's own fields and configuration — never whether it is
 * there. Who may use a module is a question for the person's role.
 */
export const MODULES: ModuleInfo[] = [
  { key: "patient", name: "Patients", summary: "Registration, search and the patient record." },
  { key: "appointment", name: "Appointments", summary: "Doctor calendars, booking and conflict checks." },
  { key: "queue", name: "Queue", summary: "Token issue, check-in and the waiting-room board." },
  { key: "consultation", name: "Consultation", summary: "Encounters with fields that follow your clinical type." },
  { key: "prescription", name: "Prescriptions", summary: "Write and print prescriptions, ready for the pharmacy to dispense." },
  { key: "pharmacy", name: "Pharmacy", summary: "Dispense against prescriptions and draw stock from the ledger." },
  { key: "lab", name: "Lab", summary: "Order tests, enter results, and hold them behind verification." },
  { key: "inventory", name: "Inventory", summary: "One ledger for every stock movement, with expiry watch." },
  { key: "billing", name: "Billing", summary: "Invoices composed from the visit, with part payments." },
  { key: "advanced_reports", name: "Advanced reports", summary: "Cohort breakdowns, revenue mix and clinical-type analytics." },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((f) => [f.key, f])) as Record<string, ModuleInfo>;

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
