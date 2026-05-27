import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { InternalAuthGuard } from "../auth/internal-auth.guard";
import { CreateSkuLocationMapDto } from "./dto/create-sku-location-map.dto";
import { ListSkuLocationMapsQueryDto } from "./dto/list-sku-location-maps.query";
import { UpdateSkuLocationMapDto } from "./dto/update-sku-location-map.dto";
import { SkuLocationMapsService } from "./sku-location-maps.service";

@Controller("sku-location-maps")
@UseGuards(InternalAuthGuard)
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
  findById(@Param("id") id: string) {
    return this.mapsService.findById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateSkuLocationMapDto) {
    return this.mapsService.update(id, body);
  }
}
