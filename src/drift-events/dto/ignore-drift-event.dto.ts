import { IsOptional, IsString, MaxLength } from "class-validator";

export class IgnoreDriftEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenantId?: string;

  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  actor?: string;
}
