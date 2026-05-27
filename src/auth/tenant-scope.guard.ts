import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

type HeaderMap = Record<string, string | string[] | undefined>;
type TenantScopedRequest = {
  headers: HeaderMap;
  body?: unknown;
  query?: unknown;
  tenantScope?: {
    tenantId?: string;
  };
};

@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.STOCKSHIELD_TENANT_SCOPE_DISABLED === "true") {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantScopedRequest>();
    const tenantIds = this.extractTenantIds(request);
    const uniqueTenantIds = [...new Set(tenantIds)];

    if (uniqueTenantIds.length > 1) {
      throw new ForbiddenException("Tenant scope mismatch between request headers and payload");
    }

    if (process.env.STOCKSHIELD_TENANT_SCOPE_REQUIRED === "true" && uniqueTenantIds.length === 0) {
      throw new BadRequestException("Tenant scope is required for this admin request");
    }

    const allowedTenantIds = this.allowedTenantIds();
    if (allowedTenantIds.size > 0) {
      for (const tenantId of uniqueTenantIds) {
        if (!allowedTenantIds.has(tenantId)) {
          throw new ForbiddenException(`Tenant ${tenantId} is not allowed for this service token`);
        }
      }
    }

    request.tenantScope = {
      tenantId: uniqueTenantIds[0],
    };

    return true;
  }

  private extractTenantIds(request: TenantScopedRequest) {
    return [
      ...this.valuesFrom(request.headers["x-stockshield-tenant-id"]),
      ...this.valuesFrom(this.tenantIdFromObject(request.query)),
      ...this.valuesFrom(this.tenantIdFromObject(request.body)),
    ];
  }

  private tenantIdFromObject(value: unknown) {
    if (!value || typeof value !== "object" || !("tenantId" in value)) {
      return undefined;
    }

    return (value as { tenantId?: unknown }).tenantId;
  }

  private valuesFrom(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.valuesFrom(item));
    }

    if (typeof value !== "string") {
      return [];
    }

    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  private allowedTenantIds() {
    const raw = process.env.STOCKSHIELD_ALLOWED_TENANT_IDS;
    if (!raw) {
      return new Set<string>();
    }

    return new Set(
      raw
        .split(",")
        .map((tenantId) => tenantId.trim())
        .filter(Boolean),
    );
  }
}
