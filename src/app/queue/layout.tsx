import type { Metadata } from "next";

export const metadata: Metadata = { title: "Queue" };

export default function Layout({ children }: LayoutProps<"/queue">) {
  return children;
}
