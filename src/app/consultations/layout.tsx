import type { Metadata } from "next";

export const metadata: Metadata = { title: "Consultations" };

export default function Layout({ children }: LayoutProps<"/consultations">) {
  return children;
}
