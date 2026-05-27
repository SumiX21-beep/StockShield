import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { ListRiskSkusQueryDto } from "./dto/list-risk-skus.query";
import { RiskService } from "./risk.service";

@Controller("v1/admin/risk-skus")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get()
  list(@Query() query: ListRiskSkusQueryDto) {
    return this.riskService.list(query);
  }
}
