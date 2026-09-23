import type { Metadata } from "next";
import { loginFontVariables } from "@/lib/login-fonts";

export const metadata: Metadata = { title: "Platform sign-in" };

export default function Layout({ children }: LayoutProps<"/platform/login">) {
  return <div className={loginFontVariables}>{children}</div>;
}
