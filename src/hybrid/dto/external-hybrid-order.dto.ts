import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class ExternalHybridOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  coreOrderId?: string;

  @IsString()
  @MaxLength(120)
  sku!: string;

  @IsString()
  @MaxLength(120)
  locationId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
