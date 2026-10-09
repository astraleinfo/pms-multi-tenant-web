import type { Metadata } from "next";
import { ConsoleChrome } from "@/components/platform/chrome";

export const metadata: Metadata = { title: "Platform console" };

/* the frame lives here, not in each page, so it survives moving between sections */
export default function Layout({ children }: LayoutProps<"/platform">) {
  return <ConsoleChrome>{children}</ConsoleChrome>;
}
