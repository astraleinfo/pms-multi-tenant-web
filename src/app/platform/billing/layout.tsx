import type { Metadata } from "next";

export const metadata: Metadata = { title: "Subscription bills — platform console" };

export default function Layout({ children }: LayoutProps<"/platform/billing">) {
  return children;
}
