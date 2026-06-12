import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { CreateLocationDto } from "./dto/create-location.dto";
import { ListInventoryQueryDto } from "./dto/list-inventory.query";
import { InventoryCatalogService } from "./inventory-catalog.service";

@Controller("v1/admin/locations")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class LocationsController {
  constructor(private readonly catalog: InventoryCatalogService) {}

  @Post()
  create(@Body() body: CreateLocationDto) {
    return this.catalog.createLocation(body);
  }

  @Get()
  list(@Query() query: ListInventoryQueryDto) {
    return this.catalog.listLocations(query.tenantId);
  }
}
