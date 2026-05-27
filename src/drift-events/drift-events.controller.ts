import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { CreateDriftEventDto } from "./dto/create-drift-event.dto";
import { IgnoreDriftEventDto } from "./dto/ignore-drift-event.dto";
import { ListDriftEventsQueryDto } from "./dto/list-drift-events.query";
import { SummaryDriftEventsQueryDto } from "./dto/summary-drift-events.query";
import { DriftEventsService } from "./drift-events.service";

@Controller(["drift-events", "v1/admin/drift-events"])
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class DriftEventsController {
  constructor(private readonly driftEventsService: DriftEventsService) {}

  @Post()
  create(@Body() body: CreateDriftEventDto) {
    return this.driftEventsService.create(body);
  }

  @Get()
  list(@Query() query: ListDriftEventsQueryDto) {
    return this.driftEventsService.list(query);
  }

  @Get("summary")
  summary(@Query() query: SummaryDriftEventsQueryDto) {
    return this.driftEventsService.summary(query);
  }

  @Get(":id")
  findById(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.driftEventsService.findById(id, request.tenantScope?.tenantId);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.driftEventsService.retry(id, request.tenantScope?.tenantId);
  }

  @Post(":id/ignore")
  ignore(@Param("id") id: string, @Body() body: IgnoreDriftEventDto, @Req() request: AuthenticatedRequest) {
    return this.driftEventsService.ignore(id, body, request);
  }
}
