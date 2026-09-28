import { StageLoader } from "@/components/ui/loader";

/**
 * The instant state for this route. It stands alone, with no rail or topbar
 * around it, so its loader holds the whole window rather than a content area.
 */
export default function Loading() {
  return <StageLoader />;
}
