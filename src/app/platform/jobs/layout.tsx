import type { Metadata } from "next";

export const metadata: Metadata = { title: "Background jobs — platform console" };

export default function Layout({ children }: LayoutProps<"/platform/jobs">) {
  return children;
}
