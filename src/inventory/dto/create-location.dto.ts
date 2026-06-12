import { IsString, MaxLength } from "class-validator";

export class CreateLocationDto {
  @IsString()
  @MaxLength(120)
  tenantId!: string;

  @IsString()
  @MaxLength(120)
  locationId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;
}
