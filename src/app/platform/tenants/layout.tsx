import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tenants — platform console" };

export default function Layout({ children }: LayoutProps<"/platform/tenants">) {
  return children;
}
