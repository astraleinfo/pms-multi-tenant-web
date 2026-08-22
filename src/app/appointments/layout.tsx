import type { Metadata } from "next";

export const metadata: Metadata = { title: "Appointments" };

export default function Layout({ children }: LayoutProps<"/appointments">) {
  return children;
}
