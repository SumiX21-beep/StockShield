import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { AuthenticatedRequest } from "../auth/auth.types";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CreateReturnDto } from "./dto/create-return.dto";
import { ListInventoryQueryDto } from "./dto/list-inventory.query";
import { OrdersService } from "./orders.service";

@Controller("v1/admin/orders")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: CreateOrderDto) {
    return this.orders.create(body);
  }

  @Get()
  list(@Query() query: ListInventoryQueryDto) {
    return this.orders.list(query.tenantId);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.orders.cancel(id, request.tenantScope?.tenantId);
  }

  @Post(":id/fulfill")
  fulfill(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.orders.fulfill(id, request.tenantScope?.tenantId);
  }
}

@Controller("v1/admin/returns")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class ReturnsController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: CreateReturnDto) {
    return this.orders.createReturn(body);
  }
}
