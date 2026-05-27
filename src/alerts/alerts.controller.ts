import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { AlertsService } from "./alerts.service";
import { ListAlertsQueryDto } from "./dto/list-alerts.query";

@Controller("v1/admin/alerts")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  list(@Query() query: ListAlertsQueryDto) {
    return this.alertsService.list(query);
  }
}
