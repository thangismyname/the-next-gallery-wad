/** Who an account is, for the colored card borders (admin / profile): admin wins over developer. */
export type UserKind = "admin" | "developer" | "user";

export const userKind = (u: { role?: string | null; isDeveloper?: boolean }): UserKind =>
  u.role === "admin" ? "admin" : u.isDeveloper ? "developer" : "user";
