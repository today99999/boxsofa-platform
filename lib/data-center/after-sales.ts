export const AFTER_SALES_CASE_TYPES = [
  "return",
  "refund",
  "replacement",
  "damage",
  "delivery",
  "quality",
  "other"
] as const;

export const AFTER_SALES_CASE_STATUSES = [
  "requested",
  "reviewing",
  "approved",
  "return_in_transit",
  "received",
  "replacement_sent",
  "refunded",
  "resolved",
  "rejected"
] as const;

export type AfterSalesStatus = (typeof AFTER_SALES_CASE_STATUSES)[number];

const terminalStatuses = new Set<AfterSalesStatus>(["refunded", "resolved", "rejected"]);

const allowedTransitions: Record<Exclude<AfterSalesStatus, "refunded" | "resolved" | "rejected">, readonly AfterSalesStatus[]> = {
  requested: ["reviewing", "approved", "rejected"],
  reviewing: ["approved", "rejected"],
  approved: ["return_in_transit", "replacement_sent", "refunded", "resolved"],
  return_in_transit: ["received", "rejected"],
  received: ["replacement_sent", "refunded", "resolved"],
  replacement_sent: ["resolved"]
};

export function canTransitionAfterSalesStatus(from: AfterSalesStatus, to: AfterSalesStatus) {
  if (from === to || terminalStatuses.has(from)) return false;
  return allowedTransitions[from as keyof typeof allowedTransitions].includes(to);
}

export function eurToCents(value: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value * 100)) return null;
  return Math.round(value * 100);
}

export function centsToEur(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const cents = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(cents) ? cents / 100 : null;
}

export function createAfterSalesCaseNumber(
  now = Date.now(),
  random: () => number = Math.random
) {
  const timestamp = String(Math.max(0, Math.trunc(now))).slice(-10).padStart(10, "0");
  const entropy = Math.floor(Math.min(0.999999999, Math.max(0, random())) * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0");
  return `AS-${timestamp}-${entropy}`;
}
