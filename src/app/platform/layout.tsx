import type { Metadata } from "next";

export const metadata: Metadata = { title: "Platform console" };

export default function Layout({ children }: LayoutProps<"/platform">) {
  return children;
}
