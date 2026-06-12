import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { ListSyncJobsQueryDto } from "./dto/list-sync-jobs.query";
import { InventorySyncOutboxService } from "./inventory-sync-outbox.service";

@Controller("v1/admin/sync-jobs")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class SyncJobsController {
  constructor(private readonly syncOutbox: InventorySyncOutboxService) {}

  @Get()
  list(@Query() query: ListSyncJobsQueryDto) {
    return this.syncOutbox.list(query);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.syncOutbox.retry(id, request.tenantScope?.tenantId);
  }
}
