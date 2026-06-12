import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { TenantScopeGuard } from "../auth/tenant-scope.guard";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { ListInventoryQueryDto } from "./dto/list-inventory.query";
import { AvailableToPromiseService } from "./available-to-promise.service";
import { InventoryLedgerService } from "./inventory-ledger.service";

@Controller("v1/admin/inventory")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class InventoryController {
  constructor(
    private readonly atp: AvailableToPromiseService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  @Get()
  list(@Query() query: ListInventoryQueryDto) {
    return this.atp.listInventory(query);
  }

  @Get("ledger")
  listLedger(@Query() query: ListInventoryQueryDto) {
    return this.ledger.listLedger(query);
  }

  @Post("adjustments")
  adjust(@Body() body: AdjustInventoryDto) {
    return this.ledger.adjust(body);
  }
}

@Controller("v1/admin/inventory-truth")
@UseGuards(AdminAuthGuard, TenantScopeGuard)
export class InventoryTruthController {
  constructor(private readonly atp: AvailableToPromiseService) {}

  @Get()
  truth(@Query() query: ListInventoryQueryDto) {
    return this.atp.inventoryTruth(query);
  }
}
