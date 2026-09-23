import { Google_Sans, Ms_Madi } from "next/font/google";

/* The sign-in pages' own faces — the two screens that are a first impression
   rather than a shift. The app itself stays on Inter. Loaded once here and
   applied by each sign-in route's layout. */
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

export const loginFontVariables = `${sans.variable} ${script.variable}`;
