import { PageLoader } from "@/components/ui/loader";

/**
 * The instant state for this route: Next shows it in the shell's content area
 * while the segment loads, so the rail and topbar stay put and interactive.
 * Once the screen is up, its own data has its own loaders — see `ui/loader`.
 */
export default function Loading() {
  return <PageLoader />;
}
