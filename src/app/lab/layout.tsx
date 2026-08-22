import type { Metadata } from "next";

export const metadata: Metadata = { title: "Lab" };

export default function Layout({ children }: LayoutProps<"/lab">) {
  return children;
}
