/** Role checks shared by server code and route guards. */

export interface RoleCarrier {
  role?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

export function isFaculty(user: RoleCarrier | null | undefined): boolean {
  return Boolean(
    user &&
      (user.role === "teacher" ||
        user.role === "admin" ||
        user.role === "super_admin" ||
        user.isAdmin ||
        user.isSuperAdmin),
  );
}

export function isAdmin(user: RoleCarrier | null | undefined): boolean {
  return Boolean(
    user &&
      (user.role === "admin" ||
        user.role === "super_admin" ||
        user.isAdmin ||
        user.isSuperAdmin),
  );
}

export function isSuperAdmin(user: RoleCarrier | null | undefined): boolean {
  return Boolean(
    user && (user.role === "super_admin" || user.isSuperAdmin),
  );
}
