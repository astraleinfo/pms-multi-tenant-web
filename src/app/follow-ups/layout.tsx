import type { Metadata } from "next";

export const metadata: Metadata = { title: "Follow-ups" };

export default function Layout({ children }: LayoutProps<"/follow-ups">) {
  return children;
}
