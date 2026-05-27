import { Controller, Query, Req, Sse, UseGuards } from "@nestjs/common";
import { Observable } from "rxjs";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { LiveEventsService } from "./live-events.service";

@Controller("v1/admin/live")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class LiveEventsController {
  constructor(private readonly liveEventsService: LiveEventsService) {}

  @Sse("drift-events")
  driftEvents(@Query("tenantId") tenantId: string | undefined, @Req() request: AuthenticatedRequest): Observable<MessageEvent> {
    return this.liveEventsService.stream(tenantId ?? request.tenantScope?.tenantId);
  }
}
