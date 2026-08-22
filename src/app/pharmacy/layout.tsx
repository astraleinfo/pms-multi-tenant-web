import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pharmacy" };

export default function Layout({ children }: LayoutProps<"/pharmacy">) {
  return children;
}
