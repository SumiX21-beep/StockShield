import { SubscriptionPlan } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdatePlanDto {
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;
}
