import { SubscriptionPlan } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tenantId?: string;

  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;
}
