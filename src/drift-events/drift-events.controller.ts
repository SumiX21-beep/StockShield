import { Body, Controller, Get, Post, Query } from "@nestjs/common";
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
}
