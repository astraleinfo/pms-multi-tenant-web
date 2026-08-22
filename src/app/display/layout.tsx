import type { Metadata } from "next";

export const metadata: Metadata = { title: "Waiting room" };

export default function Layout({ children }: LayoutProps<"/display">) {
  return children;
}
