import { StageLoader } from "@/components/ui/loader";

/** The console brings its own chrome, so its instant state fills the screen. */
export default function Loading() {
  return <StageLoader />;
}
