import { Global, Module } from "@nestjs/common";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { InternalAuthGuard } from "./internal-auth.guard";
import { PasswordService } from "./password.service";
import { TenantScopeGuard } from "./tenant-scope.guard";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AdminAuthGuard, AuthService, InternalAuthGuard, PasswordService, TenantScopeGuard],
  exports: [AdminAuthGuard, AuthService, InternalAuthGuard, PasswordService, TenantScopeGuard],
})
export class AuthModule {}
