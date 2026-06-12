import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateProductDto {
  @IsString()
  @MaxLength(120)
  tenantId!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  skuTitle?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  safetyBuffer?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;
}
