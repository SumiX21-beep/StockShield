import { IsOptional, IsString } from "class-validator";

export class SummaryDriftEventsQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;
}
