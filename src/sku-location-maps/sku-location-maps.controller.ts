import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { CreateSkuLocationMapDto } from "./dto/create-sku-location-map.dto";
import { ListSkuLocationMapsQueryDto } from "./dto/list-sku-location-maps.query";
import { UpdateSkuLocationMapDto } from "./dto/update-sku-location-map.dto";
import { SkuLocationMapsService } from "./sku-location-maps.service";

@Controller(["sku-location-maps", "v1/admin/sku-location-maps"])
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class SkuLocationMapsController {
  constructor(private readonly mapsService: SkuLocationMapsService) {}

  @Post()
  create(@Body() body: CreateSkuLocationMapDto) {
    return this.mapsService.create(body);
  }

  @Get()
  list(@Query() query: ListSkuLocationMapsQueryDto) {
    return this.mapsService.list(query);
  }

  @Get(":id")
  findById(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.mapsService.findById(id, request.tenantScope?.tenantId);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateSkuLocationMapDto, @Req() request: AuthenticatedRequest) {
    return this.mapsService.update(id, body, request.tenantScope?.tenantId);
  }
}
