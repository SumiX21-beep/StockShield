import { InventoryLedgerMovementType } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class AdjustInventoryDto {
  @IsString()
  @MaxLength(120)
  tenantId!: string;

  @IsString()
  @MaxLength(120)
  sku!: string;

  @IsString()
  @MaxLength(120)
  locationId!: string;

  @IsInt()
  physicalDelta!: number;

  @IsOptional()
  @IsInt()
  safetyBuffer?: number;

  @IsOptional()
  @IsEnum(InventoryLedgerMovementType)
  movementType?: InventoryLedgerMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
