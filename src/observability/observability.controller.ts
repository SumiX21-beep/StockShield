import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { InternalAuthGuard } from "../auth/internal-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { DlqQueryDto } from "./dto/dlq-query.dto";
import { MetricsQueryDto } from "./dto/metrics-query.dto";
import { ObservabilityService } from "./observability.service";

@Controller("v1/admin")
@UseGuards(InternalAuthGuard, TenantScopeGuard)
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get("metrics")
  metrics(@Query() query: MetricsQueryDto) {
    return this.observabilityService.metrics(query);
  }

  @Get("dlq")
  dlq(@Query() query: DlqQueryDto) {
    return this.observabilityService.dlq(query);
  }
}
