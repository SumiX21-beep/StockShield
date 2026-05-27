import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SignupDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MaxLength(120)
  companyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tenantId?: string;
}
