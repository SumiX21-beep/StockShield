import { TenantChannelStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateTenantChannelConfigDto {
  @IsString()
  @MaxLength(120)
  tenantId!: string;

  @IsString()
  @MaxLength(255)
  shopDomain!: string;

  @IsString()
  @MaxLength(500)
  accessToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  apiVersion?: string;

  @IsOptional()
  @IsEnum(TenantChannelStatus)
  status?: TenantChannelStatus;
}
