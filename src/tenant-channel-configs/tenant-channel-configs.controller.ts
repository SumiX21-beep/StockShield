import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { CreateTenantChannelConfigDto } from "./dto/create-tenant-channel-config.dto";
import { ListTenantChannelConfigsQueryDto } from "./dto/list-tenant-channel-configs.query";
import { UpdateTenantChannelConfigDto } from "./dto/update-tenant-channel-config.dto";
import { TenantChannelConfigsService } from "./tenant-channel-configs.service";

@Controller(["tenant-channel-configs", "v1/admin/tenant-channel-configs"])
@UseGuards(AdminAuthGuard, TenantScopeGuard)
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
  findById(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.configsService.findById(id, request.tenantScope?.tenantId);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateTenantChannelConfigDto, @Req() request: AuthenticatedRequest) {
    return this.configsService.update(id, body, request.tenantScope?.tenantId);
  }
}
