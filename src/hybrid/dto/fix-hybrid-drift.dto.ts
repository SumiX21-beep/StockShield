import { IsIn, IsOptional } from "class-validator";

export type HybridDriftFixStrategy = "INTERNAL_TO_EXTERNAL" | "EXTERNAL_TO_INTERNAL";

export class FixHybridDriftDto {
  @IsOptional()
  @IsIn(["INTERNAL_TO_EXTERNAL", "EXTERNAL_TO_INTERNAL"])
  strategy?: HybridDriftFixStrategy;
}
