import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CreateHybridProductDto } from "./dto/create-hybrid-product.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { HybridProductsService } from "./hybrid-products.service";

@Controller("products")
export class HybridProductsController {
  constructor(private readonly products: HybridProductsService) {}

  @Post()
  create(@Body() body: CreateHybridProductDto) {
    return this.products.create(body);
  }

  @Get()
  list(@Query() query: HybridInventoryQueryDto) {
    return this.products.list(query);
  }
}
