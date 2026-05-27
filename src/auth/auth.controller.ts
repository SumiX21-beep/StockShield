import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AuthenticatedRequest } from "./auth.types";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";

@Controller("v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post("signup")
  signup(@Body() body: SignupDto) {
    return this.authService.signup(body);
  }

  @Get("me")
  @UseGuards(AdminAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    if (request.auth?.type !== "jwt" || !request.auth.userId || !request.auth.tenantId) {
      return {
        user: null,
        tenantId: null,
        role: "internal",
      };
    }

    return this.authService.me(request.auth.userId, request.auth.tenantId);
  }
}
