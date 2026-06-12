import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ExternalHybridOrderDto } from "./dto/external-hybrid-order.dto";
import { HybridInventoryQueryDto } from "./dto/hybrid-inventory-query.dto";
import { WebhookInventoryUpdateDto } from "./dto/webhook-inventory-update.dto";
import { HybridExternalService } from "./hybrid-external.service";

@Controller("external")
export class HybridExternalController {
  constructor(private readonly external: HybridExternalService) {}

  @Post("orders")
  createOrder(@Body() body: ExternalHybridOrderDto) {
    return this.external.createOrder(body);
  }

  @Get("inventory")
  getInventory(@Query() query: HybridInventoryQueryDto) {
    return this.external.listInventory(query);
  }
}

@Controller("webhooks")
export class HybridWebhooksController {
  constructor(private readonly external: HybridExternalService) {}

  @Post("inventory-update")
  inventoryUpdate(@Body() body: WebhookInventoryUpdateDto) {
    return this.external.applyWebhookInventoryUpdate(body);
  }
}
