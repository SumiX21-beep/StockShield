import { IsOptional, IsString } from "class-validator";

export class MetricsQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;
}
