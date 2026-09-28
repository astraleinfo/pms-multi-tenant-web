import type { Metadata } from "next";
import { FEATURE_BY_KEY } from "@/lib/data/catalog";

export async function generateMetadata(
  { params }: LayoutProps<"/modules/[key]">,
): Promise<Metadata> {
  const { key } = await params;
  return { title: FEATURE_BY_KEY[key]?.name ?? "Module" };
}

export default function Layout({ children }: LayoutProps<"/modules/[key]">) {
  return children;
}
