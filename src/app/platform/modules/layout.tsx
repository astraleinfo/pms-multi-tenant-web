import type { Metadata } from "next";

export const metadata: Metadata = { title: "Modules & billing — platform console" };

export default function Layout({ children }: LayoutProps<"/platform/modules">) {
  return children;
}
