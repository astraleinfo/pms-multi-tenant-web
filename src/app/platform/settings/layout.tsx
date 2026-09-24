import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings — platform console" };

export default function Layout({ children }: LayoutProps<"/platform/settings">) {
  return children;
}
