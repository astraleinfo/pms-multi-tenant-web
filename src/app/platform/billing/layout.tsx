import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing & revenue — platform console" };

export default function Layout({ children }: LayoutProps<"/platform/billing">) {
  return children;
}
