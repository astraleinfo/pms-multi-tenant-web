import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing" };

export default function Layout({ children }: LayoutProps<"/billing">) {
  return children;
}
