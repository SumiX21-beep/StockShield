import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CreateHybridOrderDto } from "./dto/create-hybrid-order.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { HybridOrdersService } from "./hybrid-orders.service";

@Controller("orders")
export class HybridOrdersController {
  constructor(private readonly orders: HybridOrdersService) {}

  @Post()
  create(@Body() body: CreateHybridOrderDto) {
    return this.orders.create(body);
  }

  @Get()
  list(@Query() query: HybridInventoryQueryDto) {
    return this.orders.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.orders.get(id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string) {
    return this.orders.retry(id);
  }
}
