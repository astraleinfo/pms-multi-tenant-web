import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reset your password" };

export default function Layout({ children }: LayoutProps<"/reset-password">) {
  return children;
}
