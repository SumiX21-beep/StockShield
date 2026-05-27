import { DriftStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";

export class ListDriftEventsQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(DriftStatus)
  status?: DriftStatus;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
