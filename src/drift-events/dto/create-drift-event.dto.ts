import { DriftStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateDriftEventDto {
  @IsString()
  @MaxLength(120)
  tenantId!: string;

  @IsString()
  @MaxLength(120)
  sku!: string;

  @IsString()
  @MaxLength(120)
  locationId!: string;

  @IsInt()
  @Min(0)
  omsAvailable!: number;

  @IsInt()
  @Min(0)
  channelAvailable!: number;

  @IsOptional()
  @IsEnum(DriftStatus)
  status?: DriftStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
