import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { SummaryDriftEventsQueryDto } from "./dto/summary-drift-events.query";
import { DriftEventsService } from "./drift-events.service";

@Controller("v1/admin/summary")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class DriftSummaryController {
  constructor(private readonly driftEventsService: DriftEventsService) {}

  @Get()
  summary(@Query() query: SummaryDriftEventsQueryDto) {
    return this.driftEventsService.summary(query);
  }
}
