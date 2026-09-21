import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query/provider";
import { AppProvider } from "@/lib/store/app-store";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/layout/toaster";

/**
 * One typeface for the whole application.
 *
 * Inter rather than Inter Tight: the condensed cut buys a little width back
 * in a table and charges for it in every other hour of the shift. No `weight`
 * is named, so the whole variable axis loads and weight stays a token
 * decision rather than a download.
 */
const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Astrale — Practice OS",
    template: "%s · Astrale",
  },
  description:
    "Multi-tenant patient management: queue, consultation, prescriptions, pharmacy, lab, inventory, appointments, patients and billing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EAEEF4" },
    { media: "(prefers-color-scheme: dark)", color: "#141A24" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full`}
    >
      <body className="min-h-dvh">
        <QueryProvider>
          <AppProvider>
            <AppShell>{children}</AppShell>
            <Toaster />
          </AppProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
