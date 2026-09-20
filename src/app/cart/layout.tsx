import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cart" };

export default function Layout({ children }: LayoutProps<"/cart">) {
  return children;
}
