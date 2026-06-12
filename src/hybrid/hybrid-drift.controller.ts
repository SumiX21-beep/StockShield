import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { FixHybridDriftDto } from "./dto/fix-hybrid-drift.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { HybridDriftService } from "./hybrid-drift-core.service";

@Controller("drift")
export class HybridDriftController {
  constructor(private readonly drift: HybridDriftService) {}

  @Get()
  list(@Query() query: HybridInventoryQueryDto) {
    return this.drift.list(query);
  }

  @Post("run")
  run(@Query() query: HybridInventoryQueryDto) {
    return this.drift.detectAll({ tenantId: query.tenantId });
  }

  @Post(":id/fix")
  fix(@Param("id") id: string, @Body() body: FixHybridDriftDto) {
    return this.drift.queueFix(id, body);
  }
}
