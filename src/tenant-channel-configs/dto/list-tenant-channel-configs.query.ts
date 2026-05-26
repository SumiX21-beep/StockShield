import { TenantChannelStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class ListTenantChannelConfigsQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(TenantChannelStatus)
  status?: TenantChannelStatus;
}
