import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class HybridMetricsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(3600)
  windowSeconds?: number;
}
