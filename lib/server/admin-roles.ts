const OWNER_ADMIN_ROLES = new Set(["owner"]);

export function isOwnerAdminRole(role: string | null | undefined) {
  return typeof role === "string" && OWNER_ADMIN_ROLES.has(role);
}
