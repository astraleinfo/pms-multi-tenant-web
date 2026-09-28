import type { Metadata } from "next";

export const metadata: Metadata = { title: "Clinic — platform console" };

export default function Layout({ children }: LayoutProps<"/platform/tenants/[id]">) {
  return children;
}
