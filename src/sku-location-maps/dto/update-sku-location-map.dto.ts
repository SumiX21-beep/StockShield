import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateSkuLocationMapDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  shopifyInventoryItemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  shopifyLocationId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
