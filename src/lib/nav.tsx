import * as React from "react";
import type { FeatureKey, Role } from "@/lib/types";
import {
  IconBox, IconCalendar, IconCard, IconChart, IconFlask, IconMonitor, IconMortar, IconPulse,
  IconQueue, IconReceipt, IconRx, IconSettings, IconStethoscope, IconUsers,
} from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** entitlement required (§3.2). Core features are always active. */
  feature?: FeatureKey;
  /** RBAC (§4, step 4). tenant_admin always passes. */
  roles?: Role[];
  /** badge counter key resolved by the rail */
  counter?: "queue" | "pendingRx" | "labPending" | "unpaid" | "cart";
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Today",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: IconPulse, description: "Live picture of the clinic day." },
      { href: "/queue", label: "Queue", icon: IconQueue, feature: "queue", counter: "queue", description: "Tokens, check-in and the waiting room." },
      { href: "/appointments", label: "Appointments", icon: IconCalendar, feature: "appointment", roles: ["tenant_admin", "receptionist", "doctor"], description: "Doctor calendars and booking." },
    ],
  },
  {
    label: "Clinical",
    items: [
      { href: "/patients", label: "Patients", icon: IconUsers, feature: "patient", description: "The record, the history, the registration form." },
      { href: "/consultations", label: "Consultations", icon: IconStethoscope, feature: "consultation", roles: ["tenant_admin", "doctor"], description: "Encounters, with fields that follow your clinical type." },
      { href: "/prescriptions", label: "Prescriptions", icon: IconRx, feature: "prescription", counter: "pendingRx", description: "Everything written, dispensed or not." },
      { href: "/lab", label: "Lab", icon: IconFlask, feature: "lab", roles: ["tenant_admin", "doctor", "lab_tech"], counter: "labPending", description: "Orders, results and verification." },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/pharmacy", label: "Pharmacy", icon: IconMortar, feature: "pharmacy", roles: ["tenant_admin", "pharmacist", "doctor"], description: "Dispense against prescriptions." },
      { href: "/inventory", label: "Inventory", icon: IconBox, feature: "inventory", roles: ["tenant_admin", "pharmacist"], description: "One ledger for every stock movement." },
      { href: "/billing", label: "Billing", icon: IconReceipt, feature: "billing", roles: ["tenant_admin", "receptionist"], counter: "unpaid", description: "Invoices composed from the visit." },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/reports", label: "Reports", icon: IconChart, roles: ["tenant_admin", "doctor"], description: "What the transactional tables add up to." },
      { href: "/pricing", label: "Pricing", icon: IconCard, roles: ["tenant_admin"], description: "What the clinic charges — consultations, procedures and each scan." },
      { href: "/modules", label: "Modules", icon: IconBox, roles: ["tenant_admin"], counter: "cart", description: "What this clinic can switch on, what each costs, and the cart." },
      { href: "/display", label: "Waiting room", icon: IconMonitor, feature: "queue", description: "The screen patients look at." },
      { href: "/settings", label: "Settings", icon: IconSettings, roles: ["tenant_admin"], description: "Features, fields, team and tenant profile." },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items);

export function navItemFor(pathname: string) {
  return ALL_NAV_ITEMS
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** RBAC check — the frontend copy of §4 step 4. The server guard is the real one. */
export function roleAllows(item: NavItem, role: Role) {
  return !item.roles || role === "tenant_admin" || item.roles.includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  tenant_admin: "Practice admin",
  receptionist: "Reception",
  doctor: "Clinician",
  pharmacist: "Pharmacist",
  lab_tech: "Lab technician",
};
