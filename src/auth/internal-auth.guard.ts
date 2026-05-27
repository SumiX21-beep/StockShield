import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "crypto";

type HeaderMap = Record<string, string | string[] | undefined>;

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.STOCKSHIELD_AUTH_DISABLED === "true") {
      return true;
    }

    const expectedToken = process.env.STOCKSHIELD_INTERNAL_API_TOKEN;
    if (!expectedToken) {
      throw new UnauthorizedException("Internal API token is not configured");
    }

    const request = context.switchToHttp().getRequest<{ headers: HeaderMap }>();
    const suppliedToken = this.extractToken(request.headers);
    if (!suppliedToken || !this.constantTimeEqual(suppliedToken, expectedToken)) {
      throw new UnauthorizedException("Invalid internal API token");
    }

    return true;
  }

  private extractToken(headers: HeaderMap) {
    const authHeader = this.first(headers.authorization);
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice("Bearer ".length).trim();
    }

    return this.first(headers["x-stockshield-token"])?.trim();
  }

  private first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }

  private constantTimeEqual(actual: string, expected: string) {
    const actualBuffer = Buffer.from(actual, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
