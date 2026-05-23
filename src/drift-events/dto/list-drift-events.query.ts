import { DriftStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListDriftEventsQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsEnum(DriftStatus)
  status?: DriftStatus;

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
