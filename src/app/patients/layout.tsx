import type { Metadata } from "next";

export const metadata: Metadata = { title: "Patients" };

export default function Layout({ children }: LayoutProps<"/patients">) {
  return children;
}
