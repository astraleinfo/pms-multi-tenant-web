import type { Metadata } from "next";
import { loginFontVariables } from "@/lib/login-fonts";

export const metadata: Metadata = { title: "Sign in" };

export default function Layout({ children }: LayoutProps<"/login">) {
  return <div className={loginFontVariables}>{children}</div>;
}
