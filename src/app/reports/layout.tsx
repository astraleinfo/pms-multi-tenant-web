import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

export default function Layout({ children }: LayoutProps<"/reports">) {
  return children;
}
