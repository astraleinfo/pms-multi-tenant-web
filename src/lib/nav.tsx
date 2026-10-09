import * as React from "react";
import type { Role } from "@/lib/types";
import {
  IconBox, IconCalendar, IconCard, IconChart, IconFlask, IconMonitor, IconPhone, IconPill, IconPulse,
  IconQueue, IconReceipt, IconRx, IconSettings, IconStethoscope, IconUsers,
} from "@/components/ui/icons";

/**
 * Every clinic sees every module here. What decides whether a person sees an
 * item is their role — `roles` — never which clinic they are in.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** RBAC (§4, step 3). tenant_admin always passes. */
  roles?: Role[];
  /** badge counter key resolved by the rail */
  counter?: "queue" | "pendingRx" | "labPending" | "unpaid";
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
      { href: "/queue", label: "Queue", icon: IconQueue, counter: "queue", description: "Tokens, check-in and the waiting room." },
      { href: "/appointments", label: "Appointments", icon: IconCalendar, roles: ["tenant_admin", "receptionist", "doctor"], description: "Doctor calendars and booking." },
      { href: "/follow-ups", label: "Follow-ups", icon: IconPhone, roles: ["tenant_admin", "receptionist", "doctor"], description: "Ring patients to confirm, move or release upcoming visits." },
    ],
  },
  {
    label: "Clinical",
    items: [
      { href: "/patients", label: "Patients", icon: IconUsers, description: "The record, the history, the registration form." },
      { href: "/consultations", label: "Consultations", icon: IconStethoscope, roles: ["tenant_admin", "doctor"], description: "Encounters, with fields that follow your clinical type." },
      { href: "/prescriptions", label: "Prescriptions", icon: IconRx, counter: "pendingRx", description: "Everything written, dispensed or not." },
      { href: "/lab", label: "Lab", icon: IconFlask, roles: ["tenant_admin", "doctor", "lab_tech"], counter: "labPending", description: "Orders, results and verification." },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/pharmacy", label: "Pharmacy", icon: IconPill, roles: ["tenant_admin", "pharmacist", "doctor"], description: "Dispense against prescriptions." },
      { href: "/inventory", label: "Inventory", icon: IconBox, roles: ["tenant_admin", "pharmacist"], description: "One ledger for every stock movement." },
      { href: "/billing", label: "Billing", icon: IconReceipt, roles: ["tenant_admin", "receptionist"], counter: "unpaid", description: "Invoices composed from the visit." },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/reports", label: "Reports", icon: IconChart, roles: ["tenant_admin", "doctor"], description: "What the transactional tables add up to." },
      { href: "/pricing", label: "Pricing", icon: IconCard, roles: ["tenant_admin"], description: "What the clinic charges — consultations, procedures and each scan." },
      { href: "/display", label: "Waiting room", icon: IconMonitor, description: "The screen patients look at." },
      { href: "/settings", label: "Settings", icon: IconSettings, roles: ["tenant_admin"], description: "Configuration, fields, team and tenant profile." },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items);

export function navItemFor(pathname: string) {
  return ALL_NAV_ITEMS
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** RBAC check — the frontend copy of §4 step 3. The server guard is the real one. */
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
