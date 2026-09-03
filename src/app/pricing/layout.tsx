import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pricing" };

export default function Layout({ children }: LayoutProps<"/pricing">) {
  return children;
}
