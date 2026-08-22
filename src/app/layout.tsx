import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Inter_Tight } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query/provider";
import { AppProvider } from "@/lib/store/app-store";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/layout/toaster";

const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const sans = Inter_Tight({
  variable: "--font-inter-tight",
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
    { media: "(prefers-color-scheme: light)", color: "#EFF3F2" },
    { media: "(prefers-color-scheme: dark)", color: "#071616" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}
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
