import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class WebhookInventoryUpdateDto {
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
  @Min(0)
  availableQuantity!: number;
}
