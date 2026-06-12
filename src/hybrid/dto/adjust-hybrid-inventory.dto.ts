import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class AdjustHybridInventoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenantId?: string;

  @IsString()
  @MaxLength(120)
  sku!: string;

  @IsString()
  @MaxLength(120)
  locationId!: string;

  @Type(() => Number)
  @IsInt()
  physicalDelta!: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  syncExternal?: boolean;
}
