import { UserRole } from "@prisma/client";

export type AuthPrincipal = {
  type: "jwt" | "internal";
  userId?: string;
  email?: string;
  name?: string;
  tenantId?: string;
  role?: UserRole;
};

export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
  auth?: AuthPrincipal;
  tenantScope?: {
    tenantId?: string;
  };
};
