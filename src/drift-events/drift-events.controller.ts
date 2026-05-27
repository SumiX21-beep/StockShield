import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { InternalAuthGuard } from "../auth/internal-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { CreateDriftEventDto } from "./dto/create-drift-event.dto";
import { IgnoreDriftEventDto } from "./dto/ignore-drift-event.dto";
import { ListDriftEventsQueryDto } from "./dto/list-drift-events.query";
import { SummaryDriftEventsQueryDto } from "./dto/summary-drift-events.query";
import { DriftEventsService } from "./drift-events.service";

@Controller(["drift-events", "v1/admin/drift-events"])
@UseGuards(InternalAuthGuard, TenantScopeGuard)
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
  findById(@Param("id") id: string) {
    return this.driftEventsService.findById(id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string) {
    return this.driftEventsService.retry(id);
  }

  @Post(":id/ignore")
  ignore(@Param("id") id: string, @Body() body: IgnoreDriftEventDto) {
    return this.driftEventsService.ignore(id, body);
  }
}
