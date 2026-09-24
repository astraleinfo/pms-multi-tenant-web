import type { Metadata, Viewport } from "next";
import { Google_Sans } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query/provider";
import { AppProvider } from "@/lib/store/app-store";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/layout/toaster";
import { NavigationProgress } from "@/lib/navigation";

/**
 * One typeface for the whole application — the same Google Sans the sign-in
 * pages are set in, so the step from the login into the clinic is one voice
 * rather than two.
 *
 * Its open, round forms read calmer at a glance than a grotesque, which is
 * the point on a screen somebody looks at between patients. No `weight` is
 * named, so the variable axis loads and weight stays a token decision.
 *
 * There is no monospace face any more. Times, tokens and record numbers were
 * set in one, and a screen full of typewriter figures reads like a log file;
 * they now use this face with tabular figures, which keeps columns aligned
 * without changing the voice mid-line.
 */
const sans = Google_Sans({
  variable: "--font-app",
  subsets: ["latin"],
  display: "swap",
  /* Next has no metrics for this face, so the fallback is ours — see the
     `@font-face` for "Google Sans Fallback" in globals.css. */
  adjustFontFallback: false,
  fallback: ["Google Sans Fallback", "ui-sans-serif", "system-ui", "sans-serif"],
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
      className={`${sans.variable} h-full`}
    >
      <body className="min-h-dvh">
        <NavigationProgress />
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
