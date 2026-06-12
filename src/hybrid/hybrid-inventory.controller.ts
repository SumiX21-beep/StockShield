import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { AdjustHybridInventoryDto } from "./dto/adjust-hybrid-inventory.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { HybridInventoryService } from "./hybrid-inventory.service";

@Controller("inventory")
export class HybridInventoryController {
  constructor(private readonly inventory: HybridInventoryService) {}

  @Post("adjust")
  adjust(@Body() body: AdjustHybridInventoryDto) {
    return this.inventory.adjust(body);
  }

  @Get()
  list(@Query() query: HybridInventoryQueryDto) {
    return this.inventory.list(query);
  }
}
