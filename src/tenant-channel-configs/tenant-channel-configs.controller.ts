import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { InternalAuthGuard } from "../auth/internal-auth.guard";
import { CreateTenantChannelConfigDto } from "./dto/create-tenant-channel-config.dto";
import { ListTenantChannelConfigsQueryDto } from "./dto/list-tenant-channel-configs.query";
import { UpdateTenantChannelConfigDto } from "./dto/update-tenant-channel-config.dto";
import { TenantChannelConfigsService } from "./tenant-channel-configs.service";

@Controller("tenant-channel-configs")
@UseGuards(InternalAuthGuard)
export class TenantChannelConfigsController {
  constructor(private readonly configsService: TenantChannelConfigsService) {}

  @Post()
  create(@Body() body: CreateTenantChannelConfigDto) {
    return this.configsService.create(body);
  }

  @Get()
  list(@Query() query: ListTenantChannelConfigsQueryDto) {
    return this.configsService.list(query);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.configsService.findById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateTenantChannelConfigDto) {
    return this.configsService.update(id, body);
  }
}
