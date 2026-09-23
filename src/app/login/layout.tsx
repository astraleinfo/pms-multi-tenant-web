import type { Metadata } from "next";
import { Google_Sans, Ms_Madi } from "next/font/google";

export const metadata: Metadata = { title: "Sign in" };

/* The sign-in page's own faces — the one screen that is a first impression
   rather than a shift. The app itself stays on Inter. */
const sans = Google_Sans({
  variable: "--font-login",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

/* the hand-written line on the left; one phrase, never body copy */
const script = Ms_Madi({
  variable: "--font-login-script",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export default function Layout({ children }: LayoutProps<"/login">) {
  return <div className={`${sans.variable} ${script.variable}`}>{children}</div>;
}
