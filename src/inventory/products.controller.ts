import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListInventoryQueryDto } from "./dto/list-inventory.query";
import { InventoryCatalogService } from "./inventory-catalog.service";

@Controller("v1/admin/products")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class ProductsController {
  constructor(private readonly catalog: InventoryCatalogService) {}

  @Post()
  create(@Body() body: CreateProductDto) {
    return this.catalog.createProduct(body);
  }

  @Get()
  list(@Query() query: ListInventoryQueryDto) {
    return this.catalog.listProducts(query.tenantId);
  }
}
