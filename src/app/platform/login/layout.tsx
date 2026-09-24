import type { Metadata } from "next";

export const metadata: Metadata = { title: "Platform sign-in" };

export default function Layout({ children }: LayoutProps<"/platform/login">) {
  return children;
}
