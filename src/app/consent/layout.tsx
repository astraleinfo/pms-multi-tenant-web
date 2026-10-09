import type { Metadata } from "next";

export const metadata: Metadata = { title: "Consent" };

export default function Layout({ children }: LayoutProps<"/consent">) {
  return children;
}
