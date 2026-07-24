const allowedSearchHrefs = new Set([
  "/admin/orders",
  "/admin/customers",
  "/admin/products",
  "/data-center?section=after-sales"
]);

export function normalizeOwnerSearchQuery(value: string | null) {
  if (value === null) return { ok: false as const };
  const query = value.trim().normalize("NFC");
  if (query.length < 2 || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query)) {
    return { ok: false as const };
  }
  return { ok: true as const, value: query };
}

export function quotePostgrestIlikeValue(value: string) {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*");
  return `"%${escaped}%"`;
}

export function isSafeOwnerSearchHref(value: string) {
  return allowedSearchHrefs.has(value);
}
