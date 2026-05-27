import { Global, Module } from "@nestjs/common";
import { InternalAuthGuard } from "./internal-auth.guard";
import { TenantScopeGuard } from "./tenant-scope.guard";

@Global()
@Module({
  providers: [InternalAuthGuard, TenantScopeGuard],
  exports: [InternalAuthGuard, TenantScopeGuard],
})
export class AuthModule {}
