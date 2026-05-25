import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CreateDriftEventDto } from "./dto/create-drift-event.dto";
import { ListDriftEventsQueryDto } from "./dto/list-drift-events.query";
import { DriftEventsService } from "./drift-events.service";

@Controller("drift-events")
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

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.driftEventsService.findById(id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string) {
    return this.driftEventsService.retry(id);
  }
}
