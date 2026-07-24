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

export type AfterSalesCursor = {
  createdAt: string;
  id: string;
};

const terminalStatuses = new Set<AfterSalesStatus>(["refunded", "resolved", "rejected"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalDecimalPattern = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;
const caseSearchPattern = /^[A-Za-z0-9-]{1,80}$/;
const utcTimestampPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::?00)?)$/;
const maxRefundCents = 999_999_999_999;
const numericRefundTolerance = 0.000000000001;

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

export function parseRefundAmountEur(value: unknown): { ok: true; cents: number } | { ok: false } {
  if (typeof value === "string") {
    if (!canonicalDecimalPattern.test(value)) return { ok: false };
    const [wholePart, fractionPart = ""] = value.split(".");
    const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, "0"));
    return Number.isSafeInteger(cents) && cents <= maxRefundCents ? { ok: true, cents } : { ok: false };
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maxRefundCents / 100) {
    return { ok: false };
  }

  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && Math.abs(value - cents / 100) <= numericRefundTolerance
    ? { ok: true, cents }
    : { ok: false };
}

export function eurToCents(value: unknown) {
  const parsed = parseRefundAmountEur(value);
  return parsed.ok ? parsed.cents : null;
}

export function centsToEur(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const cents = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(cents) ? cents / 100 : null;
}

export function isFutureAfterSalesDueAt(value: string, now = Date.now()) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now;
}

export function madridLocalDateTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const desiredUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let candidate = desiredUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute)
    );
    candidate += desiredUtc - representedUtc;
  }

  const result = new Date(candidate);
  if (Number.isNaN(result.getTime())) return null;
  const parts = formatter.formatToParts(result);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const roundTrip = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  return roundTrip === value ? result.toISOString() : null;
}

export function afterSalesMutationStatus(errorCode: unknown) {
  switch (errorCode) {
    case "not_found":
      return 404;
    case "conflict":
    case "23505":
      return 409;
    case "invalid_input":
    case "invalid_due_at":
    case "invalid_refund_amount":
    case "invalid_transition":
    case "refund_not_verified":
    case "22023":
      return 400;
    case "42501":
      return 403;
    default:
      return 500;
  }
}

export function normalizeAfterSalesCaseSearch(value: string | null) {
  if (value === null) return { ok: true as const, value: null };
  const search = value.trim();
  return caseSearchPattern.test(search)
    ? { ok: true as const, value: search }
    : { ok: false as const, value: null };
}

function parseAfterSalesCursor(cursor: AfterSalesCursor) {
  if (!uuidPattern.test(cursor.id)) return null;
  const match = utcTimestampPattern.exec(cursor.createdAt);
  if (!match) return null;
  const createdAt = new Date(cursor.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString().slice(0, 19) !== match[1]) return null;
  const microseconds = BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  const wholeSecond = new Date(`${match[1]}Z`);
  return {
    createdAt: cursor.createdAt,
    id: cursor.id.toLowerCase(),
    sortKey: BigInt(wholeSecond.getTime() / 1000) * 1_000_000n + microseconds
  };
}

export function encodeAfterSalesCursor(cursor: AfterSalesCursor) {
  const parsed = parseAfterSalesCursor(cursor);
  if (!parsed) throw new TypeError("Cannot encode an invalid after-sales cursor.");
  return Buffer.from(JSON.stringify({ v: 1, createdAt: parsed.createdAt, id: parsed.id }), "utf8").toString("base64url");
}

export function decodeAfterSalesCursor(value: string) {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1 || Object.keys(record).length !== 3 || typeof record.createdAt !== "string" || typeof record.id !== "string") {
      return null;
    }
    const parsedCursor = parseAfterSalesCursor({ createdAt: record.createdAt, id: record.id });
    return parsedCursor ? { createdAt: parsedCursor.createdAt, id: parsedCursor.id } : null;
  } catch {
    return null;
  }
}

export function buildAfterSalesCursorPostgrestFilter(cursor: AfterSalesCursor) {
  const parsed = parseAfterSalesCursor(cursor);
  if (!parsed) throw new TypeError("Cannot build a filter for an invalid after-sales cursor.");
  return `created_at.lt.${parsed.createdAt},and(created_at.eq.${parsed.createdAt},id.lt.${parsed.id})`;
}

export function isAfterSalesRowBeforeCursor(row: AfterSalesCursor, cursor: AfterSalesCursor) {
  const parsedRow = parseAfterSalesCursor(row);
  const parsedCursor = parseAfterSalesCursor(cursor);
  if (!parsedRow || !parsedCursor) return false;
  return parsedRow.sortKey < parsedCursor.sortKey
    || (parsedRow.sortKey === parsedCursor.sortKey && parsedRow.id < parsedCursor.id);
}

export function pageAfterSalesRows<T extends AfterSalesCursor>(rows: readonly T[], cursor: AfterSalesCursor | null, limit: number) {
  const sorted = [...rows]
    .filter((row) => cursor === null || isAfterSalesRowBeforeCursor(row, cursor))
    .sort((left, right) => {
      const parsedLeft = parseAfterSalesCursor(left);
      const parsedRight = parseAfterSalesCursor(right);
      if (!parsedLeft || !parsedRight) throw new TypeError("After-sales rows require a valid UTC cursor shape.");
      return parsedLeft.sortKey === parsedRight.sortKey
        ? parsedRight.id.localeCompare(parsedLeft.id)
        : parsedLeft.sortKey > parsedRight.sortKey ? -1 : 1;
    });
  const pageRows = sorted.slice(0, limit);
  const nextCursor = sorted.length > limit && pageRows.length > 0
    ? encodeAfterSalesCursor(pageRows[pageRows.length - 1])
    : null;
  return { rows: pageRows, nextCursor };
}

export function formatAfterSalesCaseNumber(createdAt: Date, sequence: bigint | number) {
  const sequenceText = typeof sequence === "bigint" ? sequence.toString() : String(sequence);
  if (!Number.isInteger(createdAt.getTime()) || !/^\d+$/.test(sequenceText) || BigInt(sequenceText) < 1n) {
    throw new TypeError("After-sales case numbers require a valid timestamp and positive sequence.");
  }
  const timestamp = [
    createdAt.getUTCFullYear().toString().padStart(4, "0"),
    (createdAt.getUTCMonth() + 1).toString().padStart(2, "0"),
    createdAt.getUTCDate().toString().padStart(2, "0"),
    createdAt.getUTCHours().toString().padStart(2, "0"),
    createdAt.getUTCMinutes().toString().padStart(2, "0"),
    createdAt.getUTCSeconds().toString().padStart(2, "0"),
    createdAt.getUTCMilliseconds().toString().padStart(3, "0")
  ].join("");
  return `AS-${timestamp}-${sequenceText.padStart(8, "0")}`;
}
