import type { Metadata } from "next";

export const metadata: Metadata = { title: "Set up your account" };

export default function Layout({ children }: LayoutProps<"/accept-invitation">) {
  return children;
}
