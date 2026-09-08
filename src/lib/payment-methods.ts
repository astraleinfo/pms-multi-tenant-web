import type { Payment } from "@/lib/types";

/** Every place in the app that records how money was taken renders from this
 *  one list, so a wording change never has to happen twice. GPay, PhonePe and
 *  every other UPI app are the same rail as a bank transfer, so they share the
 *  "upi" value rather than getting one each. */
export const PAYMENT_METHODS: Array<{ value: Payment["method"]; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI / GPay / PhonePe" },
  { value: "insurance", label: "Insurance" },
];
