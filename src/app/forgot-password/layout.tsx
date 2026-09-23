import type { Metadata } from "next";
import { loginFontVariables } from "@/lib/login-fonts";

export const metadata: Metadata = { title: "Forgotten password" };

export default function Layout({ children }: LayoutProps<"/forgot-password">) {
  return <div className={loginFontVariables}>{children}</div>;
}
