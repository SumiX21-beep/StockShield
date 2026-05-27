import { IsOptional, IsString, MaxLength } from "class-validator";

export class IgnoreDriftEventDto {
  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  actor?: string;
}
