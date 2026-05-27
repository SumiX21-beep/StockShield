import { Global, Module } from "@nestjs/common";
import { InternalAuthGuard } from "./internal-auth.guard";

@Global()
@Module({
  providers: [InternalAuthGuard],
  exports: [InternalAuthGuard],
})
export class AuthModule {}
