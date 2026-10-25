import type { LabOrderStatus } from "@/lib/types";

/** What the bench may do with one order, for the person looking at it. */
export interface LabActions {
  /** move an ordered test onto the bench — POST /lab/orders/{id}/start */
  accept: boolean;
  /** type in, or correct, the analytes — POST /lab/orders/{id}/results */
  enterResults: boolean;
  /** release the result into the patient record — PATCH status=verified */
  verify: boolean;
  /** file or remove a scan, a printout, a signed report */
  attach: boolean;
}

/**
 * Each answer is the order's state and the permission the API's route asks
 * for (`lab:result` for the bench, `lab:verify` for release), so a button is
 * only shown to someone the server would let through. UX only — the server's
 * guard is the enforcement.
 */
export function labActions(status: LabOrderStatus, can: (permission: string) => boolean): LabActions {
  const bench = can("lab:result");
  return {
    accept: status === "ordered" && bench,
    enterResults: (status === "pending" || status === "resulted") && bench,
    verify: status === "resulted" && can("lab:verify"),
    attach: status !== "verified" && bench,
  };
}
