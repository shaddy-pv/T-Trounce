/** Role checks shared by server code and route guards. */

export interface RoleCarrier {
  role?: string;
  isAdmin?: boolean;
}

export function isFaculty(user: RoleCarrier | null | undefined): boolean {
  return Boolean(user && (user.role === "teacher" || user.role === "admin" || user.isAdmin));
}

export function isAdmin(user: RoleCarrier | null | undefined): boolean {
  return Boolean(user && (user.role === "admin" || user.isAdmin));
}
