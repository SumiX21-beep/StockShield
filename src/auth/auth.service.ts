import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";
import { PasswordService } from "./password.service";

type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
  iat: number;
  exp: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async signup(input: SignupDto) {
    const email = input.email.trim().toLowerCase();
    const tenantId = this.slug(input.tenantId ?? input.companyName);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenant.create({
          data: {
            id: tenantId,
            name: input.companyName.trim(),
          },
        });
        const user = await tx.user.create({
          data: {
            email,
            name: input.name.trim(),
            passwordHash: await this.passwordService.hash(input.password),
            role: "ADMIN",
          },
        });
        await tx.tenantMembership.create({
          data: {
            userId: user.id,
            tenantId,
            role: "ADMIN",
          },
        });
        await tx.tenantBillingSubscription.create({
          data: {
            tenantId,
            plan: "FREE",
            status: "TRIALING",
            monthlyEventLimit: 100,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A workspace or user with these details already exists");
      }
      throw error;
    }

    return this.login({
      email,
      password: input.password,
      tenantId,
    });
  }

  async login(input: LoginDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!user || !(await this.passwordService.verify(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const membership = input.tenantId
      ? user.memberships.find((item) => item.tenantId === input.tenantId)
      : user.memberships[0];

    if (!membership) {
      throw new UnauthorizedException("User is not assigned to the requested tenant");
    }

    const expiresIn = this.jwtExpiresSeconds();
    const token = this.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      tenantId: membership.tenantId,
      role: membership.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresIn,
    });

    return {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      tenantId: membership.tenantId,
      role: membership.role,
    };
  }

  async me(userId: string, tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: true,
      },
    });

    if (!user || !user.memberships.some((membership) => membership.tenantId === tenantId)) {
      throw new UnauthorizedException("Authenticated user no longer has tenant access");
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      tenantId,
      role: user.memberships.find((membership) => membership.tenantId === tenantId)?.role ?? user.role,
      tenants: user.memberships.map((membership) => ({
        tenantId: membership.tenantId,
        role: membership.role,
      })),
    };
  }

  verifyAccessToken(token: string): JwtPayload {
    const [encodedHeader, encodedPayload, signature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException("Invalid access token");
    }

    const expectedSignature = this.signingInputSignature(`${encodedHeader}.${encodedPayload}`);
    if (!this.constantTimeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException("Invalid access token signature");
    }

    let payload: JwtPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as JwtPayload;
    } catch {
      throw new UnauthorizedException("Invalid access token payload");
    }
    if (!payload.sub || !payload.tenantId || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("Access token is expired or incomplete");
    }

    return payload;
  }

  internalTokenMatches(token: string) {
    const expectedToken = process.env.STOCKSHIELD_INTERNAL_API_TOKEN;
    if (!expectedToken) {
      return false;
    }

    return this.constantTimeEqual(token, expectedToken);
  }

  private sign(payload: JwtPayload) {
    const header = this.base64UrlJson({
      alg: "HS256",
      typ: "JWT",
    });
    const encodedPayload = this.base64UrlJson(payload);
    const signingInput = `${header}.${encodedPayload}`;
    return `${signingInput}.${this.signingInputSignature(signingInput)}`;
  }

  private signingInputSignature(signingInput: string) {
    return createHmac("sha256", this.jwtSecret()).update(signingInput).digest("base64url");
  }

  private jwtSecret() {
    const secret =
      process.env.STOCKSHIELD_JWT_SECRET ??
      process.env.STOCKSHIELD_INTERNAL_API_TOKEN ??
      process.env.STOCKSHIELD_ENCRYPTION_KEY;

    if (!secret) {
      throw new UnauthorizedException("JWT secret is not configured");
    }

    return secret;
  }

  private jwtExpiresSeconds() {
    const value = Number(process.env.STOCKSHIELD_JWT_EXPIRES_SECONDS ?? 43_200);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 43_200;
  }

  private base64UrlJson(value: unknown) {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  }

  private slug(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

    if (!slug) {
      throw new ConflictException("Workspace id could not be generated");
    }

    return slug;
  }

  private constantTimeEqual(actual: string, expected: string) {
    const actualBuffer = Buffer.from(actual, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
