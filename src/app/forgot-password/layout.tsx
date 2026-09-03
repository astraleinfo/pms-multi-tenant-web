import type { Metadata } from "next";

export const metadata: Metadata = { title: "Forgotten password" };

export default function Layout({ children }: LayoutProps<"/forgot-password">) {
  return children;
}
