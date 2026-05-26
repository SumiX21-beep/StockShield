import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateSkuLocationMapDto {
  @IsString()
  @MaxLength(120)
  tenantId!: string;

  @IsString()
  @MaxLength(120)
  sku!: string;

  @IsString()
  @MaxLength(120)
  omsLocationId!: string;

  @IsString()
  @MaxLength(120)
  shopifyInventoryItemId!: string;

  @IsString()
  @MaxLength(120)
  shopifyLocationId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
