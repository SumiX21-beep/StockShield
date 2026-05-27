import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthenticatedRequest } from "./auth.types";
import { AuthService } from "./auth.service";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    if (process.env.STOCKSHIELD_AUTH_DISABLED === "true") {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearerToken = this.extractBearerToken(request.headers);
    if (bearerToken) {
      if (this.authService.internalTokenMatches(bearerToken)) {
        request.auth = { type: "internal" };
        return true;
      }

      request.auth = this.principalFromJwt(bearerToken);
      return true;
    }

    const queryToken = this.queryToken(request);
    if (queryToken) {
      request.auth = this.principalFromJwt(queryToken);
      return true;
    }

    const headerToken = this.first(request.headers["x-stockshield-token"])?.trim();
    if (headerToken && this.authService.internalTokenMatches(headerToken)) {
      request.auth = { type: "internal" };
      return true;
    }

    throw new UnauthorizedException("Admin API requires a JWT or internal service token");
  }

  private principalFromJwt(token: string) {
    const payload = this.authService.verifyAccessToken(token);
    return {
      type: "jwt" as const,
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      tenantId: payload.tenantId,
      role: payload.role as UserRole,
    };
  }

  private extractBearerToken(headers: AuthenticatedRequest["headers"]) {
    const authHeader = this.first(headers.authorization);
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice("Bearer ".length).trim();
    }

    return undefined;
  }

  private queryToken(request: AuthenticatedRequest) {
    const value = request.query?.access_token;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }
}
