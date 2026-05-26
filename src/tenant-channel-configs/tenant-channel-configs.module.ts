import { Module } from "@nestjs/common";
import { TenantChannelConfigsController } from "./tenant-channel-configs.controller";
import { TenantChannelConfigsService } from "./tenant-channel-configs.service";

@Module({
  controllers: [TenantChannelConfigsController],
  providers: [TenantChannelConfigsService],
})
export class TenantChannelConfigsModule {}
