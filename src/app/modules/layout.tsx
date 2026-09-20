import type { Metadata } from "next";

export const metadata: Metadata = { title: "Modules" };

export default function Layout({ children }: LayoutProps<"/modules">) {
  return children;
}
