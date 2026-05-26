import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class TriggerScanDto {
  @IsString()
  @MaxLength(120)
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsISO8601()
  windowStart?: string;

  @IsOptional()
  @IsISO8601()
  windowEnd?: string;
}
