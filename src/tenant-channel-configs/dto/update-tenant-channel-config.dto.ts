import { TenantChannelStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTenantChannelConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  shopDomain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  apiVersion?: string;

  @IsOptional()
  @IsEnum(TenantChannelStatus)
  status?: TenantChannelStatus;
}
